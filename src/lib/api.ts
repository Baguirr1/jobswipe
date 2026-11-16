import { supabase } from './supabase';
import type {
  CandidateForJob,
  Job,
  JobFilters,
  JobInsights,
  MatchWithDetails,
  Message,
  Profile,
  RecommendedJob,
  SavedJob,
  SwipeDirection,
} from './types';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- Profiles ----------

export async function getProfile(userId: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single());
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'full_name'
    | 'avatar_url'
    | 'bio'
    | 'target_title'
    | 'resume_text'
    | 'skills'
    | 'target_salary_min'
    | 'target_salary_max'
    | 'onboarded'
  >
>;

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select('*').single(),
  );
}

// ---------- Candidate feed ----------

export async function getRecommendedJobs(
  candidateId: string,
  limit = 20,
  filters?: JobFilters,
): Promise<RecommendedJob[]> {
  return unwrap(
    await supabase.rpc('get_recommended_jobs_for_candidate', {
      p_candidate_id: candidateId,
      p_limit: limit,
      p_remote_only: filters?.remoteOnly ?? false,
      p_min_salary: filters?.minSalary ?? null,
      p_location: filters?.location.trim() || null,
    }),
  );
}

/** Undo a recent swipe (refused by the server once it produced a match). */
export async function undoSwipe(jobId: string): Promise<void> {
  unwrap(await supabase.rpc('undo_swipe', { p_job_id: jobId }));
}

/** Records a swipe. Returns the match id if this swipe completed a match. */
export async function swipeJob(jobId: string, direction: SwipeDirection): Promise<string | null> {
  return unwrap(
    await supabase.rpc('swipe_job', { p_job_id: jobId, p_direction: direction }),
  );
}

/** Imported jobs the candidate swiped right on; they apply on the source site. */
export async function getSavedJobs(candidateId: string): Promise<SavedJob[]> {
  return unwrap(
    await supabase
      .from('swipes')
      .select(
        'created_at, applied_at, job:jobs!inner ( id, title, company_name, company_logo, location, is_remote, source, apply_url, description, required_skills, salary_min, salary_max )',
      )
      .eq('candidate_id', candidateId)
      .eq('direction', 'right')
      .neq('job.source', 'jobswipe')
      .order('created_at', { ascending: false })
      .returns<SavedJob[]>(),
  );
}

export async function setSavedJobApplied(jobId: string, applied: boolean): Promise<void> {
  unwrap(await supabase.rpc('set_saved_job_applied', { p_job_id: jobId, p_applied: applied }));
}

/** Drop a saved job; it's recorded as a pass so it doesn't return to the feed. */
export async function removeSavedJob(jobId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_saved_job', { p_job_id: jobId }));
}

// ---------- Recruiter ----------

export async function getJobInsights(jobId: string): Promise<JobInsights> {
  return unwrap(await supabase.rpc('get_job_insights', { p_job_id: jobId }));
}

export async function getMyJobs(recruiterId: string): Promise<Job[]> {
  return unwrap(
    await supabase
      .from('jobs')
      .select(
        'id, recruiter_id, title, company_name, company_logo, description, location, is_remote, salary_min, salary_max, required_skills, is_active, created_at, source, apply_url',
      )
      .eq('recruiter_id', recruiterId)
      .order('created_at', { ascending: false }),
  );
}

export async function getJob(jobId: string): Promise<Job> {
  return unwrap(
    await supabase
      .from('jobs')
      .select(
        'id, recruiter_id, title, company_name, company_logo, description, location, is_remote, salary_min, salary_max, required_skills, is_active, created_at, source, apply_url',
      )
      .eq('id', jobId)
      .single(),
  );
}

export type JobInput = Pick<
  Job,
  | 'title'
  | 'company_name'
  | 'company_logo'
  | 'description'
  | 'location'
  | 'is_remote'
  | 'salary_min'
  | 'salary_max'
  | 'required_skills'
  | 'is_active'
>;

export async function upsertJob(recruiterId: string, input: JobInput, jobId?: string) {
  const query = jobId
    ? supabase.from('jobs').update(input).eq('id', jobId)
    : supabase.from('jobs').insert({ ...input, recruiter_id: recruiterId });
  return unwrap<{ id: string }>(await query.select('id').single());
}

export async function setJobActive(jobId: string, isActive: boolean) {
  unwrap(await supabase.from('jobs').update({ is_active: isActive }).eq('id', jobId).select('id'));
}

export async function getApplicantCounts(jobIds: string[]): Promise<Record<string, number>> {
  if (!jobIds.length) return {};
  const rows = unwrap<{ job_id: string }[]>(
    await supabase.from('swipes').select('job_id').in('job_id', jobIds).eq('direction', 'right'),
  );
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.job_id] = (acc[r.job_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getCandidatesForJob(jobId: string, limit = 20): Promise<CandidateForJob[]> {
  return unwrap(
    await supabase.rpc('get_candidates_for_job', { p_job_id: jobId, p_limit: limit }),
  );
}

export async function swipeCandidate(
  jobId: string,
  candidateId: string,
  direction: SwipeDirection,
): Promise<string | null> {
  return unwrap(
    await supabase.rpc('swipe_candidate', {
      p_job_id: jobId,
      p_candidate_id: candidateId,
      p_direction: direction,
    }),
  );
}

// ---------- Matches & chat ----------

// Other people's profiles aren't readable directly (they hold resume text and
// salary); names and avatars come from get_profile_cards(), which only returns
// those columns and only for match counterparts.
const MATCH_SELECT = `
  id, candidate_id, job_id, recruiter_id, created_at,
  job:jobs!inner ( id, title, company_name, company_logo )
`;

type MatchRow = Omit<MatchWithDetails, 'candidate' | 'recruiter'>;
type ProfileCard = MatchWithDetails['candidate'];

async function withProfileCards(matches: MatchRow[]): Promise<MatchWithDetails[]> {
  const ids = [...new Set(matches.flatMap((m) => [m.candidate_id, m.recruiter_id]))];
  const cards = ids.length
    ? unwrap<ProfileCard[]>(await supabase.rpc('get_profile_cards', { p_ids: ids }))
    : [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const card = (id: string): ProfileCard => byId.get(id) ?? { id, full_name: null, avatar_url: null };
  return matches.map((m) => ({ ...m, candidate: card(m.candidate_id), recruiter: card(m.recruiter_id) }));
}

export async function getMatches(): Promise<MatchWithDetails[]> {
  // RLS limits rows to matches the current user participates in.
  const rows = unwrap(
    await supabase
      .from('matches')
      .select(MATCH_SELECT)
      .order('created_at', { ascending: false })
      .returns<MatchRow[]>(),
  );
  return withProfileCards(rows);
}

export async function getMatch(matchId: string): Promise<MatchWithDetails> {
  const row = unwrap<MatchRow>(
    await supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('id', matchId)
      .returns<MatchRow>()
      .single(),
  );
  const [match] = await withProfileCards([row]);
  return match;
}

export async function getMessages(matchId: string, limit = 100): Promise<Message[]> {
  const rows = unwrap<Message[]>(
    await supabase
      .from('messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return rows.reverse();
}

export async function sendMessage(matchId: string, senderId: string, content: string) {
  return unwrap<Message>(
    await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: senderId, content })
      .select('*')
      .single(),
  );
}
