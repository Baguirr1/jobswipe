const compactUsd = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;

export function formatSalaryRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${compactUsd(min)} – ${compactUsd(max)}`;
  if (min != null) return `${compactUsd(min)}+`;
  if (max != null) return `Up to ${compactUsd(max)}`;
  return 'Salary not listed';
}

/** "$84k" style. */
export function money(n: number): string {
  return compactUsd(Math.round(n));
}

/** "$1,250" style, for monthly figures. */
export function moneyExact(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

/** "3 days ago" style, from an ISO date. */
export function postedAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return '1 week ago';
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  return 'over a month ago';
}

export function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
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
