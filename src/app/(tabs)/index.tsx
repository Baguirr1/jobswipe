import { router } from 'expo-router';
import { Bookmark, Heart, Map as MapIcon, RefreshCw, RotateCcw, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyFeed } from '@/components/EmptyFeed';
import { activeFilterCount, FilterSheet, filterChips, NO_FILTERS } from '@/components/FilterSheet';
import { JobCardBack, JobCardFront } from '@/components/JobCard';
import { JobMap } from '@/components/JobMap';
import { MatchModal } from '@/components/MatchModal';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { getRecommendedJobs, swipeJob, undoSwipe } from '@/lib/api';
import { CITIES, cityLabel } from '@/lib/cities';
import { payPicture } from '@/lib/cost';
import { backfillJobEmbeddings, embedMyProfile } from '@/lib/embeddings';
import { C } from '@/lib/theme';
import type { JobFilters, RecommendedJob, SwipeDirection } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const BATCH_SIZE = 20;
/** "Best pay for cost of living" re-ranks this many top matches per batch. */
const VALUE_BATCH_SIZE = 50;
const MAP_POOL_SIZE = 100;
/** Side-by-side deck + map from this width (tablets, desktop web). */
const WIDE = 960;
const getKey = (job: RecommendedJob) => job.id;

const byValue = (a: RecommendedJob, b: RecommendedJob) =>
  (payPicture(b)?.adjusted ?? -1) - (payPicture(a)?.adjusted ?? -1);

