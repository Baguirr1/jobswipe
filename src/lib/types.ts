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
  updated_at: string;
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
  /** Stated annual pay (job board, recruiter, or read from the description). */
  salary_min: number | null;
  salary_max: number | null;
  /** Stated hourly pay; monthly stipends are converted to hourly. */
  hourly_min: number | null;
  hourly_max: number | null;
  /** Only when no pay is stated: a BLS-based or Adzuna estimate. Read-only. */
  est_pay_min: number | null;
  est_pay_max: number | null;
  est_pay_period: 'year' | 'hour' | null;
  est_pay_source: 'adzuna' | 'bls' | null;
  required_skills: string[];
  is_active: boolean;
  created_at: string;
  /** 'jobswipe' for listings posted in the app, otherwise the job board it was imported from. */
  source: string;
  /** Imported jobs only: where the candidate applies. */
  apply_url: string | null;
  employment_type: EmploymentType;
  workplace_type: WorkplaceType;
  /** Derived from the title by the database; read-only. */
  job_function: JobFunction;
  /** Derived from the description: true = sponsors, false = rules it out, null = doesn't say. Read-only. */
  sponsors_visa: boolean | null;
}

export type EmploymentType = 'full_time' | 'part_time' | 'internship' | 'contract' | 'temporary';
export type WorkplaceType = 'onsite' | 'hybrid' | 'remote';
export type JobFunction =
  | 'engineering' | 'data' | 'design' | 'product' | 'marketing' | 'sales' | 'finance'
  | 'operations' | 'people' | 'legal' | 'healthcare' | 'education' | 'customer_support' | 'other';

/** An imported job the candidate swiped right on (applied to off-platform). */
/** Where a saved job is in the candidate's search. Private to the candidate. */
export type ApplicationStage = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export interface SavedJob {
  created_at: string;
  /** When the candidate marked it as applied; null if not yet. */
  applied_at: string | null;
  stage: ApplicationStage;
  /** Private note, e.g. "talked to Sarah, follow up Friday". */
  note: string;
  /** Last stage or note change; null if never tracked. */
  tracked_at: string | null;
  job: Pick<
    Job,
    | 'id'
    | 'title'
    | 'company_name'
    | 'company_logo'
    | 'location'
    | 'is_remote'
    | 'source'
    | 'apply_url'
    | 'description'
    | 'required_skills'
    | 'salary_min'
    | 'salary_max'
    | 'hourly_min'
    | 'hourly_max'
    | 'est_pay_min'
    | 'est_pay_max'
    | 'est_pay_period'
    | 'est_pay_source'
  >;
}

/** Discover filters, applied server-side. */
export interface JobFilters {
  /** Empty = any. Like Handshake's job type / location type / job function filters. */
  employmentTypes: EmploymentType[];
  workplaceTypes: WorkplaceType[];
  jobFunctions: JobFunction[];
  company: string;
  /** 'open': hide jobs that rule out sponsorship; 'offered': only jobs that say they sponsor. */
  sponsorship: 'open' | 'offered' | null;
  /** Hides jobs without a listed salary when set. */
  minSalary: number | null;
  /** Let estimated pay count for minimum salary, "salary listed" and the pay sort. */
  includeEstimates: boolean;
  location: string;
  keyword: string;
  postedWithinDays: 1 | 7 | 30 | null;
  level: 'entry' | 'senior' | null;
  quickApplyOnly: boolean;
  salaryListed: boolean;
  skillsMatch: boolean;
  minMatch: 50 | 70 | 85 | null;
  sort: 'match' | 'newest' | 'salary';
}

/** Aggregates returned by get_job_insights(). */
export interface JobInsights {
  views: number;
  applicants: number;
  passes: number;
  reviewed: number;
  matches: number;
  avg_match: number | null;
  scored: number;
  match_distribution: { low: number; fair: number; good: number; great: number };
  required_coverage: { skill: string; count: number }[];
  top_skills: { skill: string; count: number }[];
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
