-- Training data for the swipe-fit model. Read-only; run with:
--   npx supabase db query --remote --read-only -f ml/export_swipes.sql > ml/data/swipes_raw.json
-- Only fit-related fields leave the database: no names, emails, bios or resume text.
-- The candidate id is replaced by a short hash, so rows can be grouped by user
-- without identifying anyone.
--
-- source = 'event':  point-in-time snapshot from swipe_events (captured when the
--                    swipe happened; trustworthy features).
-- source = 'legacy': swipes from before migration 20261116000000, joined to the
--                    CURRENT profile/job. Features may postdate the label. Kept
--                    only so the model can be trained until enough events exist;
--                    drop them with `python ml/build_pipeline.py --events-only`.
select
  left(md5(e.candidate_id::text), 8) as candidate_key,
  e.target_title, e.candidate_skills, e.target_salary_min, e.target_salary_max,
  e.job_title, e.job_skills, e.is_remote, e.job_salary_min, e.job_salary_max,
  e.embedding_similarity,
  (e.direction = 'right')::int as swiped_right,
  e.created_at,
  'event' as source
from public.swipe_events e

union all

select
  left(md5(s.candidate_id::text), 8),
  p.target_title, p.skills, p.target_salary_min, p.target_salary_max,
  j.title, j.required_skills, j.is_remote, j.salary_min, j.salary_max,
  case when p.embedding is null or j.embedding is null then null
       else 1 - (j.embedding operator(extensions.<=>) p.embedding) end,
  (s.direction = 'right')::int,
  s.created_at,
  'legacy'
from public.swipes s
join public.profiles p on p.id = s.candidate_id
join public.jobs j on j.id = s.job_id
where not exists (
  select 1 from public.swipe_events e
  where e.candidate_id = s.candidate_id and e.job_id = s.job_id
)

order by created_at;
