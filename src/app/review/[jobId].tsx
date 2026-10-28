import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Heart, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CandidateCardBack, CandidateCardFront } from '@/components/CandidateCard';
import { EmptyFeed } from '@/components/EmptyFeed';
import { MatchModal } from '@/components/MatchModal';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { getCandidatesForJob, getJob, swipeCandidate } from '@/lib/api';
import type { CandidateForJob, Job, SwipeDirection } from '@/lib/types';

const getKey = (c: CandidateForJob) => c.id;

export default function ReviewApplicantsScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const deck = useRef<SwipeDeckHandle>(null);

  useEffect(() => {
    getJob(jobId).then(setJob).catch((e) => console.warn(e));
  }, [jobId]);

  const fetchBatch = useCallback(() => getCandidatesForJob(jobId), [jobId]);
  const persist = useCallback(
    (c: CandidateForJob, direction: SwipeDirection) => swipeCandidate(jobId, c.id, direction),
    [jobId],
  );
  const queue = useSwipeQueue({ fetchBatch, persist, getKey });

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <Stack.Screen options={{ title: job?.title ?? 'Applicants' }} />

      {queue.error ? (
        <Pressable onPress={queue.clearError} className="mx-4 mt-3 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{queue.error}</Text>
        </Pressable>
      ) : null}

      <View className="flex-1 px-4 pt-4">
        {queue.loading && queue.items.length === 0 ? (
          <ActivityIndicator className="mt-20" size="large" color="#6C47FF" />
        ) : (
          <SwipeDeck
            ref={deck}
            data={queue.items}
            keyExtractor={getKey}
            likeLabel="YES"
            nopeLabel="NO"
            renderFront={(c) => <CandidateCardFront candidate={c} requiredSkills={job?.required_skills} />}
            renderBack={(c) => <CandidateCardBack candidate={c} />}
            onSwipe={queue.swipe}
            emptyComponent={
              <EmptyFeed
                title="You're all caught up"
                subtitle="New applicants will show up here as candidates swipe right on this job."
                onRefresh={queue.refresh}
              />
            }
          />
        )}
      </View>

      {queue.items.length > 0 && (
        <View className="flex-row justify-center gap-8 py-4">
          <Pressable
            onPress={() => deck.current?.swipe('left')}
            accessibilityLabel="Reject"
            className="h-16 w-16 items-center justify-center rounded-full bg-white shadow-md"
          >
            <X size={32} color="#EF4444" strokeWidth={3} />
          </Pressable>
          <Pressable
            onPress={() => deck.current?.swipe('right')}
            accessibilityLabel="Match"
            className="h-16 w-16 items-center justify-center rounded-full bg-white shadow-md"
          >
            <Heart size={30} color="#22C55E" fill="#22C55E" />
          </Pressable>
        </View>
      )}

      <MatchModal
        visible={!!queue.match}
        title={queue.match ? `You matched with ${queue.match.item.full_name ?? 'this candidate'}.` : ''}
        subtitle={job?.title ?? ''}
        onClose={queue.clearMatch}
        onChat={() => {
          const id = queue.match?.id;
          queue.clearMatch();
          if (id) router.push({ pathname: '/chat/[matchId]', params: { matchId: id } });
        }}
      />
    </SafeAreaView>
  );
}
