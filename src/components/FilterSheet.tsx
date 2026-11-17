import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';

import type { JobFilters, JobSort } from '@/lib/types';
import { usePalette } from '@/providers/ThemeProvider';

export const NO_FILTERS: JobFilters = {
  remoteOnly: false,
  minSalary: null,
  location: '',
  postedWithinDays: null,
  skillsOnly: false,
  sort: 'match',
};

const SALARY_STEPS = [null, 50_000, 75_000, 100_000, 125_000, 150_000] as const;
const POSTED_STEPS: [number | null, string][] = [
  [null, 'Any time'],
  [1, 'Past 24 hours'],
  [3, 'Past 3 days'],
  [7, 'Past week'],
  [30, 'Past month'],
];
export const SORTS: [JobSort, string][] = [
  ['match', 'Best match'],
  ['newest', 'Newest first'],
  ['salary', 'Highest pay'],
  ['value', 'Best pay for cost of living'],
];

/** Filters that narrow the deck (sort order isn't one). */
export function activeFilterCount(f: JobFilters) {
  return (
    Number(f.remoteOnly) +
    Number(f.minSalary != null) +
    Number(!!f.location.trim()) +
    Number(f.postedWithinDays != null) +
    Number(f.skillsOnly)
  );
}

/** Short labels for the chips above the deck. */
export function filterChips(f: JobFilters): string[] {
  const chips: string[] = [];
  if (f.remoteOnly) chips.push('Remote');
  if (f.minSalary != null) chips.push(`$${f.minSalary / 1000}k+`);
  if (f.location.trim()) chips.push(f.location.trim());
  if (f.postedWithinDays != null) {
    chips.push(POSTED_STEPS.find(([d]) => d === f.postedWithinDays)?.[1] ?? `${f.postedWithinDays}d`);
  }
  if (f.skillsOnly) chips.push('Uses my skills');
  if (f.sort !== 'match') chips.push(SORTS.find(([s]) => s === f.sort)![1]);
  return chips;
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
  const C = usePalette();
  // Edit a draft; nothing changes in the feed until "Show jobs".
  // Each time the sheet opens, start from the applied filters (discarding any
  // unapplied edits from last time). State adjusted during render, per React docs.
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }
  const set = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close filters" />
      <View className="max-h-[88%] rounded-t-3xl bg-surface" style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <View className="flex-row items-center justify-between px-6 pb-3 pt-5">
          <Text className="text-xl font-extrabold tracking-tight text-ink">Filters</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters">
            <X size={22} color={C.ink3} />
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="px-6 pb-4">
          <Group label="Order cards by">
            {SORTS.map(([s, label]) => (
              <Chip key={s} label={label} selected={draft.sort === s} onPress={() => set('sort', s)} />
            ))}
          </Group>
          {draft.sort === 'value' ? (
            <Hint>
              Ranks your best matches by what the pay is worth after the local cost of living.
              Jobs without a salary go last.
            </Hint>
          ) : null}

          <Group label="Date posted">
            {POSTED_STEPS.map(([d, label]) => (
              <Chip
                key={label}
                label={label}
                selected={draft.postedWithinDays === d}
                onPress={() => set('postedWithinDays', d)}
              />
            ))}
          </Group>

          <Group label="Minimum salary">
            {SALARY_STEPS.map((step) => (
              <Chip
                key={step ?? 'any'}
                label={step == null ? 'Any' : `$${step / 1000}k+`}
                selected={draft.minSalary === step}
                onPress={() => set('minSalary', step)}
              />
            ))}
          </Group>
          <Hint>A minimum hides jobs that don’t list a salary.</Hint>

          <ToggleRow
            label="Remote only"
            value={draft.remoteOnly}
            onChange={(v) => set('remoteOnly', v)}
          />
          <ToggleRow
            label="Only jobs that use my skills"
            hint="At least one required skill is on your profile."
            value={draft.skillsOnly}
            onChange={(v) => set('skillsOnly', v)}
          />

          <Text className="mb-1.5 mt-4 text-[13px] font-semibold text-ink-2">Location</Text>
          <TextInput
            value={draft.location}
            onChangeText={(location) => set('location', location)}
            placeholder="City, state or country"
            placeholderTextColor={C.ink3}
            accessibilityLabel="Location"
            autoCorrect={false}
            className="h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink"
          />
          <Hint>Tip: tap a pin on the map to filter by city.</Hint>
        </ScrollView>

        <View className="border-t border-line px-6 pb-8 pt-3">
          <Button title="Show jobs" onPress={() => onApply(draft)} />
          <Button title="Clear filters" variant="ghost" onPress={() => onApply(NO_FILTERS)} className="mt-1" />
        </View>
      </View>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="mb-2 text-[13px] font-semibold text-ink-2">{label}</Text>
      <View className="flex-row flex-wrap">{children}</View>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`mb-2 mr-2 rounded-full border px-3.5 py-1.5 ${
        selected ? 'border-ink bg-ink' : 'border-line bg-surface'
      }`}
    >
      <Text className={`text-[13px] font-semibold ${selected ? 'text-canvas' : 'text-ink-2'}`}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const C = usePalette();
  return (
    <View className="mt-4 flex-row items-center justify-between">
      <View className="flex-1 pr-4">
        <Text className="text-[15px] font-medium text-ink">{label}</Text>
        {hint ? <Text className="text-xs text-ink-3">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent }} accessibilityLabel={label} />
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <Text className="mt-0.5 text-xs text-ink-3">{children}</Text>;
}
