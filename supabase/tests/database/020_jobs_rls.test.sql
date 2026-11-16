-- jobs: active jobs public to signed-in users, owners manage their own,
-- recruiters can't impersonate imported listings.
begin;
select plan(15);
select tests.seed_fixtures();

-- Candidate c1
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.jobs where id in (
    'b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000c')), 2,
  'a candidate sees active jobs');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-4000-8000-00000000000b'), 0,
  'a candidate does not see another recruiter''s inactive job');
select throws_ok($$ insert into public.jobs (recruiter_id, title, company_name)
                    values ('c1000000-0000-4000-8000-000000000001', 'Fake', 'Me') $$,
  '42501', null, 'a candidate cannot post a job');

-- Recruiter r1
select tests.authenticate_as('a1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-4000-8000-00000000000b'), 1,
  'a recruiter sees their own inactive job');
select lives_ok($$ insert into public.jobs (recruiter_id, title, company_name)
                   values ('a1000000-0000-4000-8000-000000000001', 'New role', 'Acme') $$,
  'a recruiter can post a job for themselves');
select throws_ok($$ insert into public.jobs (recruiter_id, title, company_name)
                    values ('a2000000-0000-4000-8000-000000000002', 'Spoof', 'Globex') $$,
  '42501', null, 'a recruiter cannot post a job as another recruiter');
select throws_ok($$ insert into public.jobs (recruiter_id, title, company_name, source, external_id, apply_url)
                    values ('a1000000-0000-4000-8000-000000000001', 'Spoof', 'Acme', 'greenhouse', 'x:1', 'https://x') $$,
  '42501', null, 'a recruiter cannot create a job that pretends to be imported');
select lives_ok($$ update public.jobs set title = 'Job A v2' where id = 'b0000000-0000-4000-8000-00000000000a' $$,
  'a recruiter can edit their own job');
select throws_ok($$ update public.jobs set source = 'greenhouse', external_id = 'x:2', apply_url = 'https://x'
                    where id = 'b0000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'a recruiter cannot turn their job into an imported one');

-- Attacks on r2's job silently match no rows.
update public.jobs set title = 'hijacked' where id = 'b0000000-0000-4000-8000-00000000000c';
delete from public.jobs where id = 'b0000000-0000-4000-8000-00000000000c';

reset role;
select is((select title from public.jobs where id = 'b0000000-0000-4000-8000-00000000000c'), 'Job C',
  'a recruiter cannot edit another recruiter''s job');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-4000-8000-00000000000c'), 1,
  'a recruiter cannot delete another recruiter''s job');

select tests.authenticate_as('a1000000-0000-4000-8000-000000000001');
select lives_ok($$ delete from public.jobs where id = 'b0000000-0000-4000-8000-00000000000b' $$,
  'a recruiter can delete their own job (cascades swipe history)');

select tests.as_anon();
select is((select count(*)::int from public.jobs), 0, 'anon sees no jobs');

-- Regression: updates under an empty search_path (as in security definer
-- RPCs) must still fire the stale-embedding triggers without error.
reset role;
select lives_ok($$ select tests.update_as_secure_rpc('job') $$,
  'job update works under search_path = '''' (stale-embedding trigger)');
select lives_ok($$ select tests.update_as_secure_rpc('profile') $$,
  'profile update works under search_path = '''' (stale-embedding trigger)');

select * from finish();
rollback;
