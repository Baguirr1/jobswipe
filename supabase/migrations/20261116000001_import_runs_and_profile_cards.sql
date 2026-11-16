-- =============================================================================
-- 1. Import run log.
--    import-jobs used to report problems only in its HTTP response, which
--    pg_cron never reads, so failed or partial runs went unnoticed. Every run
--    (except successful per-minute embed_only runs) now writes one row here.
-- =============================================================================

create table public.import_runs (
  id                 bigint generated always as identity primary key,
  started_at         timestamptz not null,
  finished_at        timestamptz not null default now(),
  request            jsonb not null default '{}'::jsonb,
  sources            text[] not null default '{}',
  ok                 boolean not null,
  fetched            integer not null default 0,
  upserted           integer not null default 0,
  duplicates_skipped integer not null default 0,
  kept_alive         integer not null default 0,
  deactivated        integer not null default 0,
  embedded           integer not null default 0,
  unembedded         integer,
  boards_ok          jsonb,
  by_source          jsonb,
  errors             text[] not null default '{}',
  warnings           text[] not null default '{}'
);

create index import_runs_started_at_idx on public.import_runs (started_at desc);

-- Operational data: service role only (it bypasses RLS). No client policies.
alter table public.import_runs enable row level security;
revoke all on public.import_runs from anon, authenticated;

-- One row per source: when it last ran, last succeeded, and how the latest run
-- went. Query from the SQL editor: select * from public.import_health;
create view public.import_health
with (security_invoker = true) as
with per_source as (
  select unnest(r.sources) as source, r.*
  from public.import_runs r
)
select
  source,
  max(started_at)                                   as last_run_at,
  max(started_at) filter (where ok)                 as last_ok_at,
  (array_agg(ok order by started_at desc))[1]       as latest_ok,
  (array_agg(errors order by started_at desc))[1]   as latest_errors,
  count(*) filter (where not ok and started_at > now() - interval '7 days') as failed_runs_7d,
  now() - max(started_at) filter (where ok) > interval '36 hours'          as is_stale
from per_source
group by source;

revoke all on public.import_health from anon, authenticated;

-- Keep 90 days of history (the import cron already runs daily; piggyback on it).
create or replace function public.prune_import_runs()
returns void language sql security definer set search_path = '' as $$
  delete from public.import_runs where started_at < now() - interval '90 days';
$$;
revoke all on function public.prune_import_runs() from public, anon, authenticated;

-- =============================================================================
-- 2. Profile privacy, part 2.
--    Match counterparts could read the whole profiles row (resume_text, salary
--    range, bio ...) although the app only shows their name and avatar. Reads
--    of other people's profiles now go through get_profile_cards(), which
--    returns just those columns, and the row policy is back to self only.
--    Recruiters still see applicants through get_candidates_for_job().
-- =============================================================================

drop policy "profiles readable by self or match counterpart" on public.profiles;

create policy "profiles readable by self"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create or replace function public.get_profile_cards(p_ids uuid[])
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  where p.id = any (p_ids)
    and (
      p.id = (select auth.uid())
      or exists (
        select 1 from public.matches m
        where (m.candidate_id = (select auth.uid()) and m.recruiter_id = p.id)
           or (m.recruiter_id = (select auth.uid()) and m.candidate_id = p.id)
      )
    );
$$;

revoke all on function public.get_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_profile_cards(uuid[]) to authenticated;