export default function DiscoverScreen() {
  const { profile } = useAuth();
  const deck = useRef<SwipeDeckHandle>(null);
  const candidateId = profile?.id;
  const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  // Ranked by pgvector cosine distance (or the chosen sort); already-swiped jobs
  // are excluded server-side. A new `filters` value changes fetchBatch, which
  // reloads the deck.
  const fetchBatch = useCallback(async () => {
    if (filters.sort !== 'value') return getRecommendedJobs(candidateId!, BATCH_SIZE, filters);
    const jobs = await getRecommendedJobs(candidateId!, VALUE_BATCH_SIZE, filters);
    return [...jobs].sort(byValue);
  }, [candidateId, filters]);

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

  // The map shows every city for the current filters *except* location, so
  // picking a city doesn't make all the other pins disappear.
  const [mapPool, setMapPool] = useState<RecommendedJob[]>([]);
  const [mapVersion, setMapVersion] = useState(0);
  const { location: _loc, ...mapFilterParts } = filters;
  const mapKey = JSON.stringify(mapFilterParts);
  useEffect(() => {
    if (!candidateId) return;
    let live = true;
    getRecommendedJobs(candidateId, MAP_POOL_SIZE, { ...filters, location: '' })
      .then((jobs) => live && setMapPool(jobs))
      .catch((e) => console.warn('Map jobs failed to load', e));
    return () => {
      live = false;
    };
    // Location changes don't refetch the map (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, mapKey, mapVersion]);
  // Hide cards swiped since the map loaded.
  const [swipedIds, setSwipedIds] = useState<ReadonlySet<string>>(() => new Set());
  const { swipe: feedSwipe } = feed;
  const onSwipe = useCallback(
    (job: RecommendedJob, d: SwipeDirection) => {
      setSwipedIds((s) => new Set(s).add(job.id));
      feedSwipe(job, d);
    },
    [feedSwipe],
  );
  const mapJobs = useMemo(() => mapPool.filter((j) => !swipedIds.has(j.id)), [mapPool, swipedIds]);

  const selectedCity = useMemo(() => {
    const loc = filters.location.trim().toLowerCase();
    const c = loc ? CITIES.find((x) => x.city.toLowerCase() === loc) : null;
    return c ? cityLabel(c) : null;
  }, [filters.location]);
  const selectCity = (label: string | null) => {
    const c = label ? CITIES.find((x) => cityLabel(x) === label) : null;
    setFilters((f) => ({ ...f, location: c ? c.city : '' }));
  };

  const refresh = () => {
    setSwipedIds(new Set());
    setMapVersion((v) => v + 1);
    feed.refresh();
  };

  // Jobs without a score are missing an embedding (seeded data, or a save where
  // the embedding call failed). Once per session, ask the server to fill them in
  // and re-rank. If *nothing* is scored, our own profile embedding is missing too.
  const healed = useRef(false);
  const { items, refresh: refreshFeed } = feed;
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
        refreshFeed();
      } catch (e) {
        console.warn('Embedding backfill failed', e);
      }
    })();
  }, [items, refreshFeed]);

  // Saving the profile re-embeds it and refreshes `profile`, which bumps
  // updated_at. Re-rank the deck so scores reflect the edited profile.
  const profileVersion = profile?.updated_at;
  const seenVersion = useRef(profileVersion);
  useEffect(() => {
    if (seenVersion.current === profileVersion) return;
    seenVersion.current = profileVersion;
    refreshFeed();
  }, [profileVersion, refreshFeed]);

  // Keyboard on web: ← pass, → apply/save, U undo, F filters, M map.
  const keys = useRef({ undo: feed.undo });
  useEffect(() => {
    keys.current = { undo: feed.undo };
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft') deck.current?.swipe('left');
      else if (e.key === 'ArrowRight') deck.current?.swipe('right');
      else if (e.key.toLowerCase() === 'u') keys.current.undo();
      else if (e.key.toLowerCase() === 'f') setFiltersOpen(true);
      else if (e.key.toLowerCase() === 'm') setMapOpen((o) => !o);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Imported listings have no recruiter to match with: a right swipe only saves
  // them, so say "Save" rather than "Apply".
  const filterCount = activeFilterCount(filters);
  const chips = filterChips(filters);
  const top = feed.items[0];
  const topIsImported = !!top && top.source !== 'jobswipe';

  const mapPanel = (
    <View className="rounded-2xl border border-line bg-white p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs font-bold uppercase tracking-widest text-ink-3">Where these jobs are</Text>
        {selectedCity ? (
          <Pressable
            onPress={() => selectCity(null)}
            accessibilityRole="button"
            accessibilityLabel="Show all cities"
            className="rounded-full bg-brand-light px-2.5 py-0.5"
          >
            <Text className="text-xs font-bold text-brand">{selectedCity.split(',')[0]} ✕</Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="mb-2 mt-1 text-xs text-ink-3">
        Pin size = number of jobs. Color = median salary. Tap a pin to see only that city.
      </Text>
      <JobMap
        jobs={mapJobs}
        selected={selectedCity}
        onSelect={(label) => {
          selectCity(label);
          if (!wide) setMapOpen(false);
        }}
        current={top}
        listLimit={wide ? 8 : undefined}
      />
    </View>
  );

  const deckColumn = (
    <View style={{ flex: 1, width: '100%', maxWidth: 460, alignSelf: wide ? 'stretch' : 'center' }}>
      {feed.error ? (
        <Pressable onPress={feed.clearError} className="mx-5 mb-2 rounded-xl bg-nope-soft px-4 py-3">
          <Text className="text-sm text-nope">{feed.error}</Text>
        </Pressable>
      ) : null}
      {savedNotice ? (
        <Pressable onPress={() => router.push('/saved')} className="mx-5 mb-2 rounded-xl bg-brand-light px-4 py-3">
          <Text className="text-sm font-medium text-brand-dark" numberOfLines={2}>
            {savedNotice}
          </Text>
        </Pressable>
      ) : null}

      <View className="flex-1 px-5 pb-4 pt-2" style={{ maxHeight: 640 }}>
        {feed.loading && feed.items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={C.accent} />
            <Text className="mt-3 text-ink-3">Finding your best matches…</Text>
          </View>
        ) : (
          <SwipeDeck
            ref={deck}
            data={feed.items}
            keyExtractor={getKey}
            likeLabel={topIsImported ? 'SAVE' : 'APPLY'}
            renderFront={(job) => <JobCardFront job={job} me={profile} />}
            renderBack={(job) => <JobCardBack job={job} me={profile} />}
            onSwipe={onSwipe}
            emptyComponent={
              filterCount ? (
                <EmptyFeed
                  title="No jobs match your filters"
                  subtitle="Try a lower salary, a broader location, or clear the filters."
                  onRefresh={() => setFilters(NO_FILTERS)}
                />
              ) : (
                <EmptyFeed onRefresh={refresh} />
              )
            }
          />
        )}
      </View>

      {(feed.items.length > 0 || feed.canUndo) && (
        <View className="flex-row items-center justify-center pb-2 pt-1" style={{ gap: 16 }}>
          <RoundButton
            small
            label="Undo last swipe"
            onPress={feed.undo}
            disabled={!feed.canUndo}
            icon={<RotateCcw size={20} color={C.ink3} strokeWidth={2.2} />}
          />
          {/* With an empty deck, only Undo is useful (bring the last card back). */}
          {feed.items.length > 0 ? (
            <>
              <RoundButton
                label="Pass"
                onPress={() => deck.current?.swipe('left')}
                icon={<X size={28} color={C.pass} strokeWidth={2.8} />}
              />
              {!wide ? (
                <RoundButton
                  small
                  label="Map"
                  onPress={() => setMapOpen(true)}
                  icon={<MapIcon size={19} color={C.accent} strokeWidth={2.2} />}
                />
              ) : null}
              <RoundButton
                label={topIsImported ? 'Save job' : 'Apply'}
                onPress={() => deck.current?.swipe('right')}
                icon={
                  topIsImported ? (
                    <Bookmark size={26} color={C.like} fill={C.like} />
                  ) : (
                    <Heart size={28} color={C.like} fill={C.like} />
                  )
                }
              />
            </>
          ) : null}
        </View>
      )}
      {feed.items.length > 0 ? (
        <Text className="pb-3 text-center text-xs text-ink-3">
          Tap a card for details · swipe left to pass · right to {topIsImported ? 'save' : 'apply'}
          {Platform.OS === 'web' && wide ? ' · ← → keys, U undo, F filters' : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View style={{ flex: 1, width: '100%', maxWidth: wide ? 1120 : 480, alignSelf: 'center' }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
          <View className="flex-1">
            <Text className="text-[26px] font-extrabold tracking-tight text-ink">
              Discover
            </Text>
            <Text className="mt-0.5 text-[13px] text-ink-3">
              {feed.items.length
                ? `${feed.items.length}${feed.items.length >= BATCH_SIZE ? '+' : ''} jobs ranked for you`
                : 'Your next move starts here.'}
            </Text>
          </View>
          <View className="flex-row" style={{ gap: 8 }}>
            <HeaderButton
              label={`Filters${filterCount ? `, ${filterCount} active` : ''}`}
              active={filterCount > 0 || filters.sort !== 'match'}
              onPress={() => setFiltersOpen(true)}
              icon={(c) => <SlidersHorizontal size={18} color={c} />}
            />
            <HeaderButton label="Refresh recommendations" onPress={refresh} icon={(c) => <RefreshCw size={18} color={c} />} />
          </View>
        </View>

        {chips.length ? (
          <View className="mb-1 flex-row flex-wrap items-center px-5">
            {chips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => setFiltersOpen(true)}
                className="mb-1 mr-2 rounded-full bg-brand-light px-3 py-1"
              >
                <Text className="text-xs font-semibold text-brand">{chip}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setFilters(NO_FILTERS)} accessibilityRole="button" className="mb-1">
              <Text className="text-xs font-semibold text-ink-3">Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {wide ? (
          <View className="flex-1 flex-row px-3" style={{ gap: 20 }}>
            {deckColumn}
            <ScrollView style={{ width: 360, flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 24 }}>
              {mapPanel}
            </ScrollView>
          </View>
        ) : (
          deckColumn
        )}
      </View>

      <Modal visible={mapOpen && !wide} transparent animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setMapOpen(false)} accessibilityLabel="Close map" />
        <View className="max-h-[85%] rounded-t-3xl bg-canvas px-4 pb-8 pt-4">
          <View className="mb-3 flex-row items-center justify-between px-1">
            <Text className="text-xl font-extrabold tracking-tight text-ink">Job map</Text>
            <Pressable onPress={() => setMapOpen(false)} accessibilityRole="button" accessibilityLabel="Close map">
              <X size={22} color={C.ink3} />
            </Pressable>
          </View>
          <ScrollView>{mapPanel}</ScrollView>
        </View>
      </Modal>

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

function HeaderButton({
  label,
  onPress,
  icon,
  active,
}: {
  label: string;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-10 w-10 items-center justify-center rounded-xl border ${
        active ? 'border-brand bg-brand' : 'border-line bg-white'
      }`}
    >
      {icon(active ? '#fff' : C.ink2)}
    </Pressable>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  small,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const size = small ? 46 : 62;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        shadowColor: C.ink,
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
      className={`items-center justify-center border border-line bg-white active:scale-95 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {icon}
    </Pressable>
  );
}
