import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, profile, profileError, loading, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    );
  }

  // A failed load (e.g. offline) is not the same as "not onboarded yet":
  // offer a retry instead of dropping a returning user into onboarding.
  if (session && !profile && profileError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-lg font-semibold text-gray-800">
          Couldn’t load your profile
        </Text>
        <Text className="mt-1 text-center text-gray-500">{profileError}</Text>
        <Button title="Try again" onPress={refreshProfile} className="mt-6 self-stretch" />
        <Button title="Sign out" variant="ghost" onPress={signOut} className="mt-2 self-stretch" />
      </View>
    );
  }

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[matchId]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="job/edit"
          options={{ headerShown: true, title: 'Job listing', presentation: 'modal' }}
        />
        <Stack.Screen name="review/[jobId]" options={{ headerShown: true, title: 'Applicants' }} />
        <Stack.Screen name="insights/[jobId]" options={{ headerShown: true, title: 'Insights' }} />
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: 'Edit profile' }} />
      </Stack.Protected>
    </Stack>
  );
}
