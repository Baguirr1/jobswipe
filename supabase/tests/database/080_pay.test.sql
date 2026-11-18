-- Stated pay parsed from descriptions, BLS/Adzuna estimates, and the feed's
-- salary filters over hourly and estimated pay.
begin;
select plan(55);
select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- parse_stated_pay
-- ---------------------------------------------------------------------------
-- concat_ws over all-null fields gives '', so '' means "nothing found".
create function pg_temp.pay(t text) returns text language sql as $$
  select concat_ws('/', annual_min, annual_max, hourly_min, hourly_max) from public.parse_stated_pay(t)
$$;
select is(pg_temp.pay('The base salary range is $120,000 - $150,000 per year.'), '120000/150000', 'annual range with commas');
select is(pg_temp.pay('Pay: $120,000.00 – $150,000.00 USD'), '120000/150000', 'annual range with cents, en dash, USD');
select is(pg_temp.pay('Compensation: $95k to $110K'), '95000/110000', 'annual range in k');
select is(pg_temp.pay('Interns earn $25 - $35/hour.'), '25/35', 'hourly range');
select is(pg_temp.pay('This role pays $40-45/hr'), '40/45', 'hourly range without a second $');
select is(pg_temp.pay('Salary Range: $26/hr to $31/hr'), '26/31', 'hourly range with a unit on both ends');
select is(pg_temp.pay('Hourly rate: $27.50 per hour'), '27.50/27.50', 'single hourly rate');
select is(pg_temp.pay('Starting at $22 an hour, plus benefits'), '22/22', '"an hour"');
select is(pg_temp.pay('Salary: $85,000 plus equity'), '85000/85000', 'single salary with context');
select is(pg_temp.pay('$90,000 per year'), '90000/90000', 'single salary per year');
select is(pg_temp.pay('We raised $100 million and offer a $5,000 signing bonus.'), '', 'funding and bonuses are not pay');
select is(pg_temp.pay('401k matching, $1,000 learning stipend'), '', 'small amounts are not pay');
select is(pg_temp.pay('$25,000 - $500,000'), '', 'implausible spread is ignored');
select is(pg_temp.pay('No pay mentioned.'), '', 'nothing stated');
select is(pg_temp.pay('Annual Salary Range $153,120&mdash;$196,750 USD'), '153120/196750', 'HTML-encoded dash');
select is(pg_temp.pay('Hourly Rate: $40&mdash;$40 USD'), '40/40', 'hourly label before the amount');
select is(pg_temp.pay('Pay Range: Level 1: $22.00 - $24.50 Level 2: $24.00 - $27.00'), '22.00/24.50', 'pay range label, hourly amounts');
select is(pg_temp.pay('The salary for this position is $7,000 - $9,500 monthly.'), '40.38/54.81', 'monthly range converted to hourly');
select is(pg_temp.pay('This position is estimated to be $10,500/month.'), '60.58/60.58', 'single monthly amount');
select is(pg_temp.pay('We raised $781M and our hourly pay is great, valued at $22B.'), '', 'hourly label does not pick up $781M or $22B');

-- ---------------------------------------------------------------------------
-- Location and estimates
-- ---------------------------------------------------------------------------
select is(public.us_state_from_location('Charlotte, NC'), 'NC', 'state: abbreviation');
select is(public.us_state_from_location('Austin, Texas, United States'), 'TX', 'state: name');
select is(public.us_state_from_location('Washington, DC'), 'DC', 'state: abbreviation beats the name "Washington"');
select is(public.us_state_from_location('Seattle'), 'WA', 'state: big city');
select is(public.us_state_from_location('London, UK'), null, 'state: none outside the US');

create function pg_temp.est(title text, kind text, loc text, src text default 'greenhouse') returns text language sql as $$
  select concat_ws('/', pay_min, pay_max, pay_period) from public.estimate_pay(title, kind, loc, src)
$$;
-- Software Developers national p25-p75 = 105,210-171,980.
select is(pg_temp.est('Software Engineer', 'full_time', 'Remote'), '105000/172000/year', 'remote full-time: national p25-p75');
-- NC index 0.941.
select is(pg_temp.est('Software Engineer', 'full_time', 'Charlotte, NC'), '99000/162000/year', 'state index applies');
select is(pg_temp.est('Senior Software Engineer', 'full_time', 'Remote'), '136000/215000/year', 'senior: p50-p90');
select is(pg_temp.est('Junior Software Engineer', 'full_time', 'Remote'), '82000/136000/year', 'entry: p10-p50');
-- 82,460 / 2080 = 39.64 -> 39.5; 105,210 / 2080 = 50.58 -> 50.5
select is(pg_temp.est('Software Engineering Intern', 'internship', 'Remote'), '39.50/50.50/hour', 'internship: hourly p10-p25');
-- DC index 1.796 is capped at 1.25.
select is(pg_temp.est('Software Engineer', 'full_time', 'Washington, DC'), '132000/215000/year', 'state index is capped');
select is(pg_temp.est('Software Engineer', 'full_time', 'London, UK'), '', 'no estimate outside the US');
select is(pg_temp.est('Software Engineer', 'full_time', 'Remote', 'arbeitnow'), '', 'no estimate for Arbeitnow (European listings)');
select is(pg_temp.est('Barista', 'part_time', 'Remote'), '', 'no estimate for unclassified roles');
select is(pg_temp.est('Software Engineer', 'full_time', 'Pimmit, Fairfax County', 'adzuna'), '105000/172000/year',
  'US-only sources fall back to national pay when the state is unknown');
