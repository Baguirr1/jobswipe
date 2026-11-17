import '../global.css';

import { router, Stack, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ThemeProvider, usePalette, useTheme } from '@/providers/ThemeProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  return <StatusBar style={useTheme().scheme === 'dark' ? 'light' : 'dark'} />;
}

function RootNavigator() {
  const C = usePalette();
  const { session, profile, profileError, loading, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // A failed load (e.g. offline) is not the same as "not onboarded yet":
  // offer a retry instead of dropping a returning user into onboarding.
  if (session && !profile && profileError) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
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
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: C.canvas },
        contentStyle: { backgroundColor: C.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', color: C.ink },
        headerTintColor: C.ink,
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[matchId]"
          options={{ headerShown: true, title: '', headerLeft: () => <BackButton fallback="/matches" label="Matches" /> }}
        />
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

/**
 * Back button drawn as a vector icon (the default header arrow is an image that
 * may not load on the web). With no history to go back to, e.g. a chat opened
 * from a link, it goes to `fallback` instead.
 */
function BackButton({ fallback = '/', label = 'Back' }: { fallback?: Href; label?: string }) {
  const C = usePalette();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={10}
      className="-ml-1 mr-2 flex-row items-center rounded-full py-1 pl-1 pr-2 active:opacity-60"
    >
      <ChevronLeft size={24} color={C.accent} strokeWidth={2.4} />
      <Text className="text-[15px] font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}
