const compactUsd = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;

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
