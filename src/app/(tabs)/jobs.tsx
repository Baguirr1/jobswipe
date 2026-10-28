import { router, useFocusEffect } from 'expo-router';
import { Briefcase, ChevronRight, Pencil, Plus, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Switch, Text, View } from 'react-native';

import { CompanyLogo } from '@/components/ui';
import { getApplicantCounts, getMyJobs, setJobActive } from '@/lib/api';
import { formatSalaryRange } from '@/lib/format';
import type { Job } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export default function RecruiterJobsScreen() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setRefreshing(true);
    try {
      const mine = await getMyJobs(profile.id);
      setJobs(mine);
      setApplicants(await getApplicantCounts(mine.map((j) => j.id)));
    } catch (e) {
      Alert.alert('Could not load jobs', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleActive = async (job: Job, value: boolean) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, is_active: value } : j)));
    try {
      await setJobActive(job.id, value);
    } catch (e) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, is_active: !value } : j)));
      Alert.alert('Update failed', (e as Error).message);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerClassName="flex-grow p-4 pb-28"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          refreshing ? undefined : (
            <View className="flex-1 items-center justify-center px-8">
              <Briefcase size={56} color="#C4B5FD" />
              <Text className="mt-4 text-lg font-semibold text-gray-800">No job listings yet</Text>
              <Text className="mt-1 text-center text-gray-500">
                Post your first role and it’ll start appearing in candidates’ feeds.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const count = applicants[item.id] ?? 0;
          return (
            <View className="rounded-2xl bg-white p-4">
              <View className="flex-row items-center">
                <CompanyLogo uri={item.company_logo} name={item.company_name} size={44} />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-sm text-gray-500" numberOfLines={1}>
                    {formatSalaryRange(item.salary_min, item.salary_max)} ·{' '}
                    {item.is_remote ? 'Remote' : item.location ?? 'On-site'}
                  </Text>
                </View>
                <Switch
                  value={item.is_active}
                  onValueChange={(v) => toggleActive(item, v)}
                  trackColor={{ true: '#6C47FF' }}
                  accessibilityLabel={item.is_active ? 'Deactivate listing' : 'Activate listing'}
                />
              </View>
              <View className="mt-4 flex-row">
                <Pressable
                  onPress={() => router.push({ pathname: '/job/edit', params: { id: item.id } })}
                  className="mr-2 flex-row items-center rounded-xl bg-gray-100 px-4 py-2.5"
                >
                  <Pencil size={14} color="#374151" />
                  <Text className="ml-1.5 text-sm font-semibold text-gray-700">Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/review/[jobId]', params: { jobId: item.id } })}
                  className="flex-1 flex-row items-center justify-between rounded-xl bg-brand-light px-4 py-2.5"
                >
                  <View className="flex-row items-center">
                    <Users size={16} color="#6C47FF" />
                    <Text className="ml-1.5 text-sm font-semibold text-brand">
                      Review applicants ({count})
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#6C47FF" />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      <Pressable
        onPress={() => router.push('/job/edit')}
        accessibilityLabel="Post a new job"
        className="absolute bottom-6 right-6 h-16 w-16 items-center justify-center rounded-full bg-brand shadow-lg active:bg-brand-dark"
      >
        <Plus size={30} color="#fff" />
      </Pressable>
    </View>
  );
}
