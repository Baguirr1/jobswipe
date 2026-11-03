import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { getJob, getJobInsights } from '@/lib/api';
import type { Job, JobInsights } from '@/lib/types';

const BAR = '#6C47FF'; // single series: one hue, values labeled in text ink
const TRACK = '#EDE9FE';

export default function JobInsightsScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [data, setData] = useState<JobInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [j, insights] = await Promise.all([getJob(jobId), getJobInsights(jobId)]);
      setJob(j);
      setData(insights);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [jobId]);

  // Same pattern as the other tabs: (re)load whenever the screen is focused.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pullToRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-12"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
    >
      <Stack.Screen options={{ title: job ? `Insights · ${job.title}` : 'Insights' }} />

      {error ? (
        <Pressable onPress={load} accessibilityRole="button" className="mb-4 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">Couldn’t load insights. Tap to try again.</Text>
        </Pressable>
      ) : null}

      {!data ? (
        error ? null : <ActivityIndicator className="mt-10" color={BAR} />
      ) : (
        <InsightsBody data={data} />
      )}
    </ScrollView>
  );
}

function InsightsBody({ data }: { data: JobInsights }) {
  const rightRate = data.views ? Math.round((data.applicants / data.views) * 100) : null;
  const dist = data.match_distribution;
  const distRows = [
    { label: '85–100%', count: dist.great },
    { label: '70–84%', count: dist.good },
    { label: '50–69%', count: dist.fair },
    { label: 'Under 50%', count: dist.low },
  ];

  return (
    <>
      <SectionTitle>Funnel</SectionTitle>
      <View className="mb-6 flex-row flex-wrap justify-between">
        <StatTile label="Candidates who saw it" value={data.views} />
        <StatTile label="Applied (swiped right)" value={data.applicants} />
        <StatTile label="Apply rate" value={rightRate == null ? '—' : `${rightRate}%`} />
        <StatTile label="Matches" value={data.matches} />
      </View>

      <SectionTitle>Applicant fit</SectionTitle>
      <View className="mb-6 rounded-2xl bg-white p-4">
        <Text className="text-3xl font-extrabold text-gray-900">
          {data.avg_match == null ? '—' : `${data.avg_match}%`}
        </Text>
        <Text className="mb-4 text-sm text-gray-500">
          Average AI match of applicants
          {data.scored < data.applicants ? ` (${data.scored} of ${data.applicants} scored so far)` : ''}
        </Text>
        <BarList rows={distRows} total={data.scored} empty="No scored applicants yet." />
      </View>

      <SectionTitle>Your required skills</SectionTitle>
      <View className="mb-6 rounded-2xl bg-white p-4">
        <Text className="mb-3 text-sm text-gray-500">How many applicants list each skill you asked for.</Text>
        <BarList
          rows={data.required_coverage.map((r) => ({ label: r.skill, count: r.count }))}
          total={data.applicants}
          empty={data.applicants ? 'This job has no required skills.' : 'No applicants yet.'}
        />
      </View>

      <SectionTitle>Top applicant skills</SectionTitle>
      <View className="mb-6 rounded-2xl bg-white p-4">
        <BarList
          rows={data.top_skills.map((r) => ({ label: r.skill, count: r.count }))}
          total={data.applicants}
          empty="No applicants yet."
        />
      </View>

      <Text className="text-xs text-gray-400">
        Reviewed {data.reviewed} of {data.applicants} applicants · {data.passes} passed on this job.
        Pull down to refresh.
      </Text>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{children}</Text>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="mb-3 w-[48.5%] rounded-2xl bg-white p-4">
      <Text className="text-2xl font-extrabold text-gray-900">{value}</Text>
      <Text className="mt-0.5 text-xs text-gray-500">{label}</Text>
    </View>
  );
}

/**
 * Horizontal bars scaled to `total` (share of applicants), each labeled with its
 * count and percentage, so the numbers are readable without the bars.
 */
function BarList({
  rows,
  total,
  empty,
}: {
  rows: { label: string; count: number }[];
  total: number;
  empty: string;
}) {
  if (!rows.length || !total) return <Text className="text-sm text-gray-400">{empty}</Text>;
  return (
    <View>
      {rows.map((r) => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <View
            key={r.label}
            className="mb-3"
            accessible
            accessibilityLabel={`${r.label}: ${r.count} of ${total}, ${pct} percent`}
          >
            <View className="mb-1 flex-row justify-between">
              <Text className="flex-1 text-sm text-gray-800" numberOfLines={1}>
                {r.label}
              </Text>
              <Text className="text-sm text-gray-500">
                {r.count} · {pct}%
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: TRACK, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(pct, r.count ? 2 : 0)}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: BAR,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
