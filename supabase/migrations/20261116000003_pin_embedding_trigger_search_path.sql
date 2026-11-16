-- =============================================================================
-- Pin search_path on the stale-embedding triggers.
--    clear_stale_job_embedding() / clear_stale_profile_embedding() compare
--    vectors with IS NOT DISTINCT FROM, which needs pgvector's = operator from
--    the extensions schema. Without their own search_path they inherit the
--    caller's, so any UPDATE of jobs/profiles from a function declared with
--    `set search_path = ''` (the recommended setting for security definer
--    functions) failed with "operator does not exist: vector = vector".
--    The operator lives in extensions; nothing else is resolved by name here.
-- =============================================================================

alter function public.clear_stale_job_embedding() set search_path = extensions;
alter function public.clear_stale_profile_embedding() set search_path = extensions;
