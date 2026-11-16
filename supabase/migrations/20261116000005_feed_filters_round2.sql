-- Additional Discover filters; defaults preserve existing feed ranking.
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text);

create function public.get_recommended_jobs_for_candidate(
  p_candidate_id uuid,
  p_limit int default 20,
  p_remote_only boolean default false,
  p_min_salary int default null,
  p_location text default null,
  p_keyword text default null,
  p_posted_within_days int default null,
  p_level text default null,
  p_quick_apply_only boolean default false,
  p_salary_listed boolean default false,
  p_skills_match boolean default false,
  p_min_match int default null,
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
  v_sort text := case when p_sort in ('newest', 'salary') then p_sort else 'match' end;
  v_location text := nullif(btrim(p_location), '');
  v_keyword text := nullif(btrim(p_keyword), '');
  v_level text := nullif(lower(btrim(p_level)), '');
  -- Keep the title patterns in one place.
  v_level_pattern text := case v_level
    when 'internship' then '\m(intern|interns|internship|internships|co-op|coop)\M'
    when 'entry' then '\m(junior|jr|entry|associate|new grad|graduate)\M'
    when 'senior' then '\m(senior|sr|lead|staff|principal)\M'
  end;
begin
  -- A user may only request their own feed.
  if p_candidate_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.embedding, array(select lower(skill) from unnest(p.skills) as skill)
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
    and (v_keyword is null
      or j.title ilike '%' || v_keyword || '%'
      or j.company_name ilike '%' || v_keyword || '%'
      or j.description ilike '%' || v_keyword || '%')
    and (p_posted_within_days is null
      or j.created_at >= now() - p_posted_within_days * interval '1 day')
    and (v_level is null or j.title ~* v_level_pattern)
    and (not coalesce(p_quick_apply_only, false) or j.source = 'jobswipe')
    and (not coalesce(p_salary_listed, false) or j.salary_min is not null or j.salary_max is not null)
    and (not coalesce(p_skills_match, false)
      or array(select lower(skill) from unnest(j.required_skills) as skill) && v_skills)
    and (p_min_match is null
      or public.match_pct(j.embedding operator(extensions.<=>) v_embedding) >= p_min_match)
    and not exists (
      select 1 from public.swipes s
      where s.candidate_id = p_candidate_id and s.job_id = j.id
    )
  order by
    case when v_sort = 'match' then
      case when v_embedding is null or j.embedding is null then 1 else 0 end end,
    case when v_sort = 'match' then j.embedding operator(extensions.<=>) v_embedding end,
    case when v_sort = 'salary' then coalesce(j.salary_max, j.salary_min) end desc nulls last,
    j.created_at desc
  limit greatest(1, least(p_limit, 100));
end $$;

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text) to authenticated;

