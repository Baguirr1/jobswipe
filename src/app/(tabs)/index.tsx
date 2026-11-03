import { router } from 'expo-router';
import { Bookmark, Heart, RefreshCw, RotateCcw, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyFeed } from '@/components/EmptyFeed';
import { activeFilterCount, FilterSheet, filterChips, NO_FILTERS } from '@/components/FilterSheet';
import { JobCardBack, JobCardFront } from '@/components/JobCard';
import { MatchModal } from '@/components/MatchModal';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { getRecommendedJobs, swipeJob, undoSwipe } from '@/lib/api';
import { backfillJobEmbeddings, embedMyProfile } from '@/lib/embeddings';
import type { JobFilters, RecommendedJob, SwipeDirection } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const BATCH_SIZE = 20;
const getKey = (job: RecommendedJob) => job.id;

export default function DiscoverScreen() {
  const { profile } = useAuth();
  const deck = useRef<SwipeDeckHandle>(null);
  const candidateId = profile?.id;
  const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Ranked by pgvector cosine distance; already-swiped jobs are excluded server-side.
  // A new `filters` value changes fetchBatch, which reloads the deck.
  const fetchBatch = useCallback(
    () => getRecommendedJobs(candidateId!, BATCH_SIZE, filters),
    [candidateId, filters],
  );
  // Imported jobs have no recruiter in the app, so a right swipe saves the job
  // for applying on the original site instead of waiting for a match.
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const undo = useCallback(async (job: RecommendedJob) => {
    await undoSwipe(job.id);
    setSavedNotice(null);
  }, []);
  const persist = useCallback(async (job: RecommendedJob, direction: SwipeDirection) => {
    const matchId = await swipeJob(job.id, direction);
    if (direction === 'right' && job.source !== 'jobswipe') {
      setSavedNotice(`Saved ${job.title}. Apply from the Saved tab.`);
    }
    return matchId;
  }, []);
  useEffect(() => {
    if (!savedNotice) return;
    const t = setTimeout(() => setSavedNotice(null), 2500);
    return () => clearTimeout(t);
  }, [savedNotice]);

  const feed = useSwipeQueue({
    fetchBatch,
    persist,
    getKey,
    undo,
    enabled: !!candidateId,
  });

  // Jobs without a score are missing an embedding (seeded data, or a save where
  // the embedding call failed). Once per session, ask the server to fill them in
  // and re-rank. If *nothing* is scored, our own profile embedding is missing too.
  const healed = useRef(false);
  const { items, refresh } = feed;
  useEffect(() => {
    if (healed.current || items.length === 0) return;
    const unscored = items.filter((j) => j.match_score_percentage == null).length;
    if (unscored === 0) return;
    healed.current = true;

    (async () => {
      try {
        if (unscored === items.length) await embedMyProfile();
        for (let round = 0; round < 5; round++) {
          const { remaining } = await backfillJobEmbeddings();
          if (remaining === 0) break;
        }
        refresh();
      } catch (e) {
        console.warn('Embedding backfill failed', e);
      }
    })();
  }, [items, refresh]);

  // Saving the profile re-embeds it and refreshes `profile`, which bumps
  // updated_at. Re-rank the deck so scores reflect the edited profile.
  const profileVersion = profile?.updated_at;
  const seenVersion = useRef(profileVersion);
  useEffect(() => {
    if (seenVersion.current === profileVersion) return;
    seenVersion.current = profileVersion;
    refresh();
  }, [profileVersion, refresh]);

  // Imported listings have no recruiter to match with: a right swipe only saves
  // them, so say "Save" rather than "Apply".
  const filterCount = activeFilterCount(filters);
  const top = feed.items[0];
  const topIsImported = !!top && top.source !== 'jobswipe';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Text className="text-3xl font-black text-brand">JobSwipe</Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Filters${filterCount ? `, ${filterCount} active` : ''}`}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              filterCount ? 'bg-brand' : 'bg-white'
            }`}
          >
            <SlidersHorizontal size={18} color={filterCount ? '#fff' : '#6B7280'} />
          </Pressable>
          <Pressable
            onPress={feed.refresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh recommendations"
            className="h-10 w-10 items-center justify-center rounded-full bg-white"
          >
            <RefreshCw size={18} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      {filterCount ? (
        <View className="mb-2 flex-row flex-wrap items-center px-5">
          {filterChips(filters).map((chip) => (
            <Pressable
              key={chip}
              onPress={() => setFiltersOpen(true)}
              className="mb-1 mr-2 rounded-full bg-brand-light px-3 py-1"
            >
              <Text className="text-xs font-semibold text-brand">{chip}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setFilters(NO_FILTERS)} accessibilityRole="button" className="mb-1">
            <Text className="text-xs font-semibold text-gray-500">Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {feed.error ? (
        <Pressable onPress={feed.clearError} className="mx-5 mb-2 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{feed.error}</Text>
        </Pressable>
      ) : null}
      {savedNotice ? (
        <Pressable
          onPress={() => router.push('/saved')}
          className="mx-5 mb-2 rounded-xl bg-brand-light px-4 py-3"
        >
          <Text className="text-sm font-medium text-brand-dark" numberOfLines={2}>
            {savedNotice}
          </Text>
        </Pressable>
      ) : null}

      <View className="flex-1 px-4 pb-2">
        {feed.loading && feed.items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#6C47FF" />
            <Text className="mt-3 text-gray-500">Finding your best matches…</Text>
          </View>
        ) : (
          <SwipeDeck
            ref={deck}
            data={feed.items}
            keyExtractor={getKey}
            likeLabel={topIsImported ? 'SAVE' : 'APPLY'}
            renderFront={(job) => <JobCardFront job={job} me={profile} />}
            renderBack={(job) => <JobCardBack job={job} me={profile} />}
            onSwipe={feed.swipe}
            emptyComponent={
              filterCount ? (
                <EmptyFeed
                  title="No jobs match your filters"
                  subtitle="Try a lower salary, a broader location, or clear the filters."
                  onRefresh={() => setFilters(NO_FILTERS)}
                />
              ) : (
                <EmptyFeed onRefresh={feed.refresh} />
              )
            }
          />
        )}
      </View>

      {(feed.items.length > 0 || feed.canUndo) && (
        <View className="flex-row items-center justify-center gap-6 pb-6 pt-3">
          <Pressable
            onPress={feed.undo}
            disabled={!feed.canUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo last swipe"
            accessibilityState={{ disabled: !feed.canUndo }}
            className={`h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ${
              feed.canUndo ? '' : 'opacity-40'
            }`}
          >
            <RotateCcw size={20} color="#F59E0B" strokeWidth={2.5} />
          </Pressable>
          {/* With an empty deck, only Undo is useful (bring the last card back). */}
          {feed.items.length > 0 ? (
            <>
              <ActionButton
                label="Pass"
                onPress={() => deck.current?.swipe('left')}
                icon={<X size={32} color="#EF4444" strokeWidth={3} />}
              />
              {topIsImported ? (
                <ActionButton
                  label="Save job"
                  onPress={() => deck.current?.swipe('right')}
                  icon={<Bookmark size={28} color="#22C55E" fill="#22C55E" />}
                />
              ) : (
                <ActionButton
                  label="Apply"
                  onPress={() => deck.current?.swipe('right')}
                  icon={<Heart size={30} color="#22C55E" fill="#22C55E" />}
                />
              )}
            </>
          ) : null}
        </View>
      )}

      <FilterSheet
        visible={filtersOpen}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFiltersOpen(false);
          setFilters(next);
        }}
      />

      <MatchModal
        visible={!!feed.match}
        title={feed.match ? `${feed.match.item.company_name} is interested in you too.` : ''}
        subtitle={feed.match?.item.title ?? ''}
        onClose={feed.clearMatch}
        onChat={() => {
          const id = feed.match?.id;
          feed.clearMatch();
          if (id) router.push({ pathname: '/chat/[matchId]', params: { matchId: id } });
        }}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-16 w-16 items-center justify-center rounded-full bg-white shadow-md active:scale-95"
    >
      {icon}
    </Pressable>
  );
}
