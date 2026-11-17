import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
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

/** Pick one (including "Any"). */
function SingleSelect<T>({ title, options, value, onChange }: {
  title: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <Text className="mb-2 text-sm font-medium text-gray-700">{title}</Text>
      <View className="mb-3 flex-row flex-wrap">
        {options.map((o) => (
          <Chip key={String(o.value ?? 'any')} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </>
  );
}

/** Pick any number; none selected means any. */
function MultiSelect<T extends string>({ title, hint, options, value, onChange }: {
  title: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <>
      <Text className="mb-2 text-sm font-medium text-gray-700">{title}</Text>
      <View className="mb-1 flex-row flex-wrap">
        {options.map((o) => (
          <Chip key={o.value} label={o.label} multi selected={value.includes(o.value)} onPress={() => toggle(o.value)} />
        ))}
      </View>
      <Text className="mb-4 text-xs text-gray-400">{hint ?? 'Pick any. None selected shows all.'}</Text>
    </>
  );
}

export function FilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: JobFilters;
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close filters" />
      <View className="h-[85%] rounded-t-3xl bg-white">
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>
          <View className="mb-5 flex-row items-center justify-between">
            <Text className="text-xl font-extrabold text-gray-900">Filter jobs</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters">
              <X size={22} color="#6B7280" />
            </Pressable>
          </View>

          <Text className="mb-1.5 text-sm font-medium text-gray-700">Keyword</Text>
          <TextInput
            value={draft.keyword}
            onChangeText={set('keyword')}
            placeholder="Title, company or description"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Keyword"
            autoCorrect={false}
            className="mb-5 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
          />

          <MultiSelect title="Job type" options={EMPLOYMENT_TYPE_OPTIONS} value={draft.employmentTypes} onChange={set('employmentTypes')} />
          <MultiSelect title="Location type" options={WORKPLACE_TYPE_OPTIONS} value={draft.workplaceTypes} onChange={set('workplaceTypes')} />

          <Text className="mb-1.5 text-sm font-medium text-gray-700">Location</Text>
          <TextInput
            value={draft.location}
            onChangeText={set('location')}
            placeholder="City, state or country"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Location"
            autoCorrect={false}
            className="mb-5 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
          />

          <MultiSelect title="Job function" options={JOB_FUNCTION_OPTIONS} value={draft.jobFunctions} onChange={set('jobFunctions')} hint="Based on the job title. None selected shows all." />

          <Text className="mb-1.5 text-sm font-medium text-gray-700">Employer</Text>
          <TextInput
            value={draft.company}
            onChangeText={set('company')}
            placeholder="Company name"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Employer"
            autoCorrect={false}
            className="mb-5 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
          />

          <SingleSelect title="Work authorization" options={SPONSORSHIP_OPTIONS} value={draft.sponsorship} onChange={set('sponsorship')} />
          <Text className="-mt-1 mb-5 text-xs text-gray-400">
            Read from the job description. “Open” hides jobs that say they can’t sponsor.
          </Text>

          <SingleSelect title="Minimum salary" options={SALARY_OPTIONS} value={draft.minSalary} onChange={set('minSalary')} />
          <Text className="-mt-1 mb-3 text-xs text-gray-400">
            Hourly pay counts at 2,080 hours a year. A minimum hides jobs with no pay listed.
          </Text>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-base text-gray-800">Include estimated pay</Text>
            <Switch
              value={draft.includeEstimates}
              onValueChange={set('includeEstimates')}
              trackColor={{ true: '#6C47FF' }}
              accessibilityLabel="Include estimated pay"
            />
          </View>
          <Text className="mb-5 text-xs text-gray-400">
            Lets typical pay for similar roles (BLS) count toward salary filters and the pay sort.
          </Text>

          <SingleSelect title="Posted within" options={POSTED_OPTIONS} value={draft.postedWithinDays} onChange={set('postedWithinDays')} />
          <SingleSelect title="Experience level" options={LEVEL_OPTIONS} value={draft.level} onChange={set('level')} />

          <View className="mb-4 mt-2">
            {TOGGLE_OPTIONS.map((option) => (
              <View key={option.key} className="mb-2 flex-row items-center justify-between">
                <Text className="text-base text-gray-800">{option.label}</Text>
                <Switch
                  value={draft[option.key]}
                  onValueChange={set(option.key)}
                  trackColor={{ true: '#6C47FF' }}
                  accessibilityLabel={option.label}
                />
              </View>
            ))}
          </View>

          <SingleSelect title="Minimum match" options={MATCH_OPTIONS} value={draft.minMatch} onChange={set('minMatch')} />
          <SingleSelect title="Sort by" options={SORT_OPTIONS} value={draft.sort} onChange={set('sort')} />
        </ScrollView>
        <View className="px-6 pb-10 pt-3">
          <Button title="Show jobs" onPress={() => onApply(draft)} />
          <Button title="Clear filters" variant="ghost" onPress={() => onApply(NO_FILTERS)} className="mt-2" />
        </View>
      </View>
    </Modal>
  );
}
