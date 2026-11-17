-- Pay for jobs without a salary field.
--
-- 1. Stated pay: many postings put pay in the description ("$120,000 -
--    $150,000", "$25-$35/hour"). When the job board / recruiter gave no pay,
--    the jobs_pay trigger reads it from there. Hourly pay gets its own columns
--    (salary_min/max stay annual).
-- 2. Estimated pay: jobs with no stated pay get a range from BLS OEWS wage
--    data (job function x seniority x state), or Adzuna's own prediction for
--    Adzuna jobs. Estimates live in est_pay_* and never count as a listed
--    salary unless the feed asks for them (p_include_estimates).

-- ---------------------------------------------------------------------------
-- Benchmarks (from ml/pay_benchmarks.py; BLS OEWS May 2025)
-- ---------------------------------------------------------------------------
create table public.pay_benchmarks (
  job_function text primary key,
  soc_code     text not null,
  occupation   text not null,
  -- National annual wage percentiles.
  p10 integer not null,
  p25 integer not null,
  p50 integer not null,
  p75 integer not null,
  p90 integer not null
);

-- State all-occupation median / national median.
create table public.pay_state_index (
  state      text primary key,
  state_name text not null,
  wage_index numeric(5, 3) not null
);

alter table public.pay_benchmarks enable row level security;
alter table public.pay_state_index enable row level security;
-- Public BLS data. Readable so the jobs_pay trigger works when a recruiter
-- (authenticated) writes a job; only migrations write it.
revoke all on public.pay_benchmarks, public.pay_state_index from anon, authenticated;
grant select on public.pay_benchmarks, public.pay_state_index to authenticated;
create policy "pay benchmarks readable" on public.pay_benchmarks for select to authenticated using (true);
create policy "pay state index readable" on public.pay_state_index for select to authenticated using (true);

insert into public.pay_benchmarks (job_function, soc_code, occupation, p10, p25, p50, p75, p90) values
  ('engineering', '151252', 'Software Developers', 82460, 105210, 135980, 171980, 214670),
  ('data', '152051', 'Data Scientists', 67240, 85660, 120230, 158880, 199130),
  ('design', '151255', 'Web and Digital Interface Designers', 53750, 73290, 104000, 158820, 201550),
  ('product', '131111', 'Management Analysts', 60640, 77950, 101860, 133370, 171640),
  ('marketing', '131161', 'Market Research Analysts and Marketing Specialists', 43390, 58350, 78760, 108310, 155480),
  ('sales', '414012', 'Sales Representatives, Wholesale and Manufacturing', 39090, 50470, 72080, 99640, 137550),
  ('finance', '132011', 'Accountants and Auditors', 56020, 67020, 83680, 109810, 144090),
  ('operations', '131082', 'Project Management Specialists', 61580, 78440, 102320, 133100, 167970),
  ('people', '131071', 'Human Resources Specialists', 47180, 58610, 75940, 99380, 128720),
  ('legal', '232011', 'Paralegals and Legal Assistants', 44740, 50340, 62890, 80080, 101500),
  ('healthcare', '291141', 'Registered Nurses', 68940, 80330, 97550, 112350, 137470),
  ('education', '252021', 'Elementary School Teachers', 47960, 57710, 63970, 81450, 104340),
  ('customer_support', '434051', 'Customer Service Representatives', 31750, 36870, 44770, 51780, 63590),
  ('other', '000000', 'All Occupations', 31200, 37590, 50980, 80520, 128560);

insert into public.pay_state_index (state, state_name, wage_index) values
  ('AK', 'Alaska', 1.197), ('AL', 'Alabama', 0.896), ('AR', 'Arkansas', 0.856), ('AZ', 'Arizona', 0.982),
  ('CA', 'California', 1.142), ('CO', 'Colorado', 1.173), ('CT', 'Connecticut', 1.171),
  ('DC', 'District of Columbia', 1.796), ('DE', 'Delaware', 1.024), ('FL', 'Florida', 0.939),
  ('GA', 'Georgia', 0.945), ('HI', 'Hawaii', 1.105), ('IA', 'Iowa', 0.952), ('ID', 'Idaho', 0.941),
  ('IL', 'Illinois', 1.019), ('IN', 'Indiana', 0.939), ('KS', 'Kansas', 0.942), ('KY', 'Kentucky', 0.920),
  ('LA', 'Louisiana', 0.893), ('MA', 'Massachusetts', 1.247), ('MD', 'Maryland', 1.167), ('ME', 'Maine', 1.009),
  ('MI', 'Michigan', 0.966), ('MN', 'Minnesota', 1.117), ('MO', 'Missouri', 0.938), ('MS', 'Mississippi', 0.787),
  ('MT', 'Montana', 0.956), ('NC', 'North Carolina', 0.941), ('ND', 'North Dakota', 1.029),
  ('NE', 'Nebraska', 0.961), ('NH', 'New Hampshire', 1.096), ('NJ', 'New Jersey', 1.149),
  ('NM', 'New Mexico', 0.926), ('NV', 'Nevada', 0.935), ('NY', 'New York', 1.170), ('OH', 'Ohio', 0.969),
  ('OK', 'Oklahoma', 0.894), ('OR', 'Oregon', 1.118), ('PA', 'Pennsylvania', 0.975),
  ('RI', 'Rhode Island', 1.114), ('SC', 'South Carolina', 0.912), ('SD', 'South Dakota', 0.923),
  ('TN', 'Tennessee', 0.929), ('TX', 'Texas', 0.954), ('UT', 'Utah', 0.983), ('VA', 'Virginia', 1.092),
  ('VT', 'Vermont', 1.106), ('WA', 'Washington', 1.236), ('WV', 'West Virginia', 0.889),
  ('WI', 'Wisconsin', 0.986), ('WY', 'Wyoming', 0.986);

-- ---------------------------------------------------------------------------
-- Job function: cover quant/research and hardware roles, which otherwise fall
-- into "other" (and get no pay estimate). Same signature, so the generated
-- job_function column keeps using it; the backfill below recomputes it.
-- ---------------------------------------------------------------------------
create or replace function public.classify_job_function(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_title ~* '\mux\s+research' then 'design'
    when p_title ~* '\m(data|analytics|machine learning|ml|ai|artificial intelligence|scientist|statistics?|statistician|business intelligence|bi|quant|quantitative|researcher|research scientist)\M' then 'data'
    when p_title ~* '\m(engineer|engineers|engineering|developer|software|programmer|devops|sre|firmware|swe|full[- ]?stack|front[- ]?end|back[- ]?end|qa|cybersecurity|it support|help desk|systems administrator|network administrator|hardware|electrical|mechanical|robotics|technician)\M' then 'engineering'
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

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column hourly_min numeric(7, 2) check (hourly_min >= 0),
  add column hourly_max numeric(7, 2) check (hourly_max >= 0),
  add column est_pay_min numeric(10, 2),
  add column est_pay_max numeric(10, 2),
  add column est_pay_period text check (est_pay_period in ('year', 'hour')),
  add column est_pay_source text check (est_pay_source in ('adzuna', 'bls')),
  add constraint jobs_hourly_range check (hourly_min is null or hourly_max is null or hourly_min <= hourly_max);

-- ---------------------------------------------------------------------------
-- Stated pay in the description
-- ---------------------------------------------------------------------------
-- "120,000" -> 120000, "85k" -> 85000, "27.50" -> 27.50
create function public.parse_money(p text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~* 'k$' then replace(rtrim(lower(p), 'k '), ',', '')::numeric * 1000
    else replace(p, ',', '')::numeric
  end
$$;

-- First plausible pay in the text, in this order: annual range; hourly range,
-- monthly pay (converted to hourly) or single hourly rate, each marked by a
-- suffix ("/hour", "monthly"); hourly pay marked by a label before it
-- ("Hourly Rate: $40"); a single annual figure with "per year"/"salary"
-- context. Bounds keep "$5,000 signing bonus" and "$100 million raised" out.
create function public.parse_stated_pay(
  p_text text,
  out annual_min integer, out annual_max integer,
  out hourly_min numeric, out hourly_max numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text;
  m text[];
  lo numeric;
  hi numeric;
  -- Annual amount: "120,000", "120,000.00", "120k", "120.5K".
  amt constant text := '(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?k)(?:\.\d{2})?';
  -- Hourly amount: "25", "27.50"; not "$100 million", "$5.8B" or "$5,000".
  rate constant text := '(\d{1,3}(?:\.\d{1,2})?)(?![\d,]|\s*(?:million|billion|thousand|[mbk]\M))';
  -- Monthly amount: "7,000", "10,500.00".
  month_amt constant text := '(\d{1,2},\d{3})(?:\.\d{2})?';
  sep constant text := '\s*(?:USD\s*)?(?:-|to)\s*(?:USD\s*)?\$?\s?';
  per_hour constant text := '\s*(?:USD\s*)?(?:(?:/\s*|per\s+|an?\s+)(?:hr|hour)\M|hourly\M)';
  per_month constant text := '\s*(?:USD\s*)?(?:(?:/\s*|per\s+|a\s+)(?:mo|month)\M|monthly\M)';
  hour_label constant text := '(?:hourly|per hour|wage|pay rate|pay range|hourly rate)[^$.]{0,40}';
begin
  if p_text is null or strpos(p_text, '$') = 0 then return; end if;
  -- Dashes, including HTML entities some job boards leave encoded.
  t := regexp_replace(translate(p_text, E'\u2013\u2014\u2212', '---'),
                      '&(?:mdash|ndash|minus|#8211|#8212|#x2013|#x2014);', '-', 'gi');

  for m in select regexp_matches(t, '\$\s?' || amt || sep || amt, 'gi') loop
    lo := public.parse_money(m[1]); hi := public.parse_money(m[2]);
    if lo between 15000 and 1000000 and hi between lo and lo * 4 then
      annual_min := lo; annual_max := hi; return;
    end if;
  end loop;

  for m in select regexp_matches(t, '\$\s?' || rate || '(?:(?:' || per_hour || ')?' || sep || rate || ')?' || per_hour, 'gi') loop
    lo := m[1]::numeric; hi := coalesce(m[2], m[1])::numeric;
    if lo between 7 and 300 and hi between lo and lo * 4 then
      hourly_min := lo; hourly_max := hi; return;
    end if;
  end loop;

  for m in select regexp_matches(t, '\$\s?' || month_amt || '(?:' || sep || month_amt || ')?' || per_month, 'gi') loop
    lo := public.parse_money(m[1]); hi := public.parse_money(coalesce(m[2], m[1]));
    if lo between 1000 and 50000 and hi between lo and lo * 4 then
      hourly_min := round(lo * 12 / 2080, 2); hourly_max := round(hi * 12 / 2080, 2); return;
    end if;
  end loop;

  for m in select regexp_matches(t, hour_label || '\$\s?' || rate || '(?:' || sep || rate || ')?', 'gi') loop
    lo := m[1]::numeric; hi := coalesce(m[2], m[1])::numeric;
    if lo between 7 and 300 and hi between lo and lo * 4 then
      hourly_min := lo; hourly_max := hi; return;
    end if;
  end loop;

  for m in select regexp_matches(t,
      '(?:\$\s?' || amt || '\s*(?:USD\s*)?(?:(?:/\s*|per\s+|an?\s+)(?:year|yr|annum)\M|annually\M))'
      || '|(?:(?:salary|base pay|compensation)[^$.]{0,40}\$\s?' || amt || ')', 'gi') loop
    lo := public.parse_money(coalesce(m[1], m[2]));
    if lo between 15000 and 1000000 then annual_min := lo; annual_max := lo; return; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Estimated pay
-- ---------------------------------------------------------------------------
-- Two-letter code of the first US state in a location string ("Charlotte,
-- NC", "Austin, Texas, United States", "Seattle"), else null.
create function public.us_state_from_location(p_location text)
returns text
language sql
stable
set search_path = ''
as $$
  with cities (city, state) as (values
    ('New York', 'NY'), ('NYC', 'NY'), ('Manhattan', 'NY'), ('Brooklyn', 'NY'), ('San Francisco', 'CA'), ('Los Angeles', 'CA'), ('San Diego', 'CA'),
    ('San Jose', 'CA'), ('Palo Alto', 'CA'), ('Mountain View', 'CA'), ('Seattle', 'WA'), ('Boston', 'MA'),
    ('Chicago', 'IL'), ('Austin', 'TX'), ('Dallas', 'TX'), ('Houston', 'TX'), ('Atlanta', 'GA'),
    ('Denver', 'CO'), ('Charlotte', 'NC'), ('Raleigh', 'NC'), ('Miami', 'FL'), ('Philadelphia', 'PA'),
    ('Pittsburgh', 'PA'), ('Phoenix', 'AZ'), ('Washington, D.C.', 'DC'), ('Washington DC', 'DC'))
  select state from (
    -- Abbreviations ("NC") beat names, so "Washington, DC" is DC.
    select s.state, 0 as rank, strpos(p_location, s.state) as pos
    from public.pay_state_index s where p_location ~ ('\m' || s.state || '\M')
    union all
    select s.state, 1, strpos(lower(p_location), lower(s.state_name))
    from public.pay_state_index s where p_location ~* ('\m' || s.state_name || '\M')
    union all
    select c.state, 2, strpos(lower(p_location), lower(c.city))
    from cities c where p_location ~* ('\m' || c.city || '\M')
  ) found
  order by rank, pos
  limit 1
$$;

create function public.estimate_pay(
  p_title text, p_employment_type text, p_location text, p_source text,
  out pay_min numeric, out pay_max numeric, out pay_period text)
language plpgsql
stable
set search_path = ''
as $$
declare
  b public.pay_benchmarks;
  v_state text;
  v_index numeric := 1;
  lo numeric;
  hi numeric;
begin
  -- Arbeitnow lists European jobs; BLS is US-only.
  if p_source = 'arbeitnow' then return; end if;
  v_state := public.us_state_from_location(p_location);
  if v_state is not null then
    -- Damped: an all-occupation index overstates places like DC (1.8x).
    select least(greatest(wage_index, 0.85), 1.25) into v_index
    from public.pay_state_index where state = v_state;
  elsif not (p_location is null
             or p_source in ('adzuna', 'usajobs')  -- US-only sources ("Pimmit, Fairfax County")
             or p_location ~* '^\s*(fully\s+)?remote\s*$'
             or p_location ~* '\m(US|USA|United States|U\.S\.)\M') then
    return;  -- outside the US, or a place we can't place
  end if;

  -- Unclassified roles ("other") would get all-occupation wages, which are
  -- badly off for e.g. quant internships: no estimate beats a wrong one.
  select * into b from public.pay_benchmarks
  where job_function = public.classify_job_function(p_title) and job_function <> 'other';
  if not found then return; end if;

  -- BLS has no intern wages; interns are estimated at the field's 10th-25th
  -- percentile hourly rate. Hourly = annual / 2080.
  if p_employment_type = 'internship' then
    lo := b.p10; hi := b.p25; pay_period := 'hour';
  elsif p_employment_type in ('part_time', 'temporary') then
    lo := b.p10; hi := b.p50; pay_period := 'hour';
  elsif p_employment_type = 'contract' then
    lo := b.p25; hi := b.p75; pay_period := 'hour';
  elsif p_title ~* '\m(senior|sr|lead|staff|principal|manager|director|head)\M' then
    lo := b.p50; hi := b.p90; pay_period := 'year';
  elsif p_title ~* '\m(junior|jr|entry|associate|new grad|graduate|assistant|apprentice)\M' then
    lo := b.p10; hi := b.p50; pay_period := 'year';
  else
    lo := b.p25; hi := b.p75; pay_period := 'year';
  end if;

  if pay_period = 'hour' then
    pay_min := round(round(lo * v_index / 2080 * 2) / 2, 2);  -- nearest $0.50
    pay_max := round(round(hi * v_index / 2080 * 2) / 2, 2);
  else
    pay_min := round(lo * v_index, -3);              -- nearest $1,000
    pay_max := round(hi * v_index, -3);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trigger: stated pay from the description, else an estimate
-- ---------------------------------------------------------------------------
create function public.fill_job_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p record;
  e record;
begin
  if coalesce(new.salary_min, new.salary_max, new.hourly_min, new.hourly_max) is null then
    select * into p from public.parse_stated_pay(new.description);
    new.salary_min := p.annual_min;
    new.salary_max := p.annual_max;
    new.hourly_min := p.hourly_min;
    new.hourly_max := p.hourly_max;
  end if;

  if coalesce(new.salary_min, new.salary_max, new.hourly_min, new.hourly_max) is not null then
    new.est_pay_min := null; new.est_pay_max := null; new.est_pay_period := null; new.est_pay_source := null;
  elsif new.source = 'adzuna' and new.est_pay_source = 'adzuna' and new.est_pay_min is not null then
    null;  -- keep Adzuna's own prediction (set by the importer)
  else
    -- employment_type is already set: jobs_classify runs first (alphabetical).
    select * into e from public.estimate_pay(new.title, new.employment_type, new.location, new.source);
    new.est_pay_min := e.pay_min;
    new.est_pay_max := e.pay_max;
    new.est_pay_period := e.pay_period;
    new.est_pay_source := case when e.pay_min is not null then 'bls' end;
  end if;
  return new;
end $$;

create trigger jobs_pay before insert or update on public.jobs
  for each row execute function public.fill_job_pay();

-- Backfill. Pay columns aren't embedding inputs, so no embeddings are cleared.
update public.jobs set est_pay_min = est_pay_min;

-- ---------------------------------------------------------------------------
-- Feed RPC: hourly + estimated pay, annualized for salary filters and sort
-- ---------------------------------------------------------------------------
drop function if exists public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text, text[], text[], text[], text, text);

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
  p_sponsorship text default null,
  p_include_estimates boolean default false
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
  hourly_min numeric,
  hourly_max numeric,
  est_pay_min numeric,
  est_pay_max numeric,
  est_pay_period text,
  est_pay_source text,
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
  v_estimates boolean := coalesce(p_include_estimates, false);
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
  with pay as (
    select j.*,
      -- Top of the range, annualized (hourly x 2080) so hourly and salaried
      -- jobs compare against the same "minimum salary".
      coalesce(j.salary_max, j.salary_min, j.hourly_max * 2080, j.hourly_min * 2080) as stated_annual,
      case when v_estimates then
        coalesce(j.est_pay_max, j.est_pay_min) * case when j.est_pay_period = 'hour' then 2080 else 1 end
      end as est_annual
    from public.jobs j
    where j.is_active
  )
  select
    j.id, j.recruiter_id, j.title, j.company_name, j.company_logo,
    j.description, j.location, j.is_remote, j.salary_min, j.salary_max,
    j.hourly_min, j.hourly_max, j.est_pay_min, j.est_pay_max, j.est_pay_period, j.est_pay_source,
    j.required_skills, j.created_at, j.source, j.apply_url,
    j.employment_type, j.workplace_type, j.job_function, j.sponsors_visa,
    public.match_pct(j.embedding operator(extensions.<=>) v_embedding) as match_score_percentage
  from pay j
  where (not coalesce(p_remote_only, false) or j.is_remote)
    and (p_min_salary is null or coalesce(j.stated_annual, j.est_annual) >= p_min_salary)
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
    and (not coalesce(p_salary_listed, false) or coalesce(j.stated_annual, j.est_annual) is not null)
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
    case when v_sort = 'salary' then coalesce(j.stated_annual, j.est_annual) end desc nulls last,
    j.created_at desc
  limit greatest(1, least(p_limit, 100));
end $$;

revoke execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text, text[], text[], text[], text, text, boolean) from public, anon;
grant execute on function public.get_recommended_jobs_for_candidate(uuid, int, boolean, int, text, text, int, text, boolean, boolean, boolean, int, text, text[], text[], text[], text, text, boolean) to authenticated;
