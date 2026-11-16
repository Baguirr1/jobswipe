-- Handshake-style Discover filters: job type, work location type, job
-- function, employer and visa sponsorship.
--
-- employment_type / workplace_type: set by the importer when the job board
-- reports them (Lever commitment, Ashby employmentType, ...) or by the
-- recruiter's form; otherwise derived from the title/location by a trigger.
-- job_function / sponsors_visa: always derived from the posting text.

-- ---------------------------------------------------------------------------
-- Classifiers (immutable, so they can back generated columns)
-- ---------------------------------------------------------------------------
create function public.classify_employment_type(p_title text, p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_title ~* '\m(intern|interns|internship|internships|co-?op|werkstudent)\M' then 'internship'
    when p_title ~* '\mpart[- ]?time\M' then 'part_time'
    when p_title ~* '\m(contract|contractor|freelance|freelancer)\M' then 'contract'
    when p_title ~* '\m(temporary|temp|seasonal)\M' then 'temporary'
    when p_description ~* '\mpart[- ]time\s+(position|role|job|opportunity)\M' then 'part_time'
    -- Most postings that say nothing are full-time.
    else 'full_time'
  end
$$;

create function public.classify_workplace_type(p_title text, p_location text, p_is_remote boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when concat_ws(' ', p_title, p_location) ~* '\mhybrid\M' then 'hybrid'
    when p_is_remote then 'remote'
    else 'onsite'
  end
$$;

-- First match wins, so more specific functions come first ("Data Engineer" is
-- data, "Product Designer" is design, "Product Marketing Manager" is marketing).
create function public.classify_job_function(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_title ~* '\m(data|analytics|machine learning|ml|ai|artificial intelligence|scientist|statistics?|statistician|business intelligence|bi)\M' then 'data'
    when p_title ~* '\m(engineer|engineers|engineering|developer|software|programmer|devops|sre|firmware|swe|full[- ]?stack|front[- ]?end|back[- ]?end|qa|cybersecurity|it support|help desk|systems administrator|network administrator)\M' then 'engineering'
    when p_title ~* '\m(design|designer|designers|ux|ui|graphic|illustrator|animator|creative)\M' then 'design'
    when p_title ~* '\mproduct\s+(manager|owner|management|lead|analyst)\M|\m(pm|apm)\M' then 'product'
    when p_title ~* '\m(marketing|brand|content|social media|seo|communications|public relations|pr|growth|copywriter)\M' then 'marketing'
    when p_title ~* '\m(sales|account executive|business development|bdr|sdr|account manager|partnerships)\M' then 'sales'
    when p_title ~* '\m(finance|financial|accounting|accountant|audit|auditor|tax|treasury|investment|banking|actuarial|actuary|underwriter|underwriting|controller)\M' then 'finance'
    when p_title ~* '\m(recruiter|recruiting|recruitment|talent|human resources|hr|people)\M' then 'people'
    when p_title ~* '\m(legal|counsel|paralegal|attorney|lawyer|compliance)\M' then 'legal'
    when p_title ~* '\m(nurse|nursing|clinical|medical|pharmacy|pharmacist|health|healthcare|physician|therapist|dental)\M' then 'healthcare'
    when p_title ~* '\m(teacher|tutor|instructor|teaching|education|professor)\M' then 'education'
    when p_title ~* '\m(customer|support|service|client success)\M' then 'customer_support'
    when p_title ~* '\m(operations|logistics|supply chain|project manager|program manager|coordinator|analyst|consultant|consulting|strategy|administrative|assistant)\M' then 'operations'
    else 'other'
  end
$$;

-- true: the posting says it sponsors; false: it rules sponsorship out;
-- null: it doesn't say.
create function public.classify_sponsors_visa(p_description text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_description ~* '\m(no|not|unable\s+to|cannot|can''t|won''t|will\s+not|does\s+not|do\s+not|are\s+not\s+able\s+to|is\s+not\s+able\s+to)\s+(currently\s+)?(able\s+to\s+)?((offer|provide|support|require|need)\s+)?(visa\s+|employment\s+|immigration\s+|h-?1b\s+)?sponsor'
      or p_description ~* '\mwithout\s+(the\s+need\s+for\s+)?(current\s+or\s+future\s+|future\s+)?(visa\s+|employer\s+|employment\s+|immigration\s+)?sponsorship'
      or p_description ~* '\msponsorship\s+(is\s+)?(not\s+(available|offered|provided)|unavailable)'
      then false
    when p_description ~* '\m(visa|h-?1b|immigration|employment)\s+sponsorship\s+(is\s+|may\s+be\s+)?(available|offered|provided)'
      or p_description ~* '\m(will|can|may)\s+((provide|offer)\s+)?(visa\s+)?sponsor\M'
      or p_description ~* '\moffers?\s+(visa\s+|h-?1b\s+)?sponsorship'
      then true
  end
$$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column employment_type text
    check (employment_type in ('full_time', 'part_time', 'internship', 'contract', 'temporary')),
  add column workplace_type text
    check (workplace_type in ('onsite', 'hybrid', 'remote')),
  add column job_function text
    generated always as (public.classify_job_function(title)) stored,
  add column sponsors_visa boolean
    generated always as (public.classify_sponsors_visa(description)) stored;

-- Fill employment_type / workplace_type when the writer didn't. Named so it
-- runs before jobs_clear_stale_embedding (BEFORE triggers fire alphabetically)
-- and that trigger sees the final is_remote.
create function public.classify_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- When the inputs change, re-derive a value that was itself derived. A
    -- value someone chose (differs from what the old inputs give) is kept, even
    -- though the recruiter form re-sends it unchanged on every save.
    if new.employment_type is not distinct from old.employment_type
       and (new.title, new.description) is distinct from (old.title, old.description)
       and old.employment_type = public.classify_employment_type(old.title, old.description) then
      new.employment_type := null;
    end if;
    if new.workplace_type is not distinct from old.workplace_type
       and (new.title, new.location, new.is_remote) is distinct from (old.title, old.location, old.is_remote)
       and old.workplace_type = public.classify_workplace_type(old.title, old.location, old.is_remote) then
      new.workplace_type := null;
    end if;
  end if;

  new.employment_type := coalesce(new.employment_type,
    public.classify_employment_type(new.title, new.description));
  new.workplace_type := coalesce(new.workplace_type,
    public.classify_workplace_type(new.title, new.location, new.is_remote));

  -- Keep the legacy flag (older app versions, p_remote_only) consistent.
  if new.workplace_type = 'remote' then
    new.is_remote := true;
  elsif new.workplace_type = 'onsite' then
    new.is_remote := false;
  end if;
  return new;
end $$;

create trigger jobs_classify before insert or update on public.jobs
  for each row execute function public.classify_job();

-- Backfill. Derived values never flip is_remote here (hybrid leaves it alone,
-- remote/onsite already agree with it), so no embeddings are cleared.
update public.jobs set employment_type = null, workplace_type = null;

alter table public.jobs
  alter column employment_type set not null,
  alter column workplace_type set not null;

-- ---------------------------------------------------------------------------
-- Feed RPC
-- ---------------------------------------------------------------------------
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text);

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
  p_sort text default 'match',
  p_employment_types text[] default null,
  p_workplace_types text[] default null,
  p_job_functions text[] default null,
  p_company text default null,
  p_sponsorship text default null
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
  employment_type text,
  workplace_type text,
  job_function text,
  sponsors_visa boolean,
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
  v_company text := nullif(btrim(p_company), '');
  v_level text := nullif(lower(btrim(p_level)), '');
  -- An empty array means "no filter", same as null.
  v_employment_types text[] := nullif(p_employment_types, '{}');
  v_workplace_types text[] := nullif(p_workplace_types, '{}');
  v_job_functions text[] := nullif(p_job_functions, '{}');
  v_sponsorship text := case when p_sponsorship in ('open', 'offered') then p_sponsorship end;
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
    j.employment_type, j.workplace_type, j.job_function, j.sponsors_visa,
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
    and (v_company is null or j.company_name ilike '%' || v_company || '%')
    and (p_posted_within_days is null
      or j.created_at >= now() - p_posted_within_days * interval '1 day')
    and (v_level is null or j.title ~* v_level_pattern)
    and (v_employment_types is null or j.employment_type = any (v_employment_types))
    and (v_workplace_types is null or j.workplace_type = any (v_workplace_types))
    and (v_job_functions is null or j.job_function = any (v_job_functions))
    and (v_sponsorship is null
      or (v_sponsorship = 'open' and j.sponsors_visa is distinct from false)
      or (v_sponsorship = 'offered' and j.sponsors_visa))
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

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text, text[], text[], text[], text, text) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text, text[], text[], text[], text, text) to authenticated;
