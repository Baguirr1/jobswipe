-- security definer RPCs bypass RLS, so each must check the caller itself.
begin;
select plan(21);
select tests.seed_fixtures();
-- The feed-filter counts below assume only fixture jobs exist: hide jobs from
-- seed.sql (rolled back with the rest of this file).
update public.jobs set is_active = false
where id not in ('b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
                 'b0000000-0000-4000-8000-00000000000c');
-- Round-two fixtures: only Job A is unseen by c2; Job C is unseen by c1.
update public.jobs set salary_min = 80000, required_skills = array['TypeScript']
where id = 'b0000000-0000-4000-8000-00000000000a';
update public.profiles set skills = array['typescript']
where id = 'c2000000-0000-4000-8000-000000000002';
-- External listings need both external_id and apply_url (jobs_external_fields).
update public.jobs set source = 'external', external_id = 'globex:job-c',
       apply_url = 'https://example.com/apply'
where id = 'b0000000-0000-4000-8000-00000000000c';

-- Recruiter r2 poking at r1's job
select tests.authenticate_as('a2000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.get_candidates_for_job('b0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'get_candidates_for_job: only the job''s recruiter');
select throws_ok($$ select public.swipe_candidate('b0000000-0000-4000-8000-00000000000a',
                                                  'c1000000-0000-4000-8000-000000000001', 'right') $$,
  '42501', null, 'swipe_candidate: only the job''s recruiter');
select throws_ok($$ select public.get_job_insights('b0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'get_job_insights: only the job''s recruiter');
select lives_ok($$ select * from public.get_candidates_for_job('b0000000-0000-4000-8000-00000000000c') $$,
  'get_candidates_for_job works for the owner');

-- Candidate c2 poking at c1
select tests.authenticate_as('c2000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.get_recommended_jobs_for_candidate('c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'get_recommended_jobs_for_candidate: only for yourself');
select lives_ok($$ select * from public.get_recommended_jobs_for_candidate('c2000000-0000-4000-8000-000000000002') $$,
  'get_recommended_jobs_for_candidate works for yourself');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_keyword => '  aCmE  ')),
  1::bigint, 'keyword matches company case-insensitively and trims whitespace');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_level => 'senior')),
  0::bigint, 'senior filter excludes titles without a senior marker');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_quick_apply_only => true)),
  1::bigint, 'quick apply includes in-app jobs');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_salary_listed => true)),
  1::bigint, 'salary listed includes a salary_min without salary_max');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_skills_match => true)),
  1::bigint, 'skills overlap is case-insensitive');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_min_match => 50)),
  0::bigint, 'minimum match excludes jobs without a score');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c2000000-0000-4000-8000-000000000002', p_sort => 'unknown')),
  1::bigint, 'unknown sort falls back to match');
select throws_ok($$ select public.swipe_job('b0000000-0000-4000-8000-00000000000b', 'right') $$,
  'P0002', null, 'swipe_job rejects inactive jobs');
select throws_ok($$ select public.set_saved_job_applied('b0000000-0000-4000-8000-00000000000a', true) $$,
  'P0002', null, 'set_saved_job_applied only touches your own saved jobs');

-- c1's undo after a match is refused, so a match can't be orphaned.
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.undo_swipe('b0000000-0000-4000-8000-00000000000a') $$,
  'P0001', null, 'undo_swipe refuses once the swipe produced a match');

select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c1000000-0000-4000-8000-000000000001', p_quick_apply_only => true)),
  0::bigint, 'quick apply excludes external jobs');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c1000000-0000-4000-8000-000000000001', p_salary_listed => true)),
  0::bigint, 'salary listed excludes jobs without either salary');
select is((select count(*) from public.get_recommended_jobs_for_candidate(
  'c1000000-0000-4000-8000-000000000001', p_skills_match => true)),
  0::bigint, 'skills match excludes jobs when candidate has no skills');

-- Signed out: no RPC access at all.
select tests.as_anon();
select throws_ok($$ select public.swipe_job('b0000000-0000-4000-8000-00000000000a', 'right') $$,
  '42501', null, 'anon cannot call swipe_job');
select throws_ok($$ select * from public.get_recommended_jobs_for_candidate('c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call get_recommended_jobs_for_candidate');

select * from finish();
rollback;
