export type UserRole = 'candidate' | 'recruiter';
export type SwipeDirection = 'left' | 'right';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  target_title: string | null;
  resume_text: string | null;
  skills: string[];
  target_salary_min: number | null;
  target_salary_max: number | null;
  onboarded: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  recruiter_id: string;
  title: string;
  company_name: string;
  company_logo: string | null;
  description: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  required_skills: string[];
  is_active: boolean;
  created_at: string;
  /** 'jobswipe' for listings posted in the app, otherwise the job board it was imported from. */
  source: string;
  /** Imported jobs only: where the candidate applies. */
  apply_url: string | null;
}

/** An imported job the candidate swiped right on (applied to off-platform). */
export interface SavedJob {
  created_at: string;
  job: Pick<
    Job,
    'id' | 'title' | 'company_name' | 'company_logo' | 'location' | 'is_remote' | 'source' | 'apply_url'
  >;
}

/** Row returned by get_recommended_jobs_for_candidate(). */
export interface RecommendedJob
  extends Omit<Job, 'is_active'> {
  match_score_percentage: number | null;
}

/** Row returned by get_candidates_for_job(). */
export interface CandidateForJob {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  target_title: string | null;
  skills: string[];
  target_salary_min: number | null;
  target_salary_max: number | null;
  resume_text: string | null;
  applied_at: string;
  match_score_percentage: number | null;
}

export interface Match {
  id: string;
  candidate_id: string;
  job_id: string;
  recruiter_id: string;
  created_at: string;
}

export interface MatchWithDetails extends Match {
  job: Pick<Job, 'id' | 'title' | 'company_name' | 'company_logo'>;
  candidate: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
  recruiter: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}
