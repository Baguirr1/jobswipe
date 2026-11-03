-- =============================================================================
-- 1. Profile privacy.
--    Profiles were readable by every signed-in user, which exposed every
--    candidate's resume_text, salary range and skills to any account. Now a
--    user can read their own profile and the profiles of people they have
--    matched with (chat shows the other side's name and avatar).
--    Recruiters still see applicants through get_candidates_for_job(), which is
--    security definer and limited to their own jobs, so it is unaffected.
-- =============================================================================

drop policy "profiles readable by authenticated users" on public.profiles;

create policy "profiles readable by self or match counterpart"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.matches m
      where (m.candidate_id = (select auth.uid()) and m.recruiter_id = profiles.id)
         or (m.recruiter_id = (select auth.uid()) and m.candidate_id = profiles.id)
    )
  );

-- =============================================================================
-- 2. Stale embeddings.
--    When the text an embedding is built from changes (an importer refresh or a
--    recruiter edit), clear the vector so the embedding workers regenerate it.
--    Writes that set the embedding themselves are left alone.
-- =============================================================================

create or replace function public.clear_stale_job_embedding()
returns trigger language plpgsql as $$
begin
  if new.embedding is not distinct from old.embedding
     and (new.title           is distinct from old.title
       or new.description     is distinct from old.description
       or new.required_skills is distinct from old.required_skills
       or new.location        is distinct from old.location
       or new.is_remote       is distinct from old.is_remote) then
    new.embedding := null;
  end if;
  return new;
end $$;

create trigger jobs_clear_stale_embedding before update on public.jobs
  for each row execute function public.clear_stale_job_embedding();

create or replace function public.clear_stale_profile_embedding()
returns trigger language plpgsql as $$
begin
  if new.embedding is not distinct from old.embedding
     and (new.target_title is distinct from old.target_title
       or new.bio          is distinct from old.bio
       or new.skills       is distinct from old.skills
       or new.resume_text  is distinct from old.resume_text) then
    new.embedding := null;
  end if;
  return new;
end $$;

create trigger profiles_clear_stale_embedding before update on public.profiles
  for each row execute function public.clear_stale_profile_embedding();
