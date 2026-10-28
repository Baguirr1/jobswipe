import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Avatar, Button, Tag } from '@/components/ui';
import { formatSalaryRange } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const isCandidate = profile.role === 'candidate';

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-6">
      <View className="items-center">
        <Avatar uri={profile.avatar_url} name={profile.full_name} size={96} />
        <Text className="mt-4 text-2xl font-bold text-gray-900">{profile.full_name}</Text>
        <Text className="mt-1 text-base text-gray-500">
          {isCandidate ? profile.target_title ?? 'Job seeker' : 'Recruiter'}
        </Text>
      </View>

      <View className="mt-8 rounded-2xl bg-white p-5">
        {isCandidate && (
          <>
            <Label>Desired salary</Label>
            <Text className="mb-4 text-base text-gray-900">
              {formatSalaryRange(profile.target_salary_min, profile.target_salary_max)}
            </Text>
            <Label>Skills</Label>
            <View className="mb-2 flex-row flex-wrap">
              {profile.skills.map((s) => (
                <Tag key={s} label={s} highlighted />
              ))}
            </View>
          </>
        )}
        <Label>Bio</Label>
        <Text className="text-base leading-6 text-gray-700">{profile.bio || '—'}</Text>
      </View>

      <Button title="Edit profile" variant="secondary" onPress={() => router.push('/profile-edit')} className="mt-6" />
      <Button title="Sign out" variant="ghost" onPress={signOut} className="mt-2" />
    </ScrollView>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{children}</Text>
  );
}
