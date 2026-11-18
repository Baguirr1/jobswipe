-- Check explicit location evidence before the importer-source fallback.
-- Keep this country check in sync with isLikelyNonUS in src/lib/format.ts.
create or replace function public.is_likely_non_us(p_location text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (location ~* '\m(US|USA|United States)\M|\mU\.S\.(?:A\.)?')
    and regexp_replace(location, '\mNew\s+Mexico\M', '', 'gi')
      ~* '\m(United Kingdom|UK|Canada|Mexico|Poland|Germany|France|Spain|Portugal|Italy|Netherlands|Ireland|Belgium|Switzerland|Austria|Denmark|Norway|Sweden|Finland|Iceland|Czechia|Czech Republic|Slovakia|Romania|Hungary|Bulgaria|Greece|Ukraine|Lithuania|Latvia|Estonia|Serbia|Croatia|Turkey|Israel|United Arab Emirates|Saudi Arabia|Qatar|Egypt|South Africa|Nigeria|Kenya|Morocco|India|Pakistan|Bangladesh|Sri Lanka|Nepal|China|Japan|South Korea|Taiwan|Hong Kong|Singapore|Philippines|Indonesia|Malaysia|Vietnam|Thailand|Australia|New Zealand|Brazil|Argentina|Chile|Colombia|Peru|Costa Rica|Dominican Republic|Europe|EMEA|APAC|LATAM|Latin America|South America|Middle East|Asia|Africa)\M|\mU\.K\.'
  from (select coalesce(p_location, '') as location) as job_location
$$;

create or replace function public.estimate_pay(
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
  if p_source = 'arbeitnow' or public.is_likely_non_us(p_location) then return; end if;
  v_state := public.us_state_from_location(p_location);
  if v_state is not null then
    -- Damped: an all-occupation index overstates places like DC (1.8x).
    select least(greatest(wage_index, 0.85), 1.25) into v_index
    from public.pay_state_index where state = v_state;
  elsif not (p_location is null
             or p_source in ('adzuna', 'usajobs', 'freehire')  -- US-source fallback for ambiguous locations
             or p_location ~* '^\s*(fully\s+)?remote\s*$'
             or p_location ~* '\m(US|USA|United States)\M|\mU\.S\.(?:A\.)?') then
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

-- The jobs_pay trigger uses the updated estimator on this update and on future writes.
-- The feed already uses these columns for estimated-pay filtering and sorting.
update public.jobs
set est_pay_min = null, est_pay_max = null, est_pay_period = null, est_pay_source = null
where est_pay_source = 'bls' and public.is_likely_non_us(location);
