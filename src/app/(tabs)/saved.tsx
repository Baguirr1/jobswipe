import { router, useFocusEffect } from 'expo-router';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MoreHorizontal,
  StickyNote,
  Trash2,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { JobDescription } from '@/components/JobDescription';
import { colForJob, describeRpp, SavedInsights } from '@/components/SavedInsights';
import { SectionHero } from '@/components/SectionHero';
import { Button, CompanyLogo, Tag } from '@/components/ui';
import { getSavedJobs, removeSavedJob, setSavedJobNote, setSavedJobStage } from '@/lib/api';
import { formatPay, sourceLabel, timeAgo } from '@/lib/format';
import { showAlert } from '@/lib/notify';
import type { ApplicationStage, SavedJob } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Segment = 'todo' | 'active' | 'closed';

const SEGMENT_OF: Record<ApplicationStage, Segment> = {
  saved: 'todo',
  applied: 'active',
  interviewing: 'active',
  offer: 'active',
  rejected: 'closed',
};

const STAGES: { value: ApplicationStage; label: string; pill: string; text: string }[] = [
  { value: 'saved', label: 'To apply', pill: 'bg-gray-100', text: 'text-gray-700' },
  { value: 'applied', label: 'Applied', pill: 'bg-blue-50', text: 'text-blue-700' },
  { value: 'interviewing', label: 'Interviewing', pill: 'bg-amber-50', text: 'text-amber-700' },
  { value: 'offer', label: 'Offer', pill: 'bg-green-50', text: 'text-green-700' },
  { value: 'rejected', label: 'Rejected', pill: 'bg-red-50', text: 'text-red-700' },
];
const stageInfo = (s: ApplicationStage) => STAGES.find((x) => x.value === s)!;

const EMPTY: Record<Segment, { title: string; body: string }> = {
  todo: {
    title: 'Nothing to apply to',
    body: 'Swipe right on listings from job boards to save them here.',
  },
  active: {
    title: 'No applications yet',
    body: 'After applying on the company’s site, set the job to “Applied” to track it here.',
  },
  closed: {
    title: 'Nothing closed',
    body: 'Jobs you mark as rejected move here, so your active list stays focused.',
  },
};

