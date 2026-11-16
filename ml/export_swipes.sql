-- Training data for the swipe-fit model. Read-only; run with:
--   npx supabase db query --remote --read-only -f ml/export_swipes.sql > ml/data/swipes_raw.json
-- Only fit-related fields leave the database: no names, emails, bios or resume text.
-- The candidate id is replaced by a short hash, so rows can be grouped by user
-- without identifying anyone.
select
  left(md5(s.candidate_id::text), 8)                    as candidate_key,
  p.target_title,
  p.skills                                              as candidate_skills,
  p.target_salary_min,
  p.target_salary_max,
  j.title                                               as job_title,
  j.required_skills                                     as job_skills,
  j.is_remote,
  j.salary_min                                          as job_salary_min,
  j.salary_max                                          as job_salary_max,
  case when p.embedding is null or j.embedding is null then null
       else 1 - (j.embedding operator(extensions.<=>) p.embedding) end as embedding_similarity,
  (s.direction = 'right')::int                          as swiped_right
from public.swipes s
join public.profiles p on p.id = s.candidate_id
join public.jobs j on j.id = s.job_id
order by s.created_at;