select is(pg_temp.est('Software Engineer', 'full_time', 'Grand Rapids', 'freehire'), '105000/172000/year',
  'freehire (queried US-only) also falls back to national pay');
select is(pg_temp.est('Junior Data Engineer', 'full_time', 'Poland', 'freehire'), '',
  'explicit country overrides the Freehire source fallback');
select is(pg_temp.est('Software Engineer', 'full_time', 'Remote (Canada)', 'adzuna'), '',
  'remote work and Adzuna source do not imply US location');
select is(pg_temp.est('Software Engineer', 'full_time', 'Barcelona, CT, Spain'), '',
  'explicit foreign country overrides a US state abbreviation');
select ok(pg_temp.est('Software Engineer', 'full_time', 'New Mexico') <> '',
  'New Mexico remains eligible for US estimates');
select is(public.classify_job_function('Quantitative Researcher Intern'), 'data', 'function: quant roles are data');
select is(public.classify_job_function('Hardware Test Co-op'), 'engineering', 'function: hardware roles are engineering');
select is(public.classify_job_function('UX Researcher'), 'design', 'function: UX research is design');

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
update public.jobs set is_active = false
where id not in ('b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
                 'b0000000-0000-4000-8000-00000000000c');
-- Job A (Acme, no location) keeps a $80k salary; the others below are unseen by c2.
update public.jobs set salary_min = 80000, location = 'Remote' where id = 'b0000000-0000-4000-8000-00000000000a';
insert into public.jobs (id, recruiter_id, title, company_name, location, description) values
  ('f0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Data Analyst Intern', 'Initech', 'Austin, TX', 'Interns earn $30 - $36/hour.'),
  ('f0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Software Engineer', 'Initech', 'Remote', 'Great team.');

select is((select concat_ws('/', salary_min, hourly_min, hourly_max, est_pay_source) from public.jobs
           where id = 'f0000000-0000-4000-8000-000000000001'),
  '30.00/36.00', 'hourly pay is read from the description, with no estimate');
select is((select concat_ws('/', salary_min, est_pay_min, est_pay_max, est_pay_period, est_pay_source) from public.jobs
           where id = 'f0000000-0000-4000-8000-000000000002'),
  '105000.00/172000.00/year/bls', 'no stated pay: BLS estimate');
update public.jobs set salary_min = 140000 where id = 'f0000000-0000-4000-8000-000000000002';
select is((select concat_ws('/', salary_min, est_pay_min) from public.jobs where id = 'f0000000-0000-4000-8000-000000000002'),
  '140000', 'a stated salary clears the estimate');
update public.jobs set salary_min = null where id = 'f0000000-0000-4000-8000-000000000002';
insert into public.jobs (id, recruiter_id, title, company_name, location, source, external_id, apply_url,
                         est_pay_min, est_pay_max, est_pay_period, est_pay_source) values
  ('f0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Software Engineer', 'Hooli',
   'Remote, USA', 'adzuna', 'test-1', 'https://example.com', 111000, 111000, 'year', 'adzuna'),
  ('f0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'Software Engineer', 'Hooli',
   'Remote', 'jobswipe', null, null, 1, 1, 'year', 'adzuna');
select is((select concat_ws('/', est_pay_min, est_pay_source) from public.jobs where id = 'f0000000-0000-4000-8000-000000000003'),
  '111000.00/adzuna', 'Adzuna''s own prediction is kept for Adzuna jobs');
select is((select est_pay_source from public.jobs where id = 'f0000000-0000-4000-8000-000000000004'),
  'bls', 'other jobs can''t pass off an estimate as Adzuna''s');
insert into public.jobs (id, recruiter_id, title, company_name, location, source, external_id, apply_url)
values ('f0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001',
  'Junior Data Engineer', 'N-iX', 'Poland', 'freehire', 'test-poland', 'https://example.com/poland');
select is((select concat_ws('/', est_pay_min, est_pay_max, est_pay_period, est_pay_source) from public.jobs
           where id = 'f0000000-0000-4000-8000-000000000005'),
  '', 'the pay trigger stores no BLS estimate for Poland');

-- ---------------------------------------------------------------------------
-- Feed: c2 sees A ($80k), f1 ($36/hr = $74,880/yr), f2/f3/f4 (estimates only)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('c2000000-0000-4000-8000-000000000002');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_salary_listed => true)),
  2::bigint, 'salary listed counts hourly pay but not estimates');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_salary_listed => true, p_include_estimates => true)),
  5::bigint, 'salary listed with estimates included');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_min_salary => 70000)),
  2::bigint, 'minimum salary compares hourly pay annualized');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_min_salary => 150000, p_include_estimates => true)),
  2::bigint, 'minimum salary uses the top of estimated ranges when included');
select is((select id::text from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_sort => 'salary') limit 1),
  'b0000000-0000-4000-8000-00000000000a', 'salary sort ranks stated pay; estimates excluded by default');
select is((select id::text from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_sort => 'salary', p_include_estimates => true) offset 5 limit 1),
  'f0000000-0000-4000-8000-000000000005', 'salary sort puts the job without pay after jobs with pay');

select * from finish();
rollback;
