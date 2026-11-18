import { ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useMatchingJobCount } from '@/hooks/useMatchingJobCount';
import { MATCH_COUNT_CAP } from '@/lib/api';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_FUNCTION_OPTIONS,
  WORKPLACE_TYPE_OPTIONS,
  employmentTypeLabel,
  jobFunctionLabel,
  workplaceTypeLabel,
} from '@/lib/jobLabels';
import type { JobFilters } from '@/lib/types';

export const NO_FILTERS: JobFilters = {
  employmentTypes: [],
  workplaceTypes: [],
  jobFunctions: [],
  company: '',
  sponsorship: null,
  minSalary: null,
  includeEstimates: false,
  location: '',
  keyword: '',
  postedWithinDays: null,
  level: null,
  quickApplyOnly: false,
  salaryListed: false,
  skillsMatch: false,
  minMatch: null,
  sort: 'match',
};

const POSTED_OPTIONS = [
  { value: null, label: 'Any', chip: '' },
  { value: 1, label: '24h', chip: 'Past 24h' },
  { value: 7, label: '7 days', chip: 'Past week' },
  { value: 30, label: '30 days', chip: 'Past month' },
] as const;
// Internships are a job type now; level only narrows by seniority in the title.
const LEVEL_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 'entry', label: 'Entry level' },
  { value: 'senior', label: 'Senior' },
] as const;
const SPONSORSHIP_OPTIONS = [
  { value: null, label: 'Any', chip: '' },
  { value: 'open', label: 'Open to sponsorship', chip: 'Open to sponsorship' },
  { value: 'offered', label: 'Sponsors visas', chip: 'Sponsors visas' },
] as const;
const TOGGLE_OPTIONS = [
  { key: 'quickApplyOnly', label: 'Quick apply only' },
  { key: 'salaryListed', label: 'Salary listed' },
  { key: 'skillsMatch', label: 'Matches my skills' },
] as const;
const MATCH_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 50, label: '50%+' },
  { value: 70, label: '70%+' },
  { value: 85, label: '85%+' },
] as const;
const SORT_OPTIONS = [
  { value: 'match', label: 'Best match' },
  { value: 'newest', label: 'Newest first' },
  { value: 'salary', label: 'Highest pay' },
] as const;
const SALARY_OPTIONS = [null, 50_000, 75_000, 100_000, 125_000, 150_000].map((value) => ({
  value,
  label: value == null ? 'Any' : `$${value / 1000}k+`,
}));

export function activeFilterCount(f: JobFilters) {
  return f.employmentTypes.length + f.workplaceTypes.length + f.jobFunctions.length + Number(f.includeEstimates)
    + Number(!!f.company.trim()) + Number(f.sponsorship != null)
    + Number(f.minSalary != null) + Number(!!f.location.trim())
    + Number(!!f.keyword.trim()) + Number(f.postedWithinDays != null) + Number(f.level != null)
    + Number(f.quickApplyOnly) + Number(f.salaryListed) + Number(f.skillsMatch) + Number(f.minMatch != null);
}

/** Short labels for the chips above the deck. */
export function filterChips(f: JobFilters): string[] {
  const chips: string[] = [];
  for (const t of f.employmentTypes) chips.push(employmentTypeLabel(t)!);
  for (const t of f.workplaceTypes) chips.push(workplaceTypeLabel(t)!);
  for (const t of f.jobFunctions) chips.push(jobFunctionLabel(t)!);
  if (f.company.trim()) chips.push(f.company.trim());
  if (f.minSalary != null) chips.push(`$${f.minSalary / 1000}k+`);
  if (f.includeEstimates) chips.push('Incl. estimated pay');
  if (f.location.trim()) chips.push(f.location.trim());
  if (f.keyword.trim()) chips.push('"' + f.keyword.trim() + '"');
  const posted = POSTED_OPTIONS.find((o) => o.value === f.postedWithinDays);
  if (posted?.chip) chips.push(posted.chip);
  const level = LEVEL_OPTIONS.find((o) => o.value === f.level);
  if (level?.value) chips.push(level.label);
  const sponsorship = SPONSORSHIP_OPTIONS.find((o) => o.value === f.sponsorship);
  if (sponsorship?.chip) chips.push(sponsorship.chip);
  for (const option of TOGGLE_OPTIONS) {
    if (f[option.key]) chips.push(option.label);
  }
  if (f.minMatch != null) chips.push(f.minMatch + '%+ match');
  const sort = SORT_OPTIONS.find((o) => o.value === f.sort);
  if (sort && sort.value !== 'match') chips.push(sort.label);
  return chips;
}

