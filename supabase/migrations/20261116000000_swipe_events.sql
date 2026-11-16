-- Append-only point-in-time history; no legacy backfill. Undo logs nothing.
-- Rows cascade with the profile/job, matching the other tables: deleting an
-- account removes its training history too.
create table public.swipe_events (
  id bigserial primary key,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  direction text not null check (direction in ('left', 'right')),
  created_at timestamptz not null default now(),
  target_title text,
  candidate_skills text[],
  target_salary_min integer,
  target_salary_max integer,
  job_title text,
  job_skills text[],
  is_remote boolean,
  job_salary_min integer,
  job_salary_max integer,
  embedding_similarity double precision,
  model_version text
);
create index swipe_events_candidate_created_idx
  on public.swipe_events (candidate_id, created_at);
create index swipe_events_job_idx on public.swipe_events (job_id);

alter table public.swipe_events enable row level security;
revoke all on public.swipe_events from anon, authenticated;
revoke all on sequence public.swipe_events_id_seq from anon, authenticated;
grant select on public.swipe_events to authenticated;
create policy swipe_events_select_own on public.swipe_events
  for select to authenticated using (candidate_id = (select auth.uid()));

create function public.capture_swipe_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.swipe_events (
    candidate_id, job_id, direction, target_title, candidate_skills,
    target_salary_min, target_salary_max, job_title, job_skills,
    is_remote, job_salary_min, job_salary_max, embedding_similarity
  )
  select new.candidate_id, new.job_id, new.direction::text,
    p.target_title, p.skills, p.target_salary_min, p.target_salary_max,
    j.title, j.required_skills, j.is_remote, j.salary_min, j.salary_max,
    case when p.embedding is null or j.embedding is null then null
         else 1 - (j.embedding operator(extensions.<=>) p.embedding) end
  from public.profiles p cross join public.jobs j
  where p.id = new.candidate_id and j.id = new.job_id;
  return new;
end;
$$;
revoke all on function public.capture_swipe_event() from public, anon, authenticated;
-- Same-direction upserts record a new action; applied_at-only updates do not.
-- DELETE (including undo) neither logs nor deletes events.
create trigger swipes_capture_event
  after insert or update of direction on public.swipes
  for each row execute function public.capture_swipe_event();
