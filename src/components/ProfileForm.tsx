import { FileUp, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SalaryPresets } from '@/components/SalaryPresets';
import { SkillSelector } from '@/components/SkillSelector';
import { Button, Field } from '@/components/ui';
import { type ProfileDraft, useProfileDraft } from '@/hooks/useProfileDraft';
import type { Profile } from '@/lib/types';

/** Single-page profile editor (Edit profile, and recruiter onboarding). */
export function ProfileForm({ profile, submitLabel, onSaved }: {
  profile: Profile;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const draft = useProfileDraft(profile);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="px-6 pb-12 pt-4" keyboardShouldPersistTaps="handled">
        <Field label="Full name" value={draft.fullName} onChangeText={draft.setFullName} />

        {draft.isCandidate ? (
          <>
            <Field
              label="Target job title"
              placeholder="e.g. Senior React Native Engineer"
              value={draft.targetTitle}
              onChangeText={draft.setTargetTitle}
            />

            <Section title="Your skills">
              <SkillSelector value={draft.skills} onChange={draft.setSkills} />
            </Section>

            <Section title="Desired salary">
              <SalaryPresets min={draft.salaryMin} max={draft.salaryMax} onChange={draft.setSalary} />
            </Section>

            <Field
              label="Short bio"
              placeholder="What are you great at?"
              value={draft.bio}
              onChangeText={draft.setBio}
              multiline
              maxLength={500}
            />

            <ResumeField draft={draft} />
          </>
        ) : (
          <Field
            label="About you / your team"
            placeholder="What kind of people are you hiring?"
            value={draft.bio}
            onChangeText={draft.setBio}
            multiline
          />
        )}

        {draft.firstProblem ? (
          <Text className="mb-3 text-center text-sm text-gray-500">{draft.firstProblem}</Text>
        ) : null}
        <Button
          title={submitLabel}
          onPress={() => draft.save(onSaved)}
          loading={draft.saving}
          disabled={!!draft.firstProblem}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Upload (PDF, Word, .txt) or paste a resume; the extracted text stays editable. */
export function ResumeField({ draft }: { draft: ProfileDraft }) {
  return (
    <View>
      <Pressable
        onPress={draft.uploadResume}
        disabled={draft.uploading}
        accessibilityRole="button"
        accessibilityLabel="Upload resume"
        className="mb-1.5 min-h-14 flex-row items-center justify-center rounded-2xl border-2 border-dashed border-brand/40 bg-brand-light px-4 py-3 active:opacity-80"
      >
        {draft.uploading ? (
          <ActivityIndicator color="#6C47FF" />
        ) : (
          <>
            <FileUp size={18} color="#6C47FF" />
            <Text className="ml-2 text-base font-semibold text-brand">
              {draft.resume ? 'Replace resume' : 'Upload resume'}
            </Text>
          </>
        )}
      </Pressable>
      <Text className="mb-4 text-center text-xs text-gray-500">PDF, Word (.docx) or .txt, up to 5 MB</Text>

      <Field
        label={draft.resume ? 'Resume text (check it looks right)' : 'Or paste your resume'}
        placeholder="Paste your resume text here"
        value={draft.resume}
        onChangeText={draft.setResume}
        multiline
      />
      <View className="mb-6 flex-row items-start rounded-xl bg-brand-light p-3">
        <Sparkles size={16} color="#6C47FF" />
        <Text className="ml-2 flex-1 text-xs text-brand">
          We compare your title, skills, bio and resume with each job’s description to show you
          the best fits first.
        </Text>
      </View>
    </View>
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
