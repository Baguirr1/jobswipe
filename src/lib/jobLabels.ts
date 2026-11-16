import type { EmploymentType, JobFunction, WorkplaceType } from '@/lib/types';

export const EMPLOYMENT_TYPE_OPTIONS: readonly { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
];

export const WORKPLACE_TYPE_OPTIONS: readonly { value: WorkplaceType; label: string }[] = [
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

export const JOB_FUNCTION_OPTIONS: readonly { value: JobFunction; label: string }[] = [
  { value: 'engineering', label: 'Engineering & IT' },
  { value: 'data', label: 'Data & AI' },
  { value: 'design', label: 'Design' },
  { value: 'product', label: 'Product' },
  { value: 'marketing', label: 'Marketing & Comms' },
  { value: 'sales', label: 'Sales & BD' },
  { value: 'finance', label: 'Finance & Accounting' },
  { value: 'operations', label: 'Operations & Consulting' },
  { value: 'people', label: 'HR & Recruiting' },
  { value: 'customer_support', label: 'Customer Support' },
  { value: 'legal', label: 'Legal' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T | null | undefined) =>
  options.find((o) => o.value === value)?.label ?? null;

export const employmentTypeLabel = (v: EmploymentType | null | undefined) => labelOf(EMPLOYMENT_TYPE_OPTIONS, v);
export const workplaceTypeLabel = (v: WorkplaceType | null | undefined) => labelOf(WORKPLACE_TYPE_OPTIONS, v);
export const jobFunctionLabel = (v: JobFunction | null | undefined) => labelOf(JOB_FUNCTION_OPTIONS, v);

export const isEmploymentType = (v: unknown): v is EmploymentType =>
  EMPLOYMENT_TYPE_OPTIONS.some((o) => o.value === v);
export const isWorkplaceType = (v: unknown): v is WorkplaceType =>
  WORKPLACE_TYPE_OPTIONS.some((o) => o.value === v);
export const isJobFunction = (v: unknown): v is JobFunction =>
  JOB_FUNCTION_OPTIONS.some((o) => o.value === v);
