-- profiles: self-only reads, own-row writes, locked role, get_profile_cards().
begin;
select plan(15);
select tests.seed_fixtures();

-- c1: candidate, matched with r1. c2: unrelated candidate. r1: recruiter.
select tests.authenticate_as('c1000000-0000-4000-8000-000000000001');

select is((select count(*)::int from public.profiles), 1,
  'a user sees exactly one profile row: their own');
select is((select resume_text from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  'c1 private resume', 'a user reads their own private fields');
select is((select count(*)::int from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), 0,
  'a match counterpart''s profile row is not readable directly');
select is((select count(*)::int from public.profiles where id = 'c2000000-0000-4000-8000-000000000002'), 0,
  'an unrelated user''s profile is not readable');

-- Writes to someone else's row match no rows (no error, no change).
update public.profiles set bio = 'hacked' where id = 'c2000000-0000-4000-8000-000000000002';
select lives_ok($$ update public.profiles set bio = 'my bio' where id = 'c1000000-0000-4000-8000-000000000001' $$,
  'a user can update their own profile');
select throws_ok($$ update public.profiles set role = 'recruiter' where id = 'c1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a user cannot change their own role');
select throws_ok($$ insert into public.profiles (id, role) values (gen_random_uuid(), 'recruiter') $$,
  '42501', null, 'clients cannot insert profiles directly');

-- get_profile_cards: only id/name/avatar, only self + match counterparts.
select is((select count(*)::int from public.get_profile_cards(array[
    'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002']::uuid[])), 2,
  'get_profile_cards returns self and match counterpart only');
select is((select full_name from public.get_profile_cards(array['a1000000-0000-4000-8000-000000000001']::uuid[])),
  'Rec One', 'get_profile_cards returns the counterpart''s name');
select is((select count(*)::int from public.get_profile_cards(array['c2000000-0000-4000-8000-000000000002']::uuid[])), 0,
  'get_profile_cards hides unrelated users');
select is((select count(*)::int from public.get_profile_cards(null)), 0,
  'get_profile_cards(null) returns nothing');

reset role;
select is((select bio from public.profiles where id = 'c2000000-0000-4000-8000-000000000002'), null,
  'the update aimed at another user''s profile changed nothing');
select is(
  (select array_to_string(array(
      select a.n from unnest(p.proargnames, p.proargmodes::text[]) as a(n, m)
      where a.m = 't' order by a.n), ',')
   from pg_proc p where p.oid = 'public.get_profile_cards(uuid[])'::regprocedure),
  'avatar_url,full_name,id', 'get_profile_cards exposes only id, full_name, avatar_url');

-- Signed-out clients can read nothing and cannot call the RPC.
select tests.as_anon();
select is((select count(*)::int from public.profiles), 0, 'anon reads no profiles');
select throws_ok($$ select * from public.get_profile_cards(array['c1000000-0000-4000-8000-000000000001']::uuid[]) $$,
  '42501', null, 'anon cannot call get_profile_cards');

select * from finish();
rollback;
