-- =============================================================================
-- Switch embeddings from Hugging Face all-MiniLM-L6-v2 to Supabase's built-in
-- gte-small (same 384 dims, runs inside Edge Functions, no API key or credits).
--
-- Vectors from different models live in different spaces, so existing ones are
-- cleared and regenerated: jobs by the import-jobs / embed backfill, profiles
-- automatically the next time the candidate opens the Discover tab.
-- =============================================================================

update public.jobs set embedding = null where embedding is not null;
update public.profiles set embedding = null where embedding is not null;

-- gte-small similarities are compressed: unrelated resume/job pairs score about
-- 0.82, a decent fit 0.88-0.92, and a near-perfect fit 0.94-0.98 (measured on
-- the seed jobs). Map 0.80-0.96 linearly onto 0-100%.
create or replace function public.match_pct(p_distance double precision)
returns numeric
language sql
immutable
as $$
  select case
    when p_distance is null then null
    else round((greatest(0, least(1, ((1 - p_distance) - 0.80) / (0.96 - 0.80))) * 100)::numeric, 0)
  end;
$$;
