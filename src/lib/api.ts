import { supabase } from './supabase';
import type {
  CandidateForJob,
  Job,
  MatchWithDetails,
  Message,
  Profile,
  RecommendedJob,
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
): Promise<RecommendedJob[]> {
  return unwrap(
    await supabase.rpc('get_recommended_jobs_for_candidate', {
      p_candidate_id: candidateId,
      p_limit: limit,
    }),
  );
}

/** Records a swipe. Returns the match id if this swipe completed a match. */
export async function swipeJob(jobId: string, direction: SwipeDirection): Promise<string | null> {
  return unwrap(
    await supabase.rpc('swipe_job', { p_job_id: jobId, p_direction: direction }),
  );
}

// ---------- Recruiter ----------

export async function getMyJobs(recruiterId: string): Promise<Job[]> {
  return unwrap(
    await supabase
      .from('jobs')
      .select(
        'id, recruiter_id, title, company_name, company_logo, description, location, is_remote, salary_min, salary_max, required_skills, is_active, created_at',
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
        'id, recruiter_id, title, company_name, company_logo, description, location, is_remote, salary_min, salary_max, required_skills, is_active, created_at',
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

const MATCH_SELECT = `
  id, candidate_id, job_id, recruiter_id, created_at,
  job:jobs!inner ( id, title, company_name, company_logo ),
  candidate:profiles!matches_candidate_id_fkey ( id, full_name, avatar_url ),
  recruiter:profiles!matches_recruiter_id_fkey ( id, full_name, avatar_url )
`;

export async function getMatches(): Promise<MatchWithDetails[]> {
  // RLS limits rows to matches the current user participates in.
  return unwrap(
    await supabase
      .from('matches')
      .select(MATCH_SELECT)
      .order('created_at', { ascending: false })
      .returns<MatchWithDetails[]>(),
  );
}

export async function getMatch(matchId: string): Promise<MatchWithDetails> {
  return unwrap(
    await supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('id', matchId)
      .returns<MatchWithDetails>()
      .single(),
  );
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
