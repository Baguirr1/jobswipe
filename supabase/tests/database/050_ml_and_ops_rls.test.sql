-- swipe_events (training snapshots) and import_runs/import_health (ops data).
begin;
select plan(13);
select tests.seed_fixtures();

-- Fixture swipes went through the trigger: one event each for c1 and c2.
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.swipe_events), 1, 'a candidate sees only their own swipe events');
select is((select job_title from public.swipe_events
            where candidate_id = 'c1000000-0000-4000-8000-000000000001' limit 1),
  'Job A', 'the event holds the job snapshot');
select throws_ok($$ insert into public.swipe_events (candidate_id, job_id, direction)
                    values ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000c', 'right') $$,
  '42501', null, 'clients cannot insert swipe events');
select throws_ok($$ update public.swipe_events set direction = 'left' $$,
  '42501', null, 'clients cannot rewrite swipe events');
select throws_ok($$ delete from public.swipe_events $$,
  '42501', null, 'clients cannot delete swipe events');

select tests.authenticate_as('a1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.swipe_events), 0,
  'recruiters cannot read candidates'' swipe events, even on their own jobs');

-- Ops tables are service-role only.
select throws_ok($$ select * from public.import_runs $$, '42501', null, 'authenticated cannot read import_runs');
select throws_ok($$ insert into public.import_runs (started_at, ok) values (now(), true) $$,
  '42501', null, 'authenticated cannot write import_runs');
select throws_ok($$ select * from public.import_health $$, '42501', null, 'authenticated cannot read import_health');
select throws_ok($$ select public.prune_import_runs() $$, '42501', null, 'authenticated cannot prune import_runs');
select ok(not has_sequence_privilege('authenticated', 'public.swipe_events_id_seq', 'USAGE'),
  'authenticated has no access to the swipe_events id sequence');

select ok(not has_sequence_privilege('authenticated', 'public.import_runs_id_seq', 'USAGE'),
  'authenticated has no access to the import_runs id sequence');

select tests.as_anon();
select throws_ok($$ select * from public.swipe_events $$, '42501', null, 'anon cannot read swipe events');

select * from finish();
rollback;
