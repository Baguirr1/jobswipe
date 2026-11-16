-- Shared helpers for the RLS tests. Run with: npx supabase test db
-- Files run in name order; this one commits so later files can use tests.*.
-- Each later file runs in its own transaction and rolls back.
begin;
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Creates an auth user; the on_auth_user_created trigger makes the profile.
create or replace function tests.create_user(p_id uuid, p_role text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_id::text || '@test.invalid',
          jsonb_build_object('role', p_role, 'full_name', p_name),
          '{"provider":"email","providers":["email"]}', now(), now());
  return p_id;
end $$;

-- Act as a signed-in user for the rest of the transaction (like a JWT request).
create or replace function tests.authenticate_as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;

-- Act as a signed-out (anon) client.
create or replace function tests.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

revoke all on function tests.create_user(uuid, text, text) from public, anon, authenticated;
grant execute on function tests.authenticate_as(uuid), tests.as_anon() to anon, authenticated;

-- Fixtures shared by every test file (each file calls it inside its own
-- transaction, so nothing persists):
--   candidate  c1 (has a resume), c2 (another candidate)
--   recruiter  r1 (owns job_a active + job_b inactive), r2 (owns job_c)
--   c1 matched with r1 on job_a, with one message.
-- security definer with an empty search_path, like production RPCs: this also
-- exercises the stale-embedding triggers under search_path = ''.
create or replace function tests.seed_fixtures()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform tests.create_user('c1000000-0000-4000-8000-000000000001', 'candidate', 'Cand One');
  perform tests.create_user('c2000000-0000-4000-8000-000000000002', 'candidate', 'Cand Two');
  perform tests.create_user('a1000000-0000-4000-8000-000000000001', 'recruiter', 'Rec One');
  perform tests.create_user('a2000000-0000-4000-8000-000000000002', 'recruiter', 'Rec Two');
  update public.profiles
     set resume_text = 'c1 private resume', target_salary_min = 70000, target_title = 'Data Analyst'
   where id = 'c1000000-0000-4000-8000-000000000001';
  update public.profiles set resume_text = 'c2 private resume'
   where id = 'c2000000-0000-4000-8000-000000000002';

  insert into public.jobs (id, recruiter_id, title, company_name, is_active) values
    ('b0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'Job A', 'Acme', true),
    ('b0000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000001', 'Job B (draft)', 'Acme', false),
    ('b0000000-0000-4000-8000-00000000000c', 'a2000000-0000-4000-8000-000000000002', 'Job C', 'Globex', true);

  insert into public.swipes (candidate_id, job_id, direction) values
    ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a', 'right'),
    ('c2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000c', 'right');
  insert into public.recruiter_swipes (recruiter_id, job_id, candidate_id, direction) values
    ('a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000001', 'right');
  insert into public.matches (id, candidate_id, job_id, recruiter_id) values
    ('d0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001');
  insert into public.messages (match_id, sender_id, content) values
    ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Hi from Rec One');
end $$;
revoke all on function tests.seed_fixtures() from public, anon, authenticated;

-- Updates a fixture job or profile text field the way a hardened security
-- definer RPC would (search_path = ''), firing the stale-embedding triggers.
create or replace function tests.update_as_secure_rpc(p_target text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_target = 'job' then
    update public.jobs set title = title || ' (edited)'
     where id = 'b0000000-0000-4000-8000-00000000000c';
  else
    update public.profiles set bio = 'edited'
     where id = 'c2000000-0000-4000-8000-000000000002';
  end if;
end $$;
revoke all on function tests.update_as_secure_rpc(text) from public, anon, authenticated;

select plan(1);
select ok(true, 'test helpers installed');
select * from finish();
commit;
