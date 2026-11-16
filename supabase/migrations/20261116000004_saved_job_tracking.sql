-- =============================================================================
-- Application tracker for saved jobs: a stage past "applied" and a private note.
--
-- Kept out of public.swipes on purpose: a job's recruiter can read swipes on
-- their job, and these notes are private to the candidate. Only the candidate
-- can read their rows; all writes go through the RPCs below.
--
-- swipes.applied_at stays the source of truth for "has applied" (the ML export
-- reads it); the stage RPC keeps it in sync.
-- =============================================================================

create table public.saved_job_tracking (
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  job_id       uuid not null references public.jobs (id) on delete cascade,
  stage        text not null default 'saved'
    check (stage in ('saved', 'applied', 'interviewing', 'offer', 'rejected')),
  note         text not null default '' check (char_length(note) <= 1000),
  updated_at   timestamptz not null default now(),
  primary key (candidate_id, job_id)
);

alter table public.saved_job_tracking enable row level security;

create policy saved_job_tracking_select_own on public.saved_job_tracking
  for select to authenticated using (candidate_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Move a saved job to a stage.
-- -----------------------------------------------------------------------------
create function public.set_saved_job_stage(p_job_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_stage is null or p_stage not in ('saved', 'applied', 'interviewing', 'offer', 'rejected') then
    raise exception 'invalid stage' using errcode = '22023';
  end if;

  update public.swipes s
  set applied_at = case when p_stage = 'saved' then null else coalesce(s.applied_at, now()) end
  where s.candidate_id = auth.uid()
    and s.job_id = p_job_id
    and s.direction = 'right';
  if not found then
    raise exception 'saved job not found' using errcode = 'P0002';
  end if;

  insert into public.saved_job_tracking as t (candidate_id, job_id, stage)
  values (auth.uid(), p_job_id, p_stage)
  on conflict (candidate_id, job_id)
  do update set stage = excluded.stage, updated_at = now();
end $$;

-- -----------------------------------------------------------------------------
-- Private note on a saved job. Empty string clears it.
-- -----------------------------------------------------------------------------
create function public.set_saved_job_note(p_job_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_applied timestamptz;
begin
  if char_length(v_note) > 1000 then
    raise exception 'note too long' using errcode = '22001';
  end if;

  select s.applied_at into v_applied
  from public.swipes s
  where s.candidate_id = auth.uid()
    and s.job_id = p_job_id
    and s.direction = 'right';
  if not found then
    raise exception 'saved job not found' using errcode = 'P0002';
  end if;

  -- A first note on a job marked applied before stages existed starts at 'applied'.
  insert into public.saved_job_tracking as t (candidate_id, job_id, stage, note)
  values (auth.uid(), p_job_id, case when v_applied is null then 'saved' else 'applied' end, v_note)
  on conflict (candidate_id, job_id)
  do update set note = excluded.note, updated_at = now();
end $$;

-- -----------------------------------------------------------------------------
-- Older clients still call set_saved_job_applied: keep the stage consistent.
-- -----------------------------------------------------------------------------
create or replace function public.set_saved_job_applied(p_job_id uuid, p_applied boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.swipes s
  set applied_at = case when p_applied then coalesce(s.applied_at, now()) else null end
  where s.candidate_id = auth.uid()
    and s.job_id = p_job_id
    and s.direction = 'right';
  if not found then
    raise exception 'saved job not found' using errcode = 'P0002';
  end if;

  update public.saved_job_tracking t
  set stage = case
        when not p_applied then 'saved'
        when t.stage = 'saved' then 'applied'
        else t.stage
      end,
      updated_at = now()
  where t.candidate_id = auth.uid() and t.job_id = p_job_id;
end $$;

-- -----------------------------------------------------------------------------
-- When a save stops being a save (removed, undone, deleted), drop its tracking
-- so a later re-save starts clean. An upsert that keeps direction = 'right'
-- still fires an UPDATE OF direction trigger, so ignore that case.
-- -----------------------------------------------------------------------------
create function public.clear_saved_job_tracking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.direction = 'right' then
    return null;
  end if;
  delete from public.saved_job_tracking t
  where t.candidate_id = old.candidate_id and t.job_id = old.job_id;
  return null;
end $$;

create trigger swipes_clear_saved_job_tracking
  after update of direction or delete on public.swipes
  for each row
  when (old.direction = 'right')
  execute function public.clear_saved_job_tracking();

revoke execute on function public.set_saved_job_stage(uuid, text) from public, anon;
revoke execute on function public.set_saved_job_note(uuid, text) from public, anon;
revoke execute on function public.clear_saved_job_tracking() from public, anon, authenticated;
grant execute on function public.set_saved_job_stage(uuid, text) to authenticated;
grant execute on function public.set_saved_job_note(uuid, text) to authenticated;
