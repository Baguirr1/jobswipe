-- =============================================================================
-- JobSwipe — initial schema
-- Tables, RLS, vector indexes, matching RPCs, recommendation engine, realtime.
-- Embeddings: sentence-transformers/all-MiniLM-L6-v2 (384 dims, L2-normalized).
-- =============================================================================

create extension if not exists vector with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('candidate', 'recruiter');
create type public.swipe_direction as enum ('left', 'right');

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               public.user_role not null default 'candidate',
  full_name          text,
  avatar_url         text,
  bio                text,
  target_title       text,
  resume_text        text,
  skills             text[] not null default '{}',
  target_salary_min  integer check (target_salary_min >= 0),
  target_salary_max  integer check (target_salary_max >= 0),
  embedding          extensions.vector(384),
  onboarded          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_salary_range check (
    target_salary_min is null or target_salary_max is null
    or target_salary_min <= target_salary_max
  )
);

-- -----------------------------------------------------------------------------
-- jobs
-- -----------------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  recruiter_id     uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  company_name     text not null,
  company_logo     text,
  description      text not null default '',
  location         text,
  is_remote        boolean not null default false,
  salary_min       integer check (salary_min >= 0),
  salary_max       integer check (salary_max >= 0),
  required_skills  text[] not null default '{}',
  embedding        extensions.vector(384),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint jobs_salary_range check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  )
);

create index jobs_recruiter_id_idx on public.jobs (recruiter_id);
create index jobs_active_idx on public.jobs (is_active) where is_active;
-- HNSW index for cosine distance (<=>) queries.
create index jobs_embedding_hnsw_idx on public.jobs
  using hnsw (embedding extensions.vector_cosine_ops);
create index profiles_embedding_hnsw_idx on public.profiles
  using hnsw (embedding extensions.vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- swipes (candidate -> job)
-- -----------------------------------------------------------------------------
create table public.swipes (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.profiles (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  direction     public.swipe_direction not null,
  created_at    timestamptz not null default now(),
  constraint swipes_candidate_job_unique unique (candidate_id, job_id)
);

create index swipes_job_id_idx on public.swipes (job_id, direction);

-- -----------------------------------------------------------------------------
-- recruiter_swipes (recruiter -> candidate, scoped to one job)
-- Needed for the mutual "both swiped right" match rule.
-- -----------------------------------------------------------------------------
create table public.recruiter_swipes (
  id            uuid primary key default gen_random_uuid(),
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  candidate_id  uuid not null references public.profiles (id) on delete cascade,
  direction     public.swipe_direction not null,
  created_at    timestamptz not null default now(),
  constraint recruiter_swipes_job_candidate_unique unique (job_id, candidate_id)
);

-- -----------------------------------------------------------------------------
-- matches
-- -----------------------------------------------------------------------------
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.profiles (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint matches_candidate_job_unique unique (candidate_id, job_id)
);

create index matches_candidate_idx on public.matches (candidate_id);
create index matches_recruiter_idx on public.matches (recruiter_id);

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index messages_match_created_idx on public.messages (match_id, created_at);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up.
-- Role comes from signUp({ options: { data: { role, full_name } } }).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'candidate'),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Small helper used by RLS policies.
create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.candidate_id = auth.uid() or m.recruiter_id = auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.jobs             enable row level security;
alter table public.swipes           enable row level security;
alter table public.recruiter_swipes enable row level security;
alter table public.matches          enable row level security;
alter table public.messages         enable row level security;

-- profiles: any signed-in user can read (recruiters review candidates,
-- candidates see recruiter names in chat). Users only write their own row.
create policy "profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Role cannot be changed after signup through the API.
create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'role cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_lock_role before update on public.profiles
  for each row execute function public.prevent_role_change();

-- jobs: active jobs are public to signed-in users; owners see all of theirs.
create policy "active jobs readable"
  on public.jobs for select to authenticated
  using (is_active or recruiter_id = (select auth.uid()));
create policy "recruiters insert own jobs"
  on public.jobs for insert to authenticated
  with check (
    recruiter_id = (select auth.uid())
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.role = 'recruiter')
  );
