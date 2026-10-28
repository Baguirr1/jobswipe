import { router, useFocusEffect } from 'expo-router';
import { ExternalLink, HeartHandshake } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { Avatar, CompanyLogo } from '@/components/ui';
import { getMatches, getSavedJobs } from '@/lib/api';
import { sourceLabel, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MatchWithDetails, SavedJob } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export default function MatchesScreen() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [saved, setSaved] = useState<SavedJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const isRecruiter = profile?.role === 'recruiter';
  const candidateId = isRecruiter ? undefined : profile?.id;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextMatches, nextSaved] = await Promise.all([
        getMatches(),
        candidateId ? getSavedJobs(candidateId) : Promise.resolve([]),
      ]);
      setMatches(nextMatches);
      setSaved(nextSaved);
    } catch (e) {
      console.warn('Failed to load matches', e);
    } finally {
      setRefreshing(false);
    }
  }, [candidateId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // New matches appear live (e.g. a recruiter swipes right on you while you browse).
  useEffect(() => {
    if (!profile) return;
    const column = isRecruiter ? 'recruiter_id' : 'candidate_id';
    const channel = supabase
      .channel(`matches:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `${column}=eq.${profile.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, isRecruiter, load]);

  return (
    <FlatList
      className="flex-1 bg-gray-50"
      contentContainerClassName="flex-grow p-4"
      data={matches}
      keyExtractor={(m) => m.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListHeaderComponent={
        saved.length > 0 ? (
          <View className="mb-5">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Saved jobs · apply on the company site
            </Text>
            {saved.map(({ job }) => (
              <SavedJobRow key={job.id} job={job} />
            ))}
            {matches.length > 0 ? (
              <Text className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Matches
              </Text>
            ) : null}
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        refreshing || saved.length > 0 ? undefined : (
          <View className="flex-1 items-center justify-center px-8">
            <HeartHandshake size={56} color="#C4B5FD" />
            <Text className="mt-4 text-center text-lg font-semibold text-gray-800">No matches yet</Text>
            <Text className="mt-1 text-center text-gray-500">
              {isRecruiter
                ? 'Review applicants on your jobs and swipe right on the ones you like.'
                : 'Keep swiping — when a recruiter likes you back, you can chat here.'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const other = isRecruiter ? item.candidate : item.recruiter;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: item.id } })}
            className="flex-row items-center rounded-2xl bg-white p-4 active:opacity-80"
          >
            {isRecruiter ? (
              <Avatar uri={other.avatar_url} name={other.full_name} size={52} />
            ) : (
              <CompanyLogo uri={item.job.company_logo} name={item.job.company_name} size={52} />
            )}
            <View className="ml-4 flex-1">
              <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
                {isRecruiter ? other.full_name ?? 'Candidate' : item.job.company_name}
              </Text>
              <Text className="text-sm text-gray-500" numberOfLines={1}>
                {item.job.title}
                {!isRecruiter && other.full_name ? ` · ${other.full_name}` : ''}
              </Text>
            </View>
            <Text className="text-xs text-gray-400">{timeAgo(item.created_at)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

function SavedJobRow({ job }: { job: SavedJob['job'] }) {
  const where = job.is_remote ? 'Remote' : job.location;
  return (
    <View className="mb-3 flex-row items-center rounded-2xl bg-white p-4">
      <CompanyLogo uri={job.company_logo} name={job.company_name} size={44} />
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
          {job.title}
        </Text>
        <Text className="text-sm text-gray-500" numberOfLines={1}>
          {job.company_name}
          {where ? ` · ${where}` : ''}
        </Text>
        <Text className="text-xs text-gray-400">{sourceLabel(job.source)}</Text>
      </View>
      {job.apply_url ? (
        <Pressable
          onPress={() => Linking.openURL(job.apply_url!)}
          accessibilityRole="link"
          accessibilityLabel={`Apply to ${job.title} at ${job.company_name}`}
          className="ml-2 flex-row items-center rounded-full bg-brand px-3 py-2 active:bg-brand-dark"
        >
          <Text className="mr-1 text-sm font-semibold text-white">Apply</Text>
          <ExternalLink size={14} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}
