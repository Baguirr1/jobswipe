-- =============================================================================
-- JobSwipe: imported job listings (Adzuna, Remotive, ...)
--
-- Imported jobs are owned by a system "JobSwipe Imports" recruiter. Nobody can
-- sign in as it, so these jobs never produce a match: a right swipe saves the
-- job, and the candidate applies on the original site via apply_url.
-- Rows are written only by the import-jobs Edge Function (service role).
-- =============================================================================

alter table public.jobs
  add column source       text not null default 'jobswipe',
  add column external_id  text,
  add column apply_url    text,
  add column last_seen_at timestamptz;

-- One row per listing per source; the importer upserts on this.
alter table public.jobs
  add constraint jobs_source_external_id_key unique (source, external_id);

alter table public.jobs
  add constraint jobs_external_fields check (
    source = 'jobswipe' or (external_id is not null and apply_url is not null)
  );

-- Recruiters can't create jobs that pretend to be imported.
drop policy "recruiters insert own jobs" on public.jobs;
create policy "recruiters insert own jobs"
  on public.jobs for insert to authenticated
  with check (
    recruiter_id = (select auth.uid())
    and source = 'jobswipe'
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.role = 'recruiter')
  );
drop policy "recruiters update own jobs" on public.jobs;
create policy "recruiters update own jobs"
  on public.jobs for update to authenticated
  using (recruiter_id = (select auth.uid()))
  with check (recruiter_id = (select auth.uid()) and source = 'jobswipe');

-- System owner for imported jobs. No password, so nobody can sign in as it.
-- The on_auth_user_created trigger creates the matching profiles row.
insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  'de000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'imports@jobswipe.invalid',
  '{"provider":"email","providers":["email"]}',
  '{"role":"recruiter","full_name":"JobSwipe Imports"}',
  now(), now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

update public.profiles
set onboarded = true, bio = 'Listings imported from public job boards.'
where id = 'de000000-0000-4000-8000-000000000002';

-- The feed now also returns where a job came from and where to apply.
-- (A function's return type can't be changed in place.)
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int);

create function public.get_recommended_jobs_for_candidate(
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
  source text,
  apply_url text,
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
    j.required_skills, j.created_at, j.source, j.apply_url,
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

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int) to authenticated;
