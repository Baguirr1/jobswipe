import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import type { JobFilters } from '@/lib/types';

export const NO_FILTERS: JobFilters = { remoteOnly: false, minSalary: null, location: '', keyword: '', postedWithinDays: null, level: null };

const POSTED_OPTIONS = [
  { value: null, label: 'Any', chip: '' },
  { value: 1, label: '24h', chip: 'Past 24h' },
  { value: 7, label: '7 days', chip: 'Past week' },
  { value: 30, label: '30 days', chip: 'Past month' },
] as const;
const LEVEL_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 'internship', label: 'Internship' },
  { value: 'entry', label: 'Entry level' },
  { value: 'senior', label: 'Senior' },
] as const;

const SALARY_STEPS = [null, 50_000, 75_000, 100_000, 125_000, 150_000] as const;

export function activeFilterCount(f: JobFilters) {
  return Number(f.remoteOnly) + Number(f.minSalary != null) + Number(!!f.location.trim())
    + Number(!!f.keyword?.trim()) + Number(f.postedWithinDays != null) + Number(f.level != null);
}

/** Short labels for the chips above the deck. */
export function filterChips(f: JobFilters): string[] {
  const chips: string[] = [];
  if (f.remoteOnly) chips.push('Remote');
  if (f.minSalary != null) chips.push(`$${f.minSalary / 1000}k+`);
  if (f.location.trim()) chips.push(f.location.trim());
  if (f.keyword?.trim()) chips.push('"' + f.keyword.trim() + '"');
  const posted = POSTED_OPTIONS.find((o) => o.value === f.postedWithinDays);
  if (posted?.chip) chips.push(posted.chip);
  const level = LEVEL_OPTIONS.find((o) => o.value === f.level);
  if (level?.value) chips.push(level.label);
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
  // Edit a draft; nothing changes in the feed until "Show jobs".
  // Each time the sheet opens, start from the applied filters (discarding any
  // unapplied edits from last time). State adjusted during render, per React docs.
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close filters" />
      <View className="max-h-[85%] rounded-t-3xl bg-white">
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>
        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-gray-900">Filter jobs</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters">
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>

        <Text className="mb-1.5 text-sm font-medium text-gray-700">Keyword</Text>
        <TextInput
          value={draft.keyword}
          onChangeText={(keyword) => setDraft((d) => ({ ...d, keyword }))}
          placeholder="Title, company or description"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Keyword"
          autoCorrect={false}
          className="mb-5 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
        />

        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-base text-gray-800">Remote only</Text>
          <Switch
            value={draft.remoteOnly}
            onValueChange={(remoteOnly) => setDraft((d) => ({ ...d, remoteOnly }))}
            trackColor={{ true: '#6C47FF' }}
            accessibilityLabel="Remote only"
          />
        </View>

        <Text className="mb-2 text-sm font-medium text-gray-700">Minimum salary</Text>
        <View className="mb-1 flex-row flex-wrap">
          {SALARY_STEPS.map((step) => {
            const selected = draft.minSalary === step;
            return (
              <Pressable
                key={step ?? 'any'}
                onPress={() => setDraft((d) => ({ ...d, minSalary: step }))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={`mb-2 mr-2 rounded-full px-4 py-2 ${selected ? 'bg-brand' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                  {step == null ? 'Any' : `$${step / 1000}k+`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mb-5 text-xs text-gray-400">
          A minimum hides jobs that don’t list a salary.
        </Text>

        <Text className="mb-2 text-sm font-medium text-gray-700">Posted within</Text>
        <View className="mb-3 flex-row flex-wrap">
          {POSTED_OPTIONS.map((option) => {
            const selected = draft.postedWithinDays === option.value;
            return (
              <Pressable
                key={option.value ?? 'any'}
                onPress={() => setDraft((d) => ({ ...d, postedWithinDays: option.value }))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={`mb-2 mr-2 rounded-full px-4 py-2 ${selected ? 'bg-brand' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 text-sm font-medium text-gray-700">Experience level</Text>
        <View className="mb-3 flex-row flex-wrap">
          {LEVEL_OPTIONS.map((option) => {
            const selected = draft.level === option.value;
            return (
              <Pressable
                key={option.value ?? 'any'}
                onPress={() => setDraft((d) => ({ ...d, level: option.value }))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={`mb-2 mr-2 rounded-full px-4 py-2 ${selected ? 'bg-brand' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-1.5 text-sm font-medium text-gray-700">Location</Text>
        <TextInput
          value={draft.location}
          onChangeText={(location) => setDraft((d) => ({ ...d, location }))}
          placeholder="City, state or country"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Location"
          autoCorrect={false}
          className="mb-6 h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900"
        />

        <Button title="Show jobs" onPress={() => onApply(draft)} />
        <Button
          title="Clear filters"
          variant="ghost"
          onPress={() => onApply(NO_FILTERS)}
          className="mt-2"
        />
        </ScrollView>
      </View>
    </Modal>
  );
}
