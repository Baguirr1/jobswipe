import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/ProfileForm';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export default function Onboarding() {
  const { profile, signOut } = useAuth();

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-base text-gray-600">
          We couldn’t load your profile. Make sure the database migration has been applied.
        </Text>
        <Button title="Sign out" variant="ghost" onPress={signOut} className="mt-4" />
      </SafeAreaView>
    );
  }

  const isCandidate = profile.role === 'candidate';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-6 pb-2 pt-4">
        <Text className="text-3xl font-extrabold text-gray-900">
          {isCandidate ? "Let's find your match" : 'Set up your recruiter profile'}
        </Text>
        <Text className="mt-1 text-base text-gray-500">
          {isCandidate
            ? 'Tell us what you do and what you want. We handle the ranking.'
            : 'Candidates will see this when you match.'}
        </Text>
      </View>
      <ProfileForm profile={profile} submitLabel={isCandidate ? 'Start swiping' : 'Continue'} />
    </SafeAreaView>
  );
}
