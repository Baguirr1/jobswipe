-- =============================================================================
-- Feed filters, saved-job workflow, undo swipe, recruiter insights.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Feed filters.
--    New parameters all have defaults, so existing 2-argument callers (older
--    app builds) keep working.
--    p_min_salary hides jobs with no listed salary: "pays at least X" can't be
--    answered for them.
-- -----------------------------------------------------------------------------
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int);

create function public.get_recommended_jobs_for_candidate(
  p_candidate_id uuid,
  p_limit int default 20,
  p_remote_only boolean default false,
  p_min_salary int default null,
  p_location text default null
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
  v_location text := nullif(btrim(p_location), '');
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
    and (not coalesce(p_remote_only, false) or j.is_remote)
    and (p_min_salary is null or coalesce(j.salary_max, j.salary_min) >= p_min_salary)
    and (v_location is null or j.location ilike '%' || v_location || '%')
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

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Saved (imported) jobs: track applications, allow removal.
--    Removing turns the save into a pass, so the job doesn't come back into
--    the feed. Only imported jobs: in-app jobs can be part of a match.
-- -----------------------------------------------------------------------------
alter table public.swipes add column applied_at timestamptz;

create function public.set_saved_job_applied(p_job_id uuid, p_applied boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.swipes s
  set applied_at = case when p_applied then now() else null end
  where s.candidate_id = auth.uid()
    and s.job_id = p_job_id
    and s.direction = 'right';
  if not found then
    raise exception 'saved job not found' using errcode = 'P0002';
  end if;
end $$;

create function public.remove_saved_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.swipes s
  set direction = 'left', applied_at = null
  where s.candidate_id = auth.uid()
    and s.job_id = p_job_id
    and s.direction = 'right'
    and exists (select 1 from public.jobs j where j.id = p_job_id and j.source <> 'jobswipe');
  if not found then
    raise exception 'saved job not found' using errcode = 'P0002';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Undo a recent swipe. Refused once the swipe produced a match (undoing
--    would orphan the recruiter's side of the conversation).
--
--    Race with a recruiter swiping right at the same moment: swipe_candidate
--    (recreated below) now takes FOR SHARE on the candidate's swipe row before
--    creating a match, and undo deletes that row before checking for a match.
--    So either undo waits for the match to commit and then sees it (and rolls
--    back), or swipe_candidate waits for the delete and finds no swipe.
-- -----------------------------------------------------------------------------
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
    for share
  ) then
    insert into public.matches (candidate_id, job_id, recruiter_id)
    values (p_candidate_id, p_job_id, v_uid)
    on conflict (candidate_id, job_id) do nothing;

    select m.id into v_match_id from public.matches m
    where m.candidate_id = p_candidate_id and m.job_id = p_job_id;
  end if;

  return v_match_id;
end $$;

create function public.undo_swipe(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Delete first (row lock), then check: see the comment above.
  delete from public.swipes s
  where s.candidate_id = v_uid
    and s.job_id = p_job_id
    and s.created_at > now() - interval '15 minutes';
  if not found then
    raise exception 'nothing to undo' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.matches m
             where m.candidate_id = v_uid and m.job_id = p_job_id) then
    -- Raising rolls the delete back.
    raise exception 'already matched: this swipe can no longer be undone' using errcode = 'P0001';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Recruiter insights for one of their own jobs. Aggregates only: the
--    recruiter never receives individual candidate rows from this function.
-- -----------------------------------------------------------------------------
create function public.get_job_insights(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job_embedding extensions.vector(384);
  v_required text[];
  v_result jsonb;
begin
  select j.embedding, j.required_skills into v_job_embedding, v_required
  from public.jobs j where j.id = p_job_id and j.recruiter_id = auth.uid();
  if not found then
    raise exception 'not the owner of this job' using errcode = '42501';
  end if;

  with applicants as (
    select p.skills,
           public.match_pct(p.embedding operator(extensions.<=>) v_job_embedding) as pct
    from public.swipes s
    join public.profiles p on p.id = s.candidate_id
    where s.job_id = p_job_id and s.direction = 'right'
  )
  select jsonb_build_object(
    'views',      (select count(*) from public.swipes s where s.job_id = p_job_id),
    'applicants', (select count(*) from applicants),
    'passes',     (select count(*) from public.swipes s where s.job_id = p_job_id and s.direction = 'left'),
    'reviewed',   (select count(*) from public.recruiter_swipes rs where rs.job_id = p_job_id),
    'matches',    (select count(*) from public.matches m where m.job_id = p_job_id),
    'avg_match',  (select round(avg(a.pct)) from applicants a where a.pct is not null),
    'scored',     (select count(*) from applicants a where a.pct is not null),
    'match_distribution', (
      select jsonb_build_object(
        'low',   count(*) filter (where a.pct < 50),
        'fair',  count(*) filter (where a.pct >= 50 and a.pct < 70),
        'good',  count(*) filter (where a.pct >= 70 and a.pct < 85),
        'great', count(*) filter (where a.pct >= 85)
      )
      from applicants a where a.pct is not null
    ),
    'required_coverage', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'skill', r.skill,
               'count', (select count(*) from applicants a
                         where exists (select 1 from unnest(a.skills) x
                                       where lower(x) = lower(r.skill)))
             ) order by r.ord), '[]'::jsonb)
      from unnest(v_required) with ordinality as r(skill, ord)
    ),
    'top_skills', (
      select coalesce(jsonb_agg(jsonb_build_object('skill', t.skill, 'count', t.n)
                                order by t.n desc, t.skill), '[]'::jsonb)
      from (
        select x as skill, count(*) as n
        from applicants a cross join unnest(a.skills) as x
        group by x
        order by count(*) desc, x
        limit 8
      ) t
    )
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.set_saved_job_applied(uuid, boolean) from public, anon;
revoke execute on function public.remove_saved_job(uuid) from public, anon;
revoke execute on function public.undo_swipe(uuid) from public, anon;
revoke execute on function public.get_job_insights(uuid) from public, anon;
grant execute on function public.set_saved_job_applied(uuid, boolean) to authenticated;
grant execute on function public.remove_saved_job(uuid) to authenticated;
grant execute on function public.undo_swipe(uuid) to authenticated;
grant execute on function public.get_job_insights(uuid) to authenticated;
