import type { Job } from './types';

const compactUsd = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;

/** "$25" or "$27.50" */
const hourlyUsd = (n: number) => `$${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`;

function range(min: number | null, max: number | null, fmt: (n: number) => string): string | null {
  if (min != null && max != null) return Number(min) === Number(max) ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  if (max != null) return `Up to ${fmt(max)}`;
  return null;
}

export type PayFields = Pick<
  Job,
  'salary_min' | 'salary_max' | 'hourly_min' | 'hourly_max' | 'est_pay_min' | 'est_pay_max' | 'est_pay_period' | 'est_pay_source'
>;

export interface PayLabel {
  text: string;
  /** True for an estimate rather than pay the employer stated. */
  estimated: boolean;
  /** Where an estimate comes from, for a caption. */
  note: string | null;
}

/** Stated annual pay, then stated hourly pay, then an estimate. */
export function formatPay(job: Partial<PayFields>): PayLabel {
  const annual = range(job.salary_min ?? null, job.salary_max ?? null, compactUsd);
  if (annual) return { text: annual, estimated: false, note: null };
  const hourly = range(job.hourly_min ?? null, job.hourly_max ?? null, hourlyUsd);
  if (hourly) return { text: `${hourly}/hr`, estimated: false, note: null };
  const isHourly = job.est_pay_period === 'hour';
  const est = range(job.est_pay_min ?? null, job.est_pay_max ?? null, isHourly ? hourlyUsd : compactUsd);
  if (est) {
    return {
      text: `Est. ${est}${isHourly ? '/hr' : ''}`,
      estimated: true,
      note: job.est_pay_source === 'adzuna' ? 'Estimated by Adzuna' : 'Estimate: typical pay for similar roles (BLS)',
    };
  }
  return { text: 'Salary not listed', estimated: false, note: null };
}

/** Top of the stated pay range per year (hourly x 2080); null when none is stated. */
export function statedAnnualPay(job: Partial<PayFields>): number | null {
  const annual = job.salary_max ?? job.salary_min;
  if (annual != null) return Number(annual);
  const hourly = job.hourly_max ?? job.hourly_min;
  return hourly != null ? Number(hourly) * 2080 : null;
}

export function formatSalaryRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${compactUsd(min)} – ${compactUsd(max)}`;
  if (min != null) return `${compactUsd(min)}+`;
  if (max != null) return `Up to ${compactUsd(max)}`;
  return 'Salary not listed';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export const SKILL_OPTIONS = [
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
  'Go', 'Rust', 'Java', 'Kotlin', 'Swift', 'SQL', 'PostgreSQL', 'GraphQL',
  'AWS', 'Docker', 'Kubernetes', 'Figma', 'UI/UX', 'Product Management',
  'Machine Learning', 'Data Analysis', 'DevOps', 'Next.js',
];

const SOURCE_LABELS: Record<string, string> = {
  adzuna: 'Jobs by Adzuna',
  arbeitnow: 'via Arbeitnow',
  greenhouse: 'From the company’s careers page (Greenhouse)',
  lever: 'From the company’s careers page (Lever)',
  ashby: 'From the company’s careers page (Ashby)',
  smartrecruiters: 'From the company’s careers page (SmartRecruiters)',
  recruitee: 'From the company’s careers page (Recruitee)',
  personio: 'From the company’s careers page (Personio)',
  usajobs: 'via USAJOBS.gov',
};

/** Attribution for imported listings (required by the job boards' terms); null for in-app jobs. */
export function sourceLabel(source: string | null | undefined): string | null {
  if (!source || source === 'jobswipe') return null;
  return SOURCE_LABELS[source] ?? `via ${source}`;
}
