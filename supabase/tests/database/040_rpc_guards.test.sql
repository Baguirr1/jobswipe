-- security definer RPCs bypass RLS, so each must check the caller itself.
begin;
select plan(11);
select tests.seed_fixtures();

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
select throws_ok($$ select public.swipe_job('b0000000-0000-4000-8000-00000000000b', 'right') $$,
  'P0002', null, 'swipe_job rejects inactive jobs');
select throws_ok($$ select public.set_saved_job_applied('b0000000-0000-4000-8000-00000000000a', true) $$,
  'P0002', null, 'set_saved_job_applied only touches your own saved jobs');

-- c1's undo after a match is refused, so a match can't be orphaned.
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.undo_swipe('b0000000-0000-4000-8000-00000000000a') $$,
  'P0001', null, 'undo_swipe refuses once the swipe produced a match');

-- Signed out: no RPC access at all.
select tests.as_anon();
select throws_ok($$ select public.swipe_job('b0000000-0000-4000-8000-00000000000a', 'right') $$,
  '42501', null, 'anon cannot call swipe_job');
select throws_ok($$ select * from public.get_recommended_jobs_for_candidate('c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call get_recommended_jobs_for_candidate');

select * from finish();
rollback;
