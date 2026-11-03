import type { Job, Profile } from './types';

export type SalaryFit = 'fits' | 'below' | 'unknown';

export interface MatchReasons {
  /** Required skills the candidate has (job's spelling). */
  have: string[];
  /** Required skills the candidate doesn't list. */
  missing: string[];
  salary: SalaryFit;
}

type Me = Pick<Profile, 'skills' | 'target_salary_min' | 'target_salary_max'> | null | undefined;

/**
 * Concrete, checkable reasons to show next to the AI match %. The % itself
 * comes from embedding similarity; these are the facts a user can verify.
 */
export function explainMatch(
  job: Pick<Job, 'required_skills' | 'salary_min' | 'salary_max'>,
  me: Me,
): MatchReasons {
  const mine = new Set((me?.skills ?? []).map((s) => s.toLowerCase()));
  const have: string[] = [];
  const missing: string[] = [];
  for (const skill of job.required_skills) {
    (mine.has(skill.toLowerCase()) ? have : missing).push(skill);
  }
  return { have, missing, salary: salaryFit(job, me) };
}

function salaryFit(job: Pick<Job, 'salary_min' | 'salary_max'>, me: Me): SalaryFit {
  const jobTop = job.salary_max ?? job.salary_min;
  const myFloor = me?.target_salary_min ?? null;
  if (jobTop == null || myFloor == null) return 'unknown';
  return jobTop >= myFloor ? 'fits' : 'below';
}

/** One-line summary for the front of a card, e.g. "3 of 5 skills · Pay fits your range". */
export function summarizeMatch(r: MatchReasons): string | null {
  const parts: string[] = [];
  const total = r.have.length + r.missing.length;
  if (total > 0) parts.push(`You have ${r.have.length} of ${total} skills`);
  if (r.salary === 'fits') parts.push('pay fits your range');
  if (r.salary === 'below') parts.push('pay below your range');
  return parts.length ? parts.join(' · ') : null;
}
