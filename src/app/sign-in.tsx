import { Briefcase, UserSearch } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [role, setRole] = useState<UserRole>('candidate');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || password.length < 6) {
      Alert.alert('Check your details', 'Enter an email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Read by the handle_new_user() trigger to create the profile row.
          options: { data: { role, full_name: fullName.trim() || null } },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Confirm your email', 'We sent you a link to finish signing up.');
        }
      }
    } catch (e) {
      Alert.alert('Authentication failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
          <Text className="text-5xl font-black text-brand">JobSwipe</Text>
          <Text className="mb-10 mt-2 text-lg text-gray-500">Swipe right on your next job.</Text>

          {mode === 'sign-up' && (
            <>
              <Text className="mb-2 text-sm font-medium text-gray-700">I am a…</Text>
              <View className="mb-5 flex-row">
                <RoleOption
                  label="Job seeker"
                  icon={<UserSearch size={22} color={role === 'candidate' ? '#fff' : '#6C47FF'} />}
                  selected={role === 'candidate'}
                  onPress={() => setRole('candidate')}
                />
                <View className="w-3" />
                <RoleOption
                  label="Recruiter"
                  icon={<Briefcase size={22} color={role === 'recruiter' ? '#fff' : '#6C47FF'} />}
                  selected={role === 'recruiter'}
                  onPress={() => setRole('recruiter')}
                />
              </View>
              <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
            </>
          )}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          />

          <Button title={mode === 'sign-in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} className="mt-2" />
          <Button
            title={mode === 'sign-in' ? "New here? Create an account" : 'Have an account? Sign in'}
            variant="ghost"
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
            className="mt-2"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleOption({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 items-center rounded-2xl border-2 py-4 ${
        selected ? 'border-brand bg-brand' : 'border-brand-light bg-white'
      }`}
    >
      {icon}
      <Text className={`mt-1.5 font-semibold ${selected ? 'text-white' : 'text-brand'}`}>{label}</Text>
    </Pressable>
  );
}
