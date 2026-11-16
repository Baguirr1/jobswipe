import { Briefcase, UserSearch } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, PasswordField } from '@/components/ui';
import { showAlert } from '@/lib/notify';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

const TITLES: Record<Mode, { heading?: string; sub?: string }> = {
  'sign-in': {},
  'sign-up': {},
  forgot: {
    heading: 'Reset your password',
    sub: 'Enter your email and we’ll send you a 6-digit code.',
  },
  reset: {
    heading: 'Check your email',
    sub: 'Enter the code we sent and choose a new password.',
  },
};

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [role, setRole] = useState<UserRole>('candidate');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, failTitle: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showAlert(failTitle, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      showAlert('Check your details', 'Enter an email and a password of at least 6 characters.');
      return;
    }
    return run(async () => {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          // Read by the handle_new_user() trigger to create the profile row.
          options: { data: { role, full_name: fullName.trim() || null } },
        });
        if (error) throw error;
        if (!data.session) {
          showAlert('Confirm your email', 'We sent you a link to finish signing up.');
        }
      }
    }, 'Authentication failed');
  };

  // Code-based reset works the same on web and native, with no deep link to
  // configure. The Supabase "Reset Password" email template must include {{ .Token }}.
  const sendCode = () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('Enter your email', 'We need it to send you a reset code.');
      return;
    }
    return run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) throw error;
      setPassword('');
      setCode('');
      setMode('reset');
    }, 'Couldn’t send the code');
  };

  const resetPassword = () => {
    if (code.trim().length < 6 || password.length < 6) {
      showAlert('Check your details', 'Enter the code from the email and a new password of at least 6 characters.');
      return;
    }
    return run(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (error) throw error;
      // verifyOtp signs the user in, which unmounts this screen; the client is
      // global, so the password update still completes.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      showAlert('Password updated', 'You’re signed in with your new password.');
    }, 'Couldn’t reset your password');
  };

  const isAuth = mode === 'sign-in' || mode === 'sign-up';
  const { heading, sub } = TITLES[mode];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md self-center">
            <Text className="text-5xl font-black text-brand">JobSwipe</Text>
            <Text className="mb-10 mt-2 text-lg text-gray-500">Swipe right on your next job.</Text>

            {heading ? (
              <>
                <Text accessibilityRole="header" className="text-2xl font-extrabold text-gray-900">
                  {heading}
                </Text>
                <Text className="mb-6 mt-1 text-base text-gray-500">{sub}</Text>
              </>
            ) : null}

            {mode === 'sign-up' && (
              <>
                <Text className="mb-2 text-sm font-medium text-gray-700">I am a…</Text>
                <View className="flex-row">
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
                <Text className="mb-5 mt-2 text-xs text-gray-500">
                  {role === 'candidate'
                    ? 'Swipe through jobs and chat with recruiters who like you back.'
                    : 'Post jobs and review the candidates who apply.'}
                </Text>
                <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
              </>
            )}

            {mode !== 'reset' ? (
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
            ) : (
              <Field
                label="6-digit code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={10}
              />
            )}

            {mode !== 'forgot' ? (
              <PasswordField
                label={mode === 'reset' ? 'New password' : 'Password'}
                value={password}
                onChangeText={setPassword}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                onSubmitEditing={mode === 'reset' ? resetPassword : submit}
              />
            ) : null}

            {mode === 'sign-in' ? (
              <Pressable
                onPress={() => setMode('forgot')}
                accessibilityRole="button"
                hitSlop={8}
                className="-mt-1 mb-4 self-end"
              >
                <Text className="text-sm font-semibold text-brand">Forgot password?</Text>
              </Pressable>
            ) : null}

            {isAuth ? (
              <>
                <Button
                  title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
                  onPress={submit}
                  loading={busy}
                  className="mt-2"
                />
                <Button
                  title={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
                  variant="ghost"
                  onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                  className="mt-2"
                />
              </>
            ) : (
              <>
                <Button
                  title={mode === 'forgot' ? 'Send code' : 'Set new password'}
                  onPress={mode === 'forgot' ? sendCode : resetPassword}
                  loading={busy}
                  className="mt-2"
                />
                {mode === 'reset' ? (
                  <Button title="Resend code" variant="ghost" onPress={sendCode} className="mt-2" />
                ) : null}
                <Button
                  title="Back to sign in"
                  variant="ghost"
                  onPress={() => setMode('sign-in')}
                  className="mt-2"
                />
              </>
            )}
          </View>
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