function Chip({ label, selected, onPress, multi }: { label: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      className={`mb-2 mr-2 rounded-full px-4 py-2 ${selected ? 'bg-brand' : 'bg-gray-100'}`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <Text className="mb-4 text-xs leading-4 text-gray-500">{children}</Text>;
}

/** A titled group of filters, separated from the one above by a rule. */
function Section({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <View className={first ? 'pb-1' : 'border-t border-gray-100 pb-1 pt-5'}>
      <Text accessibilityRole="header" className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="mb-2 text-sm font-medium text-gray-800">{children}</Text>;
}

function Field({ label, value, onChangeText, placeholder }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        accessibilityLabel={label}
        autoCorrect={false}
        className="mb-4 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
      />
    </>
  );
}

/** On/off row. The off track is gray so the control is visible on white. */
function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="mb-3">
      <View className="min-h-11 flex-row items-center justify-between">
        <Text className="mr-4 flex-1 text-base text-gray-800">{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D1D5DB', true: '#6C47FF' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D5DB"
          accessibilityLabel={label}
        />
      </View>
      {hint ? <Text className="-mt-1 text-xs leading-4 text-gray-500">{hint}</Text> : null}
    </View>
  );
}

/** Pick one (including "Any"). */
function SingleSelect<T>({ title, hint, options, value, onChange }: {
  title: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <Label>{title}</Label>
      <View className={`${hint ? 'mb-1' : 'mb-3'} flex-row flex-wrap`}>
        {options.map((o) => (
          <Chip key={String(o.value ?? 'any')} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
      {hint ? <Hint>{hint}</Hint> : null}
    </>
  );
}

/** Pick any number; none selected means any. Long lists start collapsed. */
function MultiSelect<T extends string>({ title, hint, options, value, onChange, collapseAfter }: {
  title: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  collapseAfter?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const collapsible = collapseAfter != null && options.length > collapseAfter;
  // Selected options always stay visible, even when collapsed.
  const shown = collapsible && !expanded
    ? options.filter((o, i) => i < collapseAfter || value.includes(o.value))
    : options;
  const hidden = options.length - shown.length;
  return (
    <>
      <Label>{title}</Label>
      <View className="mb-1 flex-row flex-wrap">
        {shown.map((o) => (
          <Chip key={o.value} label={o.label} multi selected={value.includes(o.value)} onPress={() => toggle(o.value)} />
        ))}
        {collapsible ? (
          <Pressable
            onPress={() => setExpanded((e) => !e)}
            accessibilityRole="button"
            className="mb-2 mr-2 flex-row items-center rounded-full border border-gray-200 px-4 py-2"
          >
            <Text className="text-sm font-semibold text-brand">{expanded ? 'Show less' : `+${hidden} more`}</Text>
            {expanded ? <ChevronUp size={14} color="#6C47FF" /> : <ChevronDown size={14} color="#6C47FF" />}
          </Pressable>
        ) : null}
      </View>
      <Hint>{hint ?? 'Pick any. None selected shows all.'}</Hint>
    </>
  );
}

function showLabel(count: number | null, loading: boolean) {
  if (count == null) return loading ? 'Counting jobs…' : 'Show jobs';
  if (count === 0) return 'No matching jobs';
  if (count >= MATCH_COUNT_CAP) return `Show ${MATCH_COUNT_CAP}+ jobs`;
  return `Show ${count} job${count === 1 ? '' : 's'}`;
}

export function FilterSheet({
  visible,
  value,
  candidateId,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: JobFilters;
  /** Used to count matching jobs for the "Show N jobs" button. */
  candidateId?: string | null;
  onApply: (next: JobFilters) => void;
  onClose: () => void;
}) {
  // Edit a draft; nothing changes in the feed until "Show jobs".
  // Each time the sheet opens, start from the applied filters (discarding any
  // unapplied edits from last time). State adjusted during render, per React docs.
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }
  const set = <K extends keyof JobFilters>(key: K) => (v: JobFilters[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const active = activeFilterCount(draft) + Number(draft.sort !== 'match');
  const { count, loading } = useMatchingJobCount(candidateId, draft, visible);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close filters" />
      {/* Full width on phones; a centered sheet on wide screens. */}
      <View className="h-[85%] w-full max-w-lg self-center rounded-t-3xl bg-white">
        <View className="flex-row items-center border-b border-gray-100 px-6 pb-3 pt-5">
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-xl font-extrabold text-gray-900">Filter jobs</Text>
            <Text className="mt-0.5 text-xs text-gray-500">
              {active ? `${active} active` : 'No filters applied'}
            </Text>
          </View>
          <Pressable
            onPress={() => setDraft(NO_FILTERS)}
            disabled={!active}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
            accessibilityState={{ disabled: !active }}
            className="mr-1 h-11 justify-center px-3"
          >
            <Text className={`text-sm font-semibold ${active ? 'text-brand' : 'text-gray-300'}`}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            className="-mr-2 h-11 w-11 items-center justify-center"
          >
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}>
          <Section title="Sort" first>
            <SingleSelect title="Sort by" options={SORT_OPTIONS} value={draft.sort} onChange={set('sort')} />
          </Section>

          <Section title="Search">
            <Field label="Keyword" value={draft.keyword} onChangeText={set('keyword')} placeholder="Title, company or description" />
            <Field label="Location" value={draft.location} onChangeText={set('location')} placeholder="City, state or country" />
            <Field label="Employer" value={draft.company} onChangeText={set('company')} placeholder="Company name" />
          </Section>

          <Section title="Job details">
            <MultiSelect title="Job type" options={EMPLOYMENT_TYPE_OPTIONS} value={draft.employmentTypes} onChange={set('employmentTypes')} />
            <MultiSelect title="Location type" options={WORKPLACE_TYPE_OPTIONS} value={draft.workplaceTypes} onChange={set('workplaceTypes')} />
            <SingleSelect title="Experience level" options={LEVEL_OPTIONS} value={draft.level} onChange={set('level')} />
            <SingleSelect title="Posted within" options={POSTED_OPTIONS} value={draft.postedWithinDays} onChange={set('postedWithinDays')} />
            <MultiSelect
              title="Job function"
              options={JOB_FUNCTION_OPTIONS}
              value={draft.jobFunctions}
              onChange={set('jobFunctions')}
              collapseAfter={6}
              hint="Based on the job title. None selected shows all."
            />
          </Section>

          <Section title="Pay">
            <SingleSelect
              title="Minimum salary"
              options={SALARY_OPTIONS}
              value={draft.minSalary}
              onChange={set('minSalary')}
              hint="Hourly pay counts at 2,080 hours a year. A minimum also hides jobs with no pay listed."
            />
            <Toggle
              label="Include estimated pay"
              hint="Lets typical pay for similar roles (BLS) count toward salary filters and the pay sort."
              value={draft.includeEstimates}
              onChange={set('includeEstimates')}
            />
            <Toggle label="Salary listed" hint="Only jobs that state their pay." value={draft.salaryListed} onChange={set('salaryListed')} />
          </Section>

          <Section title="Fit">
            <SingleSelect title="Minimum match" options={MATCH_OPTIONS} value={draft.minMatch} onChange={set('minMatch')} />
            <Toggle label="Matches my skills" value={draft.skillsMatch} onChange={set('skillsMatch')} />
            <Toggle label="Quick apply only" hint="Apply in JobSwipe instead of on the company's site." value={draft.quickApplyOnly} onChange={set('quickApplyOnly')} />
            <SingleSelect
              title="Work authorization"
              options={SPONSORSHIP_OPTIONS}
              value={draft.sponsorship}
              onChange={set('sponsorship')}
              hint="Read from the job description. “Open” hides jobs that say they can’t sponsor."
            />
          </Section>
        </ScrollView>

        <View className="border-t border-gray-100 px-6 pb-8 pt-3">
          <Button
            title={showLabel(count, loading)}
            onPress={() => onApply(draft)}
            disabled={count === 0}
          />
        </View>
      </View>
    </Modal>
  );
}
