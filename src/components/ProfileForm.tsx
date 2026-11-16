import { Check, FileUp, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SalaryPresets } from '@/components/SalaryPresets';
import { SkillSelector } from '@/components/SkillSelector';
import { Button, Field } from '@/components/ui';
import { type ProfileDraft, useProfileDraft } from '@/hooks/useProfileDraft';
import type { ResumeSuggestions } from '@/lib/resumeExtract';
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
          <ActivityIndicator color="#0B6E66" />
        ) : (
          <>
            <FileUp size={18} color="#0B6E66" />
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
      {draft.isCandidate && (draft.suggestions ? (
        <ResumeSuggestionsCard key={JSON.stringify(draft.suggestions)} draft={draft} suggestions={draft.suggestions} />
      ) : draft.resume.trim() ? (
        <Pressable
          onPress={() => draft.suggestFromResume()}
          accessibilityRole="button"
          className="mb-3 min-h-11 flex-row items-center"
        >
          <Sparkles size={16} color="#0B6E66" />
          <Text className="ml-2 flex-1 text-sm font-semibold text-brand">Fill in my profile from this resume</Text>
        </Pressable>
      ) : null)}
      {draft.isCandidate && draft.appliedNote ? (
        <Text className="mb-3 text-sm text-green-700">{draft.appliedNote}</Text>
      ) : null}
      <View className="mb-6 flex-row items-start rounded-xl bg-brand-light p-3">
        <Sparkles size={16} color="#0B6E66" />
        <Text className="ml-2 flex-1 text-xs text-brand">
          We compare your title, skills, bio and resume with each job’s description to show you
          the best fits first.
        </Text>
      </View>
    </View>
  );
}

function ResumeSuggestionsCard({ draft, suggestions }: { draft: ProfileDraft; suggestions: ResumeSuggestions }) {
  const [title, setTitle] = useState(!draft.targetTitle.trim());
  const [skills, setSkills] = useState(suggestions.skills);
  const [summary, setSummary] = useState(!draft.bio.trim());

  return (
    <View className="mb-4 rounded-2xl bg-brand-light p-4">
      <View className="mb-2 flex-row items-center">
        <Sparkles size={18} color="#0B6E66" />
        <Text className="ml-2 text-base font-semibold text-brand">From your resume</Text>
      </View>
      {suggestions.title ? (
        <SuggestionCheckbox checked={title} onPress={() => setTitle(!title)} label={`Set job title to “${suggestions.title}”`} />
      ) : null}
      {suggestions.skills.length ? (
        <View className="my-2">
          <Text className="mb-2 text-sm font-medium text-gray-700">Add skills</Text>
          <View className="flex-row flex-wrap">
            {suggestions.skills.map((skill) => {
              const checked = skills.includes(skill);
              return (
                <Pressable
                  key={skill}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={skill}
                  onPress={() => setSkills((current) => checked ? current.filter((item) => item !== skill) : [...current, skill])}
                  className={`mb-2 mr-2 min-h-11 justify-center rounded-full border px-3 py-2 ${checked ? 'border-brand bg-brand' : 'border-gray-200 bg-white'}`}
                >
                  <Text className={`text-sm ${checked ? 'text-white' : 'text-gray-700'}`}>{skill}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {suggestions.summary ? (
        <View className="mb-3">
          <SuggestionCheckbox checked={summary} onPress={() => setSummary(!summary)} label="Use your summary as your bio" />
          <Text className="ml-8 text-sm text-gray-600" numberOfLines={2}>{suggestions.summary}</Text>
        </View>
      ) : null}
      <Button title="Add to profile" onPress={() => draft.applySuggestions({ title, skills, summary })} />
      <Button title="No thanks" variant="ghost" onPress={draft.dismissSuggestions} />
    </View>
  );
}

function SuggestionCheckbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} className="min-h-11 flex-row items-center py-2">
      <View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${checked ? 'border-brand bg-brand' : 'border-gray-300 bg-white'}`}>
        {checked ? <Check size={14} color="#fff" /> : null}
      </View>
      <Text className="flex-1 text-sm text-gray-900">{label}</Text>
    </Pressable>
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
