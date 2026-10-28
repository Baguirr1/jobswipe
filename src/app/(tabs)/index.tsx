import { router } from 'expo-router';
import { Heart, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyFeed } from '@/components/EmptyFeed';
import { JobCardBack, JobCardFront } from '@/components/JobCard';
import { MatchModal } from '@/components/MatchModal';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { getRecommendedJobs, swipeJob } from '@/lib/api';
import { backfillJobEmbeddings, embedMyProfile } from '@/lib/embeddings';
import type { RecommendedJob, SwipeDirection } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const BATCH_SIZE = 20;
const getKey = (job: RecommendedJob) => job.id;

export default function DiscoverScreen() {
  const { profile } = useAuth();
  const deck = useRef<SwipeDeckHandle>(null);
  const candidateId = profile?.id;

  // Ranked by pgvector cosine distance; already-swiped jobs are excluded server-side.
  const fetchBatch = useCallback(
    () => getRecommendedJobs(candidateId!, BATCH_SIZE),
    [candidateId],
  );
  const persist = useCallback(
    (job: RecommendedJob, direction: SwipeDirection) => swipeJob(job.id, direction),
    [],
  );

  const feed = useSwipeQueue({
    fetchBatch,
    persist,
    getKey,
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Text className="text-3xl font-black text-brand">JobSwipe</Text>
        <Pressable
          onPress={feed.refresh}
          accessibilityLabel="Refresh recommendations"
          className="h-10 w-10 items-center justify-center rounded-full bg-white"
        >
          <RefreshCw size={18} color="#6B7280" />
        </Pressable>
      </View>

      {feed.error ? (
        <Pressable onPress={feed.clearError} className="mx-5 mb-2 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{feed.error}</Text>
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
            renderFront={(job) => <JobCardFront job={job} mySkills={profile?.skills} />}
            renderBack={(job) => <JobCardBack job={job} />}
            onSwipe={feed.swipe}
            emptyComponent={<EmptyFeed onRefresh={feed.refresh} />}
          />
        )}
      </View>

      {feed.items.length > 0 && (
        <View className="flex-row items-center justify-center gap-8 pb-6 pt-3">
          <ActionButton
            label="Pass"
            onPress={() => deck.current?.swipe('left')}
            icon={<X size={32} color="#EF4444" strokeWidth={3} />}
          />
          <ActionButton
            label="Apply"
            onPress={() => deck.current?.swipe('right')}
            icon={<Heart size={30} color="#22C55E" fill="#22C55E" />}
          />
        </View>
      )}

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
