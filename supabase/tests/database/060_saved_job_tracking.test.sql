-- Application tracker: stages and private notes on saved jobs.
-- Fixtures: c2 has a right swipe on Job C (recruiter a2); c1 has none on Job C.
begin;
select plan(14);
select tests.seed_fixtures();

select tests.authenticate_as('c2000000-0000-4000-8000-000000000002');

select lives_ok($$ select public.set_saved_job_stage('b0000000-0000-4000-8000-00000000000c', 'interviewing') $$,
  'candidate can move their saved job to a stage');
select is((select stage from public.saved_job_tracking
            where job_id = 'b0000000-0000-4000-8000-00000000000c'),
  'interviewing', 'stage is stored');
select isnt((select applied_at from public.swipes
              where candidate_id = 'c2000000-0000-4000-8000-000000000002'
                and job_id = 'b0000000-0000-4000-8000-00000000000c'),
  null, 'a stage past saved marks the swipe as applied');

select lives_ok($$ select public.set_saved_job_note('b0000000-0000-4000-8000-00000000000c', '  Talked to Sarah, follow up Friday  ') $$,
  'candidate can add a note');
select is((select note from public.saved_job_tracking
            where job_id = 'b0000000-0000-4000-8000-00000000000c'),
  'Talked to Sarah, follow up Friday', 'note is stored trimmed');
select is((select stage from public.saved_job_tracking
            where job_id = 'b0000000-0000-4000-8000-00000000000c'),
  'interviewing', 'saving a note keeps the stage');

select throws_ok($$ select public.set_saved_job_stage('b0000000-0000-4000-8000-00000000000c', 'hired') $$,
  '22023', null, 'unknown stages are rejected');
select throws_ok($$ select public.set_saved_job_note('b0000000-0000-4000-8000-00000000000c', repeat('x', 1001)) $$,
  '22001', null, 'notes over 1000 characters are rejected');
select throws_ok($$ insert into public.saved_job_tracking (candidate_id, job_id, note)
                    values ('c2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000a', 'x') $$,
  '42501', null, 'clients cannot write tracking rows directly');

select lives_ok($$ select public.set_saved_job_stage('b0000000-0000-4000-8000-00000000000c', 'saved') $$,
  'candidate can move a job back to saved');
select is((select applied_at from public.swipes
            where candidate_id = 'c2000000-0000-4000-8000-000000000002'
              and job_id = 'b0000000-0000-4000-8000-00000000000c'),
  null, 'moving back to saved clears applied_at');

-- Notes are private: not the job's recruiter, not other candidates.
select tests.authenticate_as('a2000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.saved_job_tracking), 0,
  'the job''s recruiter cannot read the candidate''s tracker or notes');

select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.set_saved_job_stage('b0000000-0000-4000-8000-00000000000c', 'offer') $$,
  'P0002', null, 'a candidate cannot track a job they have not saved');

-- Un-saving (e.g. undo or remove) drops the tracker so a re-save starts clean.
reset role;
update public.swipes set direction = 'left'
 where candidate_id = 'c2000000-0000-4000-8000-000000000002'
   and job_id = 'b0000000-0000-4000-8000-00000000000c';
select is((select count(*)::int from public.saved_job_tracking
            where candidate_id = 'c2000000-0000-4000-8000-000000000002'),
  0, 'un-saving a job deletes its tracking row');

select * from finish();
rollback;