create policy "recruiters update own jobs"
  on public.jobs for update to authenticated
  using (recruiter_id = (select auth.uid()))
  with check (recruiter_id = (select auth.uid()));
create policy "recruiters delete own jobs"
  on public.jobs for delete to authenticated
  using (recruiter_id = (select auth.uid()));

-- swipes: candidates see their own; recruiters see swipes on their jobs.
-- Writes go through the swipe_job() RPC (security definer).
create policy "swipes readable by owner or job recruiter"
  on public.swipes for select to authenticated
  using (
    candidate_id = (select auth.uid())
    or exists (select 1 from public.jobs j
               where j.id = job_id and j.recruiter_id = (select auth.uid()))
  );

create policy "recruiter swipes readable by owner"
  on public.recruiter_swipes for select to authenticated
  using (recruiter_id = (select auth.uid()));

create policy "matches readable by participants"
  on public.matches for select to authenticated
  using (candidate_id = (select auth.uid()) or recruiter_id = (select auth.uid()));

create policy "messages readable by participants"
  on public.messages for select to authenticated
  using (public.is_match_participant(match_id));
create policy "participants send messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_match_participant(match_id));

-- -----------------------------------------------------------------------------
-- Swipe RPCs — record the swipe and atomically create a match when both
-- sides have swiped right. Returns the match id (or null).
-- -----------------------------------------------------------------------------
create or replace function public.swipe_job(
  p_job_id uuid,
  p_direction public.swipe_direction
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_recruiter uuid;
  v_match_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select j.recruiter_id into v_recruiter
  from public.jobs j where j.id = p_job_id and j.is_active;
  if v_recruiter is null then
    raise exception 'job not found or inactive' using errcode = 'P0002';
  end if;

  insert into public.swipes (candidate_id, job_id, direction)
  values (v_uid, p_job_id, p_direction)
  on conflict (candidate_id, job_id) do update set direction = excluded.direction;

  if p_direction = 'right' and exists (
    select 1 from public.recruiter_swipes rs
    where rs.job_id = p_job_id and rs.candidate_id = v_uid and rs.direction = 'right'
  ) then
    insert into public.matches (candidate_id, job_id, recruiter_id)
    values (v_uid, p_job_id, v_recruiter)
    on conflict (candidate_id, job_id) do nothing;

    select m.id into v_match_id from public.matches m
    where m.candidate_id = v_uid and m.job_id = p_job_id;
  end if;

  return v_match_id;
end $$;

create or replace function public.swipe_candidate(
  p_job_id uuid,
  p_candidate_id uuid,
  p_direction public.swipe_direction
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
begin
  if not exists (select 1 from public.jobs j
                 where j.id = p_job_id and j.recruiter_id = v_uid) then
    raise exception 'not the owner of this job' using errcode = '42501';
  end if;

  insert into public.recruiter_swipes (recruiter_id, job_id, candidate_id, direction)
  values (v_uid, p_job_id, p_candidate_id, p_direction)
  on conflict (job_id, candidate_id) do update set direction = excluded.direction;

  if p_direction = 'right' and exists (
    select 1 from public.swipes s
    where s.job_id = p_job_id and s.candidate_id = p_candidate_id and s.direction = 'right'
  ) then
    insert into public.matches (candidate_id, job_id, recruiter_id)
    values (p_candidate_id, p_job_id, v_uid)
    on conflict (candidate_id, job_id) do nothing;

    select m.id into v_match_id from public.matches m
    where m.candidate_id = p_candidate_id and m.job_id = p_job_id;
  end if;

  return v_match_id;
end $$;

-- -----------------------------------------------------------------------------
-- Similarity → match percentage.
-- Raw MiniLM cosine similarity between a resume and a job posting rarely goes
-- above ~0.75 even for a near-perfect fit, and unrelated text sits around
-- 0.0–0.15. Map that useful band linearly onto 0–100 so "92% Match" means
-- something to a user. Tune the two constants against real data.
-- -----------------------------------------------------------------------------
create or replace function public.match_pct(p_distance double precision)
returns numeric
language sql
immutable
as $$
  select case
    when p_distance is null then null
    else round((greatest(0, least(1, ((1 - p_distance) - 0.10) / (0.75 - 0.10))) * 100)::numeric, 0)
  end;
$$;

-- -----------------------------------------------------------------------------
-- Recommendation engine: jobs for a candidate.
-- Ordered by cosine distance (<=>) on L2-normalized MiniLM embeddings
-- (similarity = 1 - distance), scored with match_pct(). Falls back to newest-first when the candidate has no embedding yet.
-- -----------------------------------------------------------------------------
create or replace function public.get_recommended_jobs_for_candidate(
  p_candidate_id uuid,
  p_limit int default 20
)
returns table (
  id uuid,
  recruiter_id uuid,
  title text,
  company_name text,
  company_logo text,
  description text,
  location text,
  is_remote boolean,
  salary_min integer,
  salary_max integer,
  required_skills text[],
  created_at timestamptz,
  match_score_percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_embedding extensions.vector(384);
begin
  -- A user may only request their own feed.
  if p_candidate_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.embedding into v_embedding
  from public.profiles p where p.id = p_candidate_id;

  return query
  select
    j.id, j.recruiter_id, j.title, j.company_name, j.company_logo,
    j.description, j.location, j.is_remote, j.salary_min, j.salary_max,
    j.required_skills, j.created_at,
    public.match_pct(j.embedding operator(extensions.<=>) v_embedding) as match_score_percentage
  from public.jobs j
  where j.is_active
    and not exists (
      select 1 from public.swipes s
      where s.candidate_id = p_candidate_id and s.job_id = j.id
    )
  order by
    case when v_embedding is null or j.embedding is null then 1 else 0 end,
    j.embedding operator(extensions.<=>) v_embedding,
    j.created_at desc
  limit greatest(1, least(p_limit, 100));
end $$;

-- -----------------------------------------------------------------------------
-- Recruiter feed: candidates who swiped right on a job and haven't been
-- reviewed yet, ranked by similarity to the job.
-- -----------------------------------------------------------------------------
create or replace function public.get_candidates_for_job(
  p_job_id uuid,
  p_limit int default 20
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  bio text,
  target_title text,
  skills text[],
  target_salary_min integer,
  target_salary_max integer,
  resume_text text,
  applied_at timestamptz,
  match_score_percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_embedding extensions.vector(384);
begin
  select j.embedding into v_embedding
  from public.jobs j where j.id = p_job_id and j.recruiter_id = auth.uid();
  if not found then
    raise exception 'not the owner of this job' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.full_name, p.avatar_url, p.bio, p.target_title, p.skills,
    p.target_salary_min, p.target_salary_max, p.resume_text,
    s.created_at as applied_at,
    public.match_pct(p.embedding operator(extensions.<=>) v_embedding)
  from public.swipes s
  join public.profiles p on p.id = s.candidate_id
  where s.job_id = p_job_id
    and s.direction = 'right'
    and not exists (
      select 1 from public.recruiter_swipes rs
      where rs.job_id = p_job_id and rs.candidate_id = s.candidate_id
    )
  order by
    case when v_embedding is null or p.embedding is null then 1 else 0 end,
    p.embedding operator(extensions.<=>) v_embedding,
    s.created_at
  limit greatest(1, least(p_limit, 100));
end $$;

-- Only signed-in users may call the RPCs.
revoke execute on function public.swipe_job(uuid, public.swipe_direction) from public, anon;
revoke execute on function public.swipe_candidate(uuid, uuid, public.swipe_direction) from public, anon;
revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int) from public, anon;
revoke execute on function public.get_candidates_for_job(uuid, int) from public, anon;
grant execute on function public.swipe_job(uuid, public.swipe_direction) to authenticated;
grant execute on function public.swipe_candidate(uuid, uuid, public.swipe_direction) to authenticated;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int) to authenticated;
grant execute on function public.get_candidates_for_job(uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: chat messages and new matches.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
