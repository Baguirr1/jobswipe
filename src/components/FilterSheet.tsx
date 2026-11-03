import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import type { JobFilters } from '@/lib/types';

export const NO_FILTERS: JobFilters = { remoteOnly: false, minSalary: null, location: '' };

const SALARY_STEPS = [null, 50_000, 75_000, 100_000, 125_000, 150_000] as const;

export function activeFilterCount(f: JobFilters) {
  return Number(f.remoteOnly) + Number(f.minSalary != null) + Number(!!f.location.trim());
}

/** Short labels for the chips above the deck. */
export function filterChips(f: JobFilters): string[] {
  const chips: string[] = [];
  if (f.remoteOnly) chips.push('Remote');
  if (f.minSalary != null) chips.push(`$${f.minSalary / 1000}k+`);
  if (f.location.trim()) chips.push(f.location.trim());
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
      <View className="rounded-t-3xl bg-white px-6 pb-10 pt-5">
        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-gray-900">Filter jobs</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters">
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>

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
      </View>
    </Modal>
  );
}
