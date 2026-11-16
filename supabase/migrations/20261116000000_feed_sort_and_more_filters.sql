-- =============================================================================
-- Discover: more filters and a choice of sort order.
--
--   p_posted_days  only jobs posted in the last N days (null = any time)
--   p_skill_match  only jobs that ask for at least one of the candidate's skills
--   p_sort         'match' (default, vector similarity), 'newest', 'salary'
--
-- New parameters all have defaults, so older app builds that pass only the
-- first five keep working. "Best pay for the cost of living" is computed on the
-- device (it needs the city table in src/lib/cities.ts), on top of 'match'.
-- =============================================================================
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text);

create function public.get_recommended_jobs_for_candidate(
  p_candidate_id uuid,
  p_limit int default 20,
  p_remote_only boolean default false,
  p_min_salary int default null,
  p_location text default null,
  p_posted_days int default null,
  p_skill_match boolean default false,
  p_sort text default 'match'
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
  v_skills text[];
  v_location text := nullif(btrim(p_location), '');
  v_sort text := coalesce(nullif(p_sort, ''), 'match');
begin
  -- A user may only request their own feed.
  if p_candidate_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sort not in ('match', 'newest', 'salary') then
    raise exception 'unknown sort %', v_sort using errcode = '22023';
  end if;

  select p.embedding, coalesce(array(select lower(s) from unnest(p.skills) s), '{}')
    into v_embedding, v_skills
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
    and (p_posted_days is null or j.created_at >= now() - make_interval(days => greatest(p_posted_days, 1)))
    and (not coalesce(p_skill_match, false) or exists (
      select 1 from unnest(j.required_skills) rs where lower(rs) = any (v_skills)
    ))
    and not exists (
      select 1 from public.swipes s
      where s.candidate_id = p_candidate_id and s.job_id = j.id
    )
  order by
    case when v_sort = 'newest' then j.created_at end desc nulls last,
    case when v_sort = 'salary' then coalesce(j.salary_max, j.salary_min) end desc nulls last,
    case when v_embedding is null or j.embedding is null then 1 else 0 end,
    j.embedding operator(extensions.<=>) v_embedding,
    j.created_at desc
  limit greatest(1, least(p_limit, 100));
end $$;

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, int, boolean, text) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, int, boolean, text) to authenticated;
