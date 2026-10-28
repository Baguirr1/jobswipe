import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6C47FF" />
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
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: 'Edit profile' }} />
      </Stack.Protected>
    </Stack>
  );
}
