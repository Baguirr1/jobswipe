import { useFocusEffect } from 'expo-router';
import { Bookmark, Check, ChevronDown, ChevronUp, ExternalLink, Trash2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { CompanyLogo, Tag } from '@/components/ui';
import { getSavedJobs, removeSavedJob, setSavedJobApplied } from '@/lib/api';
import { formatSalaryRange, sourceLabel, timeAgo } from '@/lib/format';
import { showAlert } from '@/lib/notify';
import type { SavedJob } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Segment = 'todo' | 'applied';

export default function SavedJobsScreen() {
  const { profile } = useAuth();
  const [saved, setSaved] = useState<SavedJob[]>([]);
  const [segment, setSegment] = useState<Segment>('todo');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by every load and every change. A load only applies its result if
  // nothing happened since it started, so a slow refresh can't undo a newer
  // "Mark applied" / "Remove".
  const version = useRef(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const started = ++version.current;
    setRefreshing(true);
    try {
      const rows = await getSavedJobs(profile.id);
      if (started !== version.current) return;
      setSaved(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleApplied = async (item: SavedJob) => {
    const applied = !item.applied_at;
    version.current++;
    const patch = (applied_at: string | null) =>
      setSaved((prev) => prev.map((s) => (s.job.id === item.job.id ? { ...s, applied_at } : s)));
    patch(applied ? new Date().toISOString() : null);
    try {
      await setSavedJobApplied(item.job.id, applied);
    } catch (e) {
      patch(item.applied_at);
      showAlert('Couldn’t update', (e as Error).message);
    }
  };

  const remove = async (item: SavedJob) => {
    version.current++;
    setSaved((prev) => prev.filter((s) => s.job.id !== item.job.id));
    try {
      await removeSavedJob(item.job.id);
    } catch (e) {
      setSaved((prev) => (prev.some((s) => s.job.id === item.job.id) ? prev : [item, ...prev]));
      showAlert('Couldn’t remove', (e as Error).message);
    }
  };

  const openApply = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('Couldn’t open the listing', url);
    }
  };

  const todo = saved.filter((s) => !s.applied_at);
  const applied = saved.filter((s) => s.applied_at);
  const rows = segment === 'todo' ? todo : applied;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-row px-4 pt-3">
        <SegmentButton label={`To apply (${todo.length})`} selected={segment === 'todo'} onPress={() => setSegment('todo')} />
        <View className="w-2" />
        <SegmentButton label={`Applied (${applied.length})`} selected={segment === 'applied'} onPress={() => setSegment('applied')} />
      </View>

      {error ? (
        <Pressable onPress={load} accessibilityRole="button" className="mx-4 mt-3 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">Couldn’t load saved jobs. Tap to try again.</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(s) => s.job.id}
        contentContainerClassName="flex-grow p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          !loaded || error ? undefined : (
            <View className="flex-1 items-center justify-center px-8">
              <Bookmark size={56} color="#C4B5FD" />
              <Text className="mt-4 text-center text-lg font-semibold text-gray-800">
                {segment === 'todo' ? 'Nothing to apply to' : 'No applications yet'}
              </Text>
              <Text className="mt-1 text-center text-gray-500">
                {segment === 'todo'
                  ? 'Swipe right on listings from job boards to save them here.'
                  : 'After applying on the company’s site, tap “Mark applied” to track it here.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <SavedJobRow
            item={item}
            expanded={expanded === item.job.id}
            onToggleExpand={() => setExpanded((cur) => (cur === item.job.id ? null : item.job.id))}
            onApply={openApply}
            onToggleApplied={() => toggleApplied(item)}
            onRemove={() => remove(item)}
          />
        )}
      />
    </View>
  );
}

function SegmentButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      className={`flex-1 items-center rounded-xl py-2.5 ${selected ? 'bg-brand' : 'bg-white'}`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
    </Pressable>
  );
}

function SavedJobRow({
  item,
  expanded,
  onToggleExpand,
  onApply,
  onToggleApplied,
  onRemove,
}: {
  item: SavedJob;
  expanded: boolean;
  onToggleExpand: () => void;
  onApply: (url: string) => void;
  onToggleApplied: () => void;
  onRemove: () => void;
}) {
  const { job } = item;
  const where = job.is_remote ? 'Remote' : job.location;
  return (
    <View className="rounded-2xl bg-white p-4">
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${job.title} at ${job.company_name}. ${expanded ? 'Hide' : 'Show'} details`}
        className="flex-row items-center"
      >
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={44} />
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
            {job.title}
          </Text>
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {job.company_name}
            {where ? ` · ${where}` : ''}
          </Text>
          <Text className="text-xs text-gray-400">
            {item.applied_at
              ? `Applied ${timeAgo(item.applied_at)} ago`
              : `${sourceLabel(job.source) ?? ''} · saved ${timeAgo(item.created_at)} ago`}
          </Text>
        </View>
        {expanded ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
      </Pressable>

      {expanded ? (
        <View className="mt-3">
          <Text className="mb-2 text-sm font-semibold text-green-700">
            {formatSalaryRange(job.salary_min, job.salary_max)}
          </Text>
          {job.required_skills.length ? (
            <View className="mb-1 flex-row flex-wrap">
              {job.required_skills.map((s) => (
                <Tag key={s} label={s} />
              ))}
            </View>
          ) : null}
          <Text className="text-sm leading-5 text-gray-700">
            {job.description || 'No description provided.'}
          </Text>
        </View>
      ) : null}

      <View className="mt-3 flex-row items-center">
        {job.apply_url ? (
          <Pressable
            onPress={() => onApply(job.apply_url!)}
            accessibilityRole="link"
            accessibilityLabel={`Apply to ${job.title} at ${job.company_name}`}
            className="mr-2 flex-row items-center rounded-full bg-brand px-3 py-2 active:bg-brand-dark"
          >
            <Text className="mr-1 text-sm font-semibold text-white">Apply</Text>
            <ExternalLink size={14} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onToggleApplied}
          accessibilityRole="button"
          className={`mr-2 flex-row items-center rounded-full px-3 py-2 ${
            item.applied_at ? 'bg-green-50' : 'bg-gray-100'
          }`}
        >
          <Check size={14} color={item.applied_at ? '#16A34A' : '#374151'} />
          <Text className={`ml-1 text-sm font-semibold ${item.applied_at ? 'text-green-700' : 'text-gray-700'}`}>
            {item.applied_at ? 'Applied' : 'Mark applied'}
          </Text>
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${job.title} from saved jobs`}
          className="h-9 w-9 items-center justify-center rounded-full bg-gray-100"
        >
          <Trash2 size={16} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );
}
