-- Handshake-style filters: the job type / location type / function /
-- sponsorship classifiers, the jobs_classify trigger and the feed filters.
begin;
select plan(43);
select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- Classifiers
-- ---------------------------------------------------------------------------
select is(public.classify_employment_type('Software Engineering Intern', ''), 'internship', 'employment: intern in title');
select is(public.classify_employment_type('Internal Audit Associate', ''), 'full_time', 'employment: "Internal" is not an internship');
select is(public.classify_employment_type('Barista - Part Time', ''), 'part_time', 'employment: part time in title');
select is(public.classify_employment_type('Analyst', 'This is a part-time position for students.'), 'part_time', 'employment: part-time position in description');
select is(public.classify_employment_type('Contract Recruiter', ''), 'contract', 'employment: contract');
select is(public.classify_employment_type('Seasonal Associate', ''), 'temporary', 'employment: seasonal');
select is(public.classify_employment_type('Software Engineer', 'Full benefits.'), 'full_time', 'employment: defaults to full-time');

select is(public.classify_workplace_type('Engineer', 'Hybrid - New York, NY', false), 'hybrid', 'workplace: hybrid in location');
select is(public.classify_workplace_type('Engineer', 'New York, NY', true), 'remote', 'workplace: remote flag');
select is(public.classify_workplace_type('Engineer', 'New York, NY', false), 'onsite', 'workplace: otherwise on-site');

select is(public.classify_job_function('Data Engineer'), 'data', 'function: data beats engineering');
select is(public.classify_job_function('Senior Software Engineer'), 'engineering', 'function: engineering');
select is(public.classify_job_function('Product Designer'), 'design', 'function: design beats product');
select is(public.classify_job_function('Product Manager Intern'), 'product', 'function: product');
select is(public.classify_job_function('Product Marketing Manager'), 'marketing', 'function: product marketing is marketing');
select is(public.classify_job_function('Account Executive'), 'sales', 'function: sales');
select is(public.classify_job_function('Financial Analyst'), 'finance', 'function: finance');
select is(public.classify_job_function('Technical Recruiter'), 'people', 'function: recruiting');
select is(public.classify_job_function('Registered Nurse'), 'healthcare', 'function: healthcare');
select is(public.classify_job_function('Barista'), 'other', 'function: other');

select is(public.classify_sponsors_visa('We are unable to sponsor visas.'), false, 'sponsorship: unable to sponsor');
select is(public.classify_sponsors_visa('You must be authorized to work in the US without sponsorship.'), false, 'sponsorship: without sponsorship');
select is(public.classify_sponsors_visa('Applicants must not require sponsorship now or in the future.'), false, 'sponsorship: must not require');
select is(public.classify_sponsors_visa('Visa sponsorship is available for this role.'), true, 'sponsorship: available');
select is(public.classify_sponsors_visa('We offer H-1B sponsorship.'), true, 'sponsorship: offers H-1B');
select is(public.classify_sponsors_visa('We do not discriminate. Great team.'), null, 'sponsorship: not mentioned');

-- ---------------------------------------------------------------------------
-- Columns and trigger
-- ---------------------------------------------------------------------------
-- Only fixture jobs plus these four in the feed (rolled back with the file).
update public.jobs set is_active = false
where id not in ('b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
                 'b0000000-0000-4000-8000-00000000000c');
insert into public.jobs (id, recruiter_id, title, company_name, location, is_remote, description) values
  ('e0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Software Engineering Intern', 'Initech', 'Hybrid - Charlotte, NC', false, 'We are unable to sponsor visas.'),
  ('e0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Data Analyst (Part-Time)', 'Hooli', null, true, 'Visa sponsorship is available.'),
  ('e0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
   'Product Designer', 'Initech', 'Austin, TX', false, 'Great team.');
-- The writer's values win over the derived ones; is_remote follows workplace_type.
insert into public.jobs (id, recruiter_id, title, company_name, is_remote, employment_type, workplace_type) values
  ('e0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001',
   'Marketing Coordinator', 'Globex', false, 'contract', 'remote');

select is(
  (select concat_ws('/', employment_type, workplace_type, job_function, sponsors_visa) from public.jobs
   where id = 'e0000000-0000-4000-8000-000000000001'),
  'internship/hybrid/engineering/f',
  'an inserted job is classified from its title, location and description');
select is(
  (select concat_ws('/', employment_type, workplace_type, is_remote) from public.jobs
   where id = 'e0000000-0000-4000-8000-000000000004'),
  'contract/remote/t',
  'explicit job type and location type are kept, and is_remote follows');

-- ---------------------------------------------------------------------------
-- Feed filters (c2 has only swiped Job C, so A + the four above are unseen)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('c2000000-0000-4000-8000-000000000002');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_employment_types => array['internship'])),
  1::bigint, 'job type: internship');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_employment_types => array['full_time', 'part_time'])),
  3::bigint, 'job type: several types are OR-ed');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_workplace_types => array['remote'])),
  2::bigint, 'location type: remote');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_workplace_types => '{}')),
  5::bigint, 'an empty list means no filter');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_job_functions => array['data', 'design'])),
  2::bigint, 'job function');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_company => '  initech ')),
  2::bigint, 'employer: case-insensitive and trimmed');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_sponsorship => 'open')),
  4::bigint, 'sponsorship open: hides jobs that rule it out, keeps ones that don''t say');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_sponsorship => 'offered')),
  1::bigint, 'sponsorship offered: only jobs that say they sponsor');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_employment_types => array['internship'],
  p_workplace_types => array['hybrid'], p_company => 'Initech')),
  1::bigint, 'filters combine with AND');
select is((select employment_type || '/' || workplace_type || '/' || job_function
           from public.get_recommended_jobs_for_candidate('c2000000-0000-4000-8000-000000000002')
           where id = 'e0000000-0000-4000-8000-000000000002'),
  'part_time/remote/data', 'the feed returns the new fields for the card');

-- ---------------------------------------------------------------------------
-- Edits by the recruiter
-- ---------------------------------------------------------------------------
select tests.authenticate_as('a1000000-0000-4000-8000-000000000001');
update public.jobs set title = 'Product Designer Intern' where id = 'e0000000-0000-4000-8000-000000000003';
select is((select employment_type from public.jobs where id = 'e0000000-0000-4000-8000-000000000003'),
  'internship', 'a title edit re-derives the job type the writer didn''t set');
update public.jobs set is_remote = true where id = 'e0000000-0000-4000-8000-000000000003';
select is((select workplace_type from public.jobs where id = 'e0000000-0000-4000-8000-000000000003'),
  'remote', 'toggling is_remote (older app versions) re-derives the location type');
-- The form re-sends the chosen job type with every save; it must survive.
update public.jobs set title = 'Senior Marketing Coordinator', employment_type = 'contract'
where id = 'e0000000-0000-4000-8000-000000000004';
select is(
  (select concat_ws('/', employment_type, workplace_type) from public.jobs
   where id = 'e0000000-0000-4000-8000-000000000004'),
  'contract/remote',
  'a chosen job type and location type survive a title edit');
update public.jobs set title = 'Data Analyst Intern' where id = 'e0000000-0000-4000-8000-000000000003';
select is((select job_function from public.jobs where id = 'e0000000-0000-4000-8000-000000000003'),
  'data', 'job_function follows title edits');
select throws_ok($$ update public.jobs set job_function = 'data' where id = 'e0000000-0000-4000-8000-000000000003' $$,
  '428C9', null, 'job_function cannot be written');

select * from finish();
rollback;
