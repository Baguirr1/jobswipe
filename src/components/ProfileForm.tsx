import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { FileText, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SalaryRange } from '@/components/SalaryRange';
import { SkillSelector } from '@/components/SkillSelector';
import { Button, Field } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { embedMyProfile } from '@/lib/embeddings';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

/** Shared by onboarding and "edit profile". Saves, then regenerates the embedding. */
export function ProfileForm({ profile, submitLabel, onSaved }: {
  profile: Profile;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const { refreshProfile } = useAuth();
  const isCandidate = profile.role === 'candidate';

  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [targetTitle, setTargetTitle] = useState(profile.target_title ?? '');
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);
  const [salaryMin, setSalaryMin] = useState(profile.target_salary_min ?? 80_000);
  const [salaryMax, setSalaryMax] = useState(profile.target_salary_max ?? 140_000);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [resume, setResume] = useState(profile.resume_text ?? '');
  const [saving, setSaving] = useState(false);

  const pickResume = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/markdown'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    try {
      const text = await new File(result.assets[0].uri).text();
      setResume(text.slice(0, 20_000));
    } catch (e) {
      Alert.alert('Could not read file', (e as Error).message);
    }
  };

  const save = async () => {
    if (!fullName.trim()) return Alert.alert('Add your name');
    if (isCandidate && (!targetTitle.trim() || skills.length === 0)) {
      return Alert.alert('Almost there', 'Add a target job title and at least one skill.');
    }
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        ...(isCandidate && {
          target_title: targetTitle.trim(),
          skills,
          target_salary_min: salaryMin,
          target_salary_max: salaryMax,
          resume_text: resume.trim() || null,
        }),
      });

      if (isCandidate) {
        try {
          await embedMyProfile();
        } catch (e) {
          // Non-fatal: the feed falls back to newest-first without an embedding.
          console.warn('Embedding failed', e);
          Alert.alert(
            'Profile saved',
            "We couldn't generate your AI match profile yet, so jobs will show newest-first for now.",
          );
        }
      }

      // Mark onboarded last so the router only moves on once everything is saved.
      if (!profile.onboarded) await updateProfile(profile.id, { onboarded: true });
      await refreshProfile();
      onSaved?.();
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="px-6 pb-12 pt-4" keyboardShouldPersistTaps="handled">
        <Field label="Full name" value={fullName} onChangeText={setFullName} />

        {isCandidate ? (
          <>
            <Field
              label="Target job title"
              placeholder="e.g. Senior React Native Engineer"
              value={targetTitle}
              onChangeText={setTargetTitle}
            />

            <Section title="Your skills">
              <SkillSelector value={skills} onChange={setSkills} />
            </Section>

            <Section title="Desired salary">
              <SalaryRange
                min={salaryMin}
                max={salaryMax}
                onChange={(lo, hi) => {
                  setSalaryMin(lo);
                  setSalaryMax(hi);
                }}
              />
            </Section>

            <Field
              label="Short bio"
              placeholder="What are you great at?"
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={500}
            />

            <View className="mb-1.5 flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-700">Resume</Text>
              <Pressable onPress={pickResume} className="flex-row items-center" accessibilityRole="button">
                <FileText size={16} color="#6C47FF" />
                <Text className="ml-1 text-sm font-semibold text-brand">Upload .txt</Text>
              </Pressable>
            </View>
            <Field
              placeholder="Paste your resume text here"
              value={resume}
              onChangeText={setResume}
              multiline
            />
            <View className="mb-6 flex-row items-start rounded-xl bg-brand-light p-3">
              <Sparkles size={16} color="#6C47FF" />
              <Text className="ml-2 flex-1 text-xs text-brand">
                Your title, skills, bio and resume are turned into an AI embedding that ranks jobs by
                how well they fit you.
              </Text>
            </View>
          </>
        ) : (
          <Field
            label="About you / your team"
            placeholder="What kind of people are you hiring?"
            value={bio}
            onChangeText={setBio}
            multiline
          />
        )}

        <Button title={submitLabel} onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-3 text-sm font-medium text-gray-700">{title}</Text>
      {children}
    </View>
  );
}
