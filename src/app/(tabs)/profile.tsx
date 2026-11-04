import { router } from 'expo-router';
import { Banknote, Pencil, Sparkles, UserRound } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SwipeBackground } from '@/components/SwipeBackground';
import { Avatar, Button, Tag } from '@/components/ui';
import { formatSalaryRange } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const isCandidate = profile.role === 'candidate';

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-5 pb-10" contentContainerStyle={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
      <View className="mb-5 overflow-hidden rounded-3xl border border-purple-100 bg-white">
        <View className="h-28 overflow-hidden bg-brand-light">
          <View className="absolute inset-0 opacity-60"><SwipeBackground /></View>
        </View>
        <View className="px-5 pb-6">
          <View className="-mt-10 flex-row items-end justify-between gap-3">
            <View className="rounded-full border-4 border-white bg-white">
              <Avatar uri={profile.avatar_url} name={profile.full_name} size={88} />
            </View>
            <Pressable onPress={() => router.push('/profile-edit')} accessibilityRole="button" accessibilityLabel="Edit profile" className="min-h-12 flex-row items-center rounded-2xl bg-brand-light px-4 py-3">
              <Pencil size={15} color="#4B2BD9" /><Text className="ml-2 text-sm font-semibold text-brand-dark">Edit profile</Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" className="mt-4 text-2xl font-extrabold tracking-tight text-gray-900">{profile.full_name || 'Your profile'}</Text>
          <Text className="mt-1 text-base text-gray-600">{isCandidate ? profile.target_title || 'Job seeker' : 'Recruiter'}</Text>
          <View className="mt-4 self-start rounded-full bg-brand-light px-3 py-1.5">
            <Text className="text-xs font-semibold text-brand-dark">{isCandidate ? 'Ready for the next move' : 'Finding great talent'}</Text>
          </View>
        </View>
      </View>

      <ProfileSection title="About" icon={<UserRound size={18} color="#6C47FF" />}>
        <Text className="text-base leading-6 text-gray-700">{profile.bio || (isCandidate ? 'Tell recruiters a little about yourself and what you’d like to do next.' : 'Introduce yourself and the people you’re looking to hire.')}</Text>
      </ProfileSection>

      {isCandidate ? <>
        <ProfileSection title="Skills" icon={<Sparkles size={18} color="#6C47FF" />}>
          {profile.skills.length ? <View className="flex-row flex-wrap">{profile.skills.map((skill) => <Tag key={skill} label={skill} highlighted />)}</View> : <Text className="text-sm leading-5 text-gray-600">Add your skills to help find roles that fit you.</Text>}
        </ProfileSection>
        <ProfileSection title="Job preferences" icon={<Banknote size={18} color="#6C47FF" />}>
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">Target role</Text>
          <Text className="mb-5 mt-1 text-base font-semibold text-gray-900">{profile.target_title || 'Add your preferred role'}</Text>
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">Desired salary</Text>
          <Text className="mt-1 text-xl font-bold text-gray-900">{formatSalaryRange(profile.target_salary_min, profile.target_salary_max)}</Text>
        </ProfileSection>
      </> : null}
      <Button title="Sign out" variant="ghost" onPress={signOut} className="mt-2" />
    </ScrollView>
  );
}

function ProfileSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <View className="mb-4 rounded-3xl border border-purple-100 bg-white p-5">
      <View className="mb-4 flex-row items-center">
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-brand-light">{icon}</View>
        <Text accessibilityRole="header" className="text-base font-bold text-gray-900">{title}</Text>
      </View>
      {children}
    </View>
  );
}
