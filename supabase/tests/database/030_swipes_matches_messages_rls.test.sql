-- swipes, recruiter_swipes, matches, messages: participants only; writes go
-- through RPCs.
begin;
select plan(17);
select tests.seed_fixtures();

-- Candidate c1 (swiped right on job_a, matched with r1)
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.swipes), 1, 'a candidate sees only their own swipes');
select throws_ok($$ insert into public.swipes (candidate_id, job_id, direction)
                    values ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', 'right') $$,
  '42501', null, 'swipes cannot be inserted directly (swipe_job RPC only)');
select is((select count(*)::int from public.recruiter_swipes), 0, 'a candidate cannot read recruiter swipes');
select is((select count(*)::int from public.matches), 1, 'a candidate sees their match');
select is((select count(*)::int from public.messages), 1, 'a participant reads the chat');
select lives_ok($$ insert into public.messages (match_id, sender_id, content)
                   values ('d0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Hello!') $$,
  'a participant can send a message as themselves');
select throws_ok($$ insert into public.messages (match_id, sender_id, content)
                    values ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'forged') $$,
  '42501', null, 'a participant cannot send a message as the other side');
select throws_ok($$ insert into public.matches (candidate_id, job_id, recruiter_id)
                    values ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c',
                            'a2000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'matches cannot be created directly');

-- Candidate c2 (no match)
select tests.authenticate_as('c2000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.matches), 0, 'an outsider sees no matches');
select is((select count(*)::int from public.messages), 0, 'an outsider cannot read the chat');
select throws_ok($$ insert into public.messages (match_id, sender_id, content)
                    values ('d0000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'let me in') $$,
  '42501', null, 'an outsider cannot post into someone else''s chat');

-- Recruiter r1 (owns job_a, job_b)
select tests.authenticate_as('a1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.swipes), 1, 'a recruiter sees swipes on their own jobs only');
select is((select count(*)::int from public.recruiter_swipes), 1, 'a recruiter sees their own recruiter swipes');
select is((select count(*)::int from public.matches), 1, 'a recruiter sees their match');

-- Recruiter r2 (owns job_c, which c2 swiped on)
select tests.authenticate_as('a2000000-0000-4000-8000-000000000002');
select is((select candidate_id::text from public.swipes), 'c2000000-0000-4000-8000-000000000002',
  'another recruiter sees only the swipe on their job');
select is((select count(*)::int from public.recruiter_swipes), 0, 'recruiter swipes are private to their owner');

select tests.as_anon();
select is((select count(*)::int from public.swipes) + (select count(*)::int from public.matches)
          + (select count(*)::int from public.messages), 0, 'anon reads no swipes, matches or messages');

select * from finish();
rollback;
