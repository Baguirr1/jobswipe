import { router } from 'expo-router';
import { View } from 'react-native';

import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileEdit() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <View className="flex-1 bg-gray-50">
      <ProfileForm profile={profile} submitLabel="Save changes" onSaved={() => router.back()} />
    </View>
  );
}