export default function SavedJobsScreen() {
  const { profile } = useAuth();
  const [saved, setSaved] = useState<SavedJob[]>([]);
  const [segment, setSegment] = useState<Segment>('todo');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by every load and every change. A load only applies its result if
  // nothing happened since it started, so a slow refresh can't undo a newer edit.
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

  const patch = (jobId: string, fields: Partial<SavedJob>) =>
    setSaved((prev) => prev.map((s) => (s.job.id === jobId ? { ...s, ...fields } : s)));

  const changeStage = async (item: SavedJob, stage: ApplicationStage) => {
    if (stage === item.stage) return;
    version.current++;
    const now = new Date().toISOString();
    patch(item.job.id, {
      stage,
      tracked_at: now,
      applied_at: stage === 'saved' ? null : item.applied_at ?? now,
    });
    try {
      await setSavedJobStage(item.job.id, stage);
    } catch (e) {
      patch(item.job.id, { stage: item.stage, tracked_at: item.tracked_at, applied_at: item.applied_at });
      showAlert('Couldn’t update', (e as Error).message);
    }
  };

  const saveNote = async (item: SavedJob, note: string): Promise<boolean> => {
    const trimmed = note.trim();
    if (trimmed === item.note) return true;
    version.current++;
    patch(item.job.id, { note: trimmed, tracked_at: new Date().toISOString() });
    try {
      await setSavedJobNote(item.job.id, trimmed);
      return true;
    } catch (e) {
      patch(item.job.id, { note: item.note, tracked_at: item.tracked_at });
      showAlert('Couldn’t save the note', (e as Error).message);
      return false;
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

  const counts = { todo: 0, active: 0, closed: 0 };
  const stageCounts: Partial<Record<ApplicationStage, number>> = {};
  for (const s of saved) {
    counts[SEGMENT_OF[s.stage]]++;
    stageCounts[s.stage] = (stageCounts[s.stage] ?? 0) + 1;
  }
  const rows = saved.filter((s) => SEGMENT_OF[s.stage] === segment);
  const pipeline = (['applied', 'interviewing', 'offer'] as const)
    .filter((s) => stageCounts[s])
    .map((s) => `${stageCounts[s]} ${stageInfo(s).label.toLowerCase()}`)
    .join(' · ');

  return (
    <View className="flex-1 bg-gray-50" style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
      <FlatList
        data={rows}
        keyExtractor={(s) => s.job.id}
        contentContainerClassName="flex-grow p-5"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#6C47FF" colors={['#6C47FF']} />}
        ItemSeparatorComponent={() => <View className="h-4" />}
        ListHeaderComponent={
          <>
            <SectionHero
              eyebrow="YOUR JOB SEARCH"
              title="Application tracker"
              subtitle={pipeline || 'Save roles you love, then track every application from here.'}
            />
            <SavedInsights saved={saved} profile={profile} />
            <View className="mb-5 flex-row rounded-2xl bg-brand-light p-1.5">
              <SegmentButton label={`To apply (${counts.todo})`} selected={segment === 'todo'} onPress={() => setSegment('todo')} />
              <View className="w-1.5" />
              <SegmentButton label={`Active (${counts.active})`} selected={segment === 'active'} onPress={() => setSegment('active')} />
              <View className="w-1.5" />
              <SegmentButton label={`Closed (${counts.closed})`} selected={segment === 'closed'} onPress={() => setSegment('closed')} />
            </View>

            {error ? (
              <Pressable onPress={load} accessibilityRole="button" className="mb-4 rounded-xl bg-red-50 px-4 py-3">
                <Text className="text-sm text-red-700">Couldn’t load saved jobs. Tap to try again.</Text>
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !loaded || error ? undefined : (
            <View className="flex-1 items-center justify-center px-8">
              <Bookmark size={56} color="#C4B5FD" />
              <Text className="mt-4 text-center text-lg font-semibold text-gray-800">{EMPTY[segment].title}</Text>
              <Text className="mt-1 text-center text-gray-500">{EMPTY[segment].body}</Text>
              {segment === 'todo' ? (
                <Button title="Discover jobs" onPress={() => router.navigate('/')} className="mt-6" />
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => (
          <SavedJobRow
            item={item}
            expanded={expanded === item.job.id}
            onToggleExpand={() => setExpanded((cur) => (cur === item.job.id ? null : item.job.id))}
            onApply={openApply}
            onStage={(stage) => changeStage(item, stage)}
            onSaveNote={(note) => saveNote(item, note)}
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
      className={`min-h-12 flex-1 items-center justify-center rounded-xl px-1 py-2.5 ${selected ? 'bg-white shadow-sm' : 'bg-transparent'}`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-brand-dark' : 'text-gray-600'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SavedJobRow({
  item,
  expanded,
  onToggleExpand,
  onApply,
  onStage,
  onSaveNote,
  onRemove,
}: {
  item: SavedJob;
  expanded: boolean;
  onToggleExpand: () => void;
  onApply: (url: string) => void;
  onStage: (stage: ApplicationStage) => void;
  onSaveNote: (note: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note);
  const { job } = item;
  const where = job.is_remote ? 'Remote' : job.location;
  const pay = formatPay(job);
  const col = colForJob(job);
  const stage = stageInfo(item.stage);

  const status =
    item.stage === 'saved'
      ? `${sourceLabel(job.source) ?? 'Saved'} · saved ${timeAgo(item.created_at)} ago`
      : `${stage.label} · updated ${timeAgo(item.tracked_at ?? item.applied_at ?? item.created_at)} ago`;

  const startNote = () => {
    setNoteDraft(item.note);
    setEditingNote(true);
  };
  const submitNote = async () => {
    if (await onSaveNote(noteDraft)) setEditingNote(false);
  };

  return (
    <View className="rounded-3xl border border-purple-100 bg-white p-5">
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${job.title} at ${job.company_name}. ${expanded ? 'Hide' : 'Show'} details`}
        className="flex-row items-center"
      >
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={48} />
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-gray-900" numberOfLines={2}>
            {job.title}
          </Text>
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {job.company_name}
            {where ? ` · ${where}` : ''}
          </Text>
          <Text className="text-xs text-gray-400">{status}</Text>
        </View>
        {expanded ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
      </Pressable>

      <Text className={`mt-4 text-lg ${pay.estimated ? 'font-semibold text-gray-600' : 'font-bold text-gray-900'}`}>{pay.text}</Text>
      {col ? (
        <Text className="mt-0.5 text-xs text-gray-500">
          ≈ ${Math.round(col.adjusted / 1000)}k in US-average dollars · {col.state} {describeRpp(col.rpp)}
          {col.noWageTax ? ' · no state income tax' : ''}
        </Text>
      ) : null}
      {expanded ? (
        <View className="mt-3 border-t border-purple-50 pt-3">
          {job.required_skills.length ? (
            <View className="mb-1 flex-row flex-wrap">
              {job.required_skills.map((s) => (
                <Tag key={s} label={s} />
              ))}
            </View>
          ) : null}
          <JobDescription text={job.description} compact />
        </View>
      ) : null}

      {/* Private note */}
      {editingNote ? (
        <View className="mt-4">
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="e.g. Talked to Sarah, follow up Friday"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
            autoFocus
            accessibilityLabel={`Note for ${job.title}`}
            className="min-h-24 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-gray-900"
            textAlignVertical="top"
          />
          <View className="mt-2 flex-row items-center justify-end gap-2">
            <Text className="mr-auto text-xs text-gray-400">Only you can see this · {noteDraft.length}/1000</Text>
            <Pressable onPress={() => setEditingNote(false)} accessibilityRole="button" className="min-h-10 justify-center rounded-xl px-4">
              <Text className="text-sm font-semibold text-gray-600">Cancel</Text>
            </Pressable>
            <Pressable onPress={submitNote} accessibilityRole="button" className="min-h-10 justify-center rounded-xl bg-brand px-4 active:bg-brand-dark">
              <Text className="text-sm font-semibold text-white">Save note</Text>
            </Pressable>
          </View>
        </View>
      ) : item.note ? (
        <Pressable
          onPress={startNote}
          accessibilityRole="button"
          accessibilityLabel={`Edit note: ${item.note}`}
          className="mt-4 flex-row rounded-2xl bg-amber-50 px-4 py-3"
        >
          <StickyNote size={16} color="#B45309" />
          <Text className="ml-2 flex-1 text-sm leading-5 text-gray-800">{item.note}</Text>
        </Pressable>
      ) : null}

      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        {job.apply_url && item.stage === 'saved' ? (
          <Pressable
            onPress={() => onApply(job.apply_url!)}
            accessibilityRole="link"
            accessibilityLabel={`Apply to ${job.title} at ${job.company_name}`}
            className="min-h-12 flex-row items-center justify-center rounded-2xl bg-brand px-5 py-3 active:bg-brand-dark"
          >
            <Text className="mr-1 text-sm font-semibold text-white">Apply</Text>
            <ExternalLink size={14} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setStagesOpen(!stagesOpen)}
          accessibilityRole="button"
          accessibilityState={{ expanded: stagesOpen }}
          accessibilityLabel={`Stage: ${stage.label}. Change stage`}
          className={`min-h-12 flex-row items-center rounded-2xl px-4 py-3 ${stage.pill}`}
        >
          <Text className={`text-sm font-semibold ${stage.text}`}>
            {item.stage === 'saved' ? 'Set stage' : stage.label}
          </Text>
          <ChevronDown size={14} color="#6B7280" style={{ marginLeft: 4 }} />
        </Pressable>
        {!editingNote && !item.note ? (
          <Pressable
            onPress={startNote}
            accessibilityRole="button"
            accessibilityLabel={`Add a note for ${job.title}`}
            className="min-h-12 flex-row items-center rounded-2xl bg-gray-100 px-3 py-3"
          >
            <StickyNote size={14} color="#374151" />
            <Text className="ml-1 text-sm font-semibold text-gray-700">Note</Text>
          </Pressable>
        ) : null}
        <View className="flex-1" />
        <Pressable
          onPress={() => setMenuOpen(!menuOpen)}
          accessibilityRole="button"
          accessibilityState={{ expanded: menuOpen }}
          accessibilityLabel={`More actions for ${job.title}`}
          className="h-12 w-12 items-center justify-center rounded-2xl bg-gray-50"
        >
          <MoreHorizontal size={20} color="#6B7280" />
        </Pressable>
      </View>

      {stagesOpen ? (
        <View className="mt-3 flex-row flex-wrap" accessibilityRole="radiogroup">
          {STAGES.map((s) => {
            const selected = s.value === item.stage;
            return (
              <Pressable
                key={s.value}
                onPress={() => {
                  setStagesOpen(false);
                  onStage(s.value);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={`mb-2 mr-2 min-h-10 justify-center rounded-full px-4 py-2 ${selected ? 'bg-brand' : s.pill}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : s.text}`}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {menuOpen ? (
        <View className="mt-3 gap-2">
          {job.apply_url && item.stage !== 'saved' ? (
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                onApply(job.apply_url!);
              }}
              accessibilityRole="link"
              className="min-h-12 flex-row items-center rounded-xl bg-gray-50 px-4 py-3"
            >
              <ExternalLink size={16} color="#374151" />
              <Text className="ml-2 text-sm font-semibold text-gray-700">Open original listing</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onRemove();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${job.title} from saved jobs`}
            className="min-h-12 flex-row items-center rounded-xl bg-red-50 px-4 py-3"
          >
            <Trash2 size={16} color="#B91C1C" />
            <Text className="ml-2 text-sm font-semibold text-red-700">Remove from saved</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
