import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm, ResumeField } from '@/components/ProfileForm';
import { SalaryPresets } from '@/components/SalaryPresets';
import { SkillSelector } from '@/components/SkillSelector';
import { Button, Field } from '@/components/ui';
import { type ProfileDraft, suggestSkills, useProfileDraft } from '@/hooks/useProfileDraft';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { usePalette } from '@/providers/ThemeProvider';

export default function Onboarding() {
  const { profile, signOut } = useAuth();

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface px-6">
        <Text className="text-center text-base text-gray-600">
          We couldn’t load your profile. Make sure the database migration has been applied.
        </Text>
        <Button title="Sign out" variant="ghost" onPress={signOut} className="mt-4" />
      </SafeAreaView>
    );
  }

  // Recruiters only fill in a name and a short intro, so one page is enough.
  if (profile.role !== 'candidate') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
        <View className="px-6 pb-2 pt-4">
          <Text className="text-3xl font-extrabold text-gray-900">Set up your recruiter profile</Text>
          <Text className="mt-1 text-base text-gray-500">Candidates will see this when you match.</Text>
        </View>
        <ProfileForm profile={profile} submitLabel="Continue" />
      </SafeAreaView>
    );
  }

  return <CandidateWizard profile={profile} />;
}

interface Step {
  title: string;
  subtitle: string;
  /** Hint shown above Next while the step is incomplete. */
  problem: (d: ProfileDraft) => string | null;
  render: (d: ProfileDraft) => React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Let’s find your match',
    subtitle: 'Start with who you are and the job you want next.',
    problem: (d) => d.problems.name ?? d.problems.title,
    render: (d) => (
      <>
        <Field label="Full name" value={d.fullName} onChangeText={d.setFullName} autoComplete="name" />
        <Field
          label="Job title you’re aiming for"
          placeholder="e.g. Data Analyst"
          value={d.targetTitle}
          onChangeText={d.setTargetTitle}
        />
      </>
    ),
  },
  {
    title: 'What are you good at?',
    subtitle: 'We highlight jobs that ask for these. You can change them any time.',
    problem: (d) => d.problems.skills,
    render: (d) => <SkillSelector value={d.skills} onChange={d.setSkills} />,
  },
  {
    title: 'What pay are you looking for?',
    subtitle: 'We’ll flag jobs that pay below your range.',
    problem: () => null,
    render: (d) => <SalaryPresets min={d.salaryMin} max={d.salaryMax} onChange={d.setSalary} />,
  },
  {
    title: 'Add your resume',
    subtitle: 'Optional, but it makes your matches much more accurate.',
    problem: () => null,
    render: (d) => (
      <>
        <ResumeField draft={d} />
        <Field
          label="Short bio (optional)"
          placeholder="What are you great at?"
          value={d.bio}
          onChangeText={d.setBio}
          multiline
          maxLength={500}
        />
      </>
    ),
  },
];

function CandidateWizard({ profile }: { profile: Profile }) {
  const C = usePalette();
  const draft = useProfileDraft(profile);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const problem = step.problem(draft);

  const next = () => {
    if (problem) return;
    if (isLast) return draft.save();
    // Leaving the title step with no skills yet: pre-select ones that fit the title.
    if (index === 0 && draft.skills.length === 0) draft.setSkills(suggestSkills(draft.targetTitle));
    setIndex(index + 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="w-full max-w-xl flex-1 self-center">
          <View className="px-6 pt-3">
            <View className="h-10 flex-row items-center justify-between">
              {index > 0 ? (
                <Pressable
                  onPress={() => setIndex(index - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  hitSlop={12}
                  className="-ml-2 flex-row items-center"
                >
                  <ChevronLeft size={22} color={C.ink2} />
                  <Text className="text-base font-medium text-gray-700">Back</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Text className="text-sm font-medium text-gray-500">
                Step {index + 1} of {STEPS.length}
              </Text>
            </View>
            <View
              className="mt-2 h-1.5 flex-row overflow-hidden rounded-full bg-gray-200"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}
            >
              <View className="rounded-full bg-brand" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
            </View>
            <Text accessibilityRole="header" className="mt-6 text-3xl font-extrabold text-gray-900">
              {step.title}
            </Text>
            <Text className="mb-2 mt-1 text-base text-gray-500">{step.subtitle}</Text>
          </View>

          <ScrollView
            key={index}
            className="flex-1"
            contentContainerClassName="px-6 pb-6 pt-4"
            keyboardShouldPersistTaps="handled"
          >
            {step.render(draft)}
          </ScrollView>

          <View className="border-t border-gray-100 bg-gray-50 px-6 pb-4 pt-3">
            {problem ? <Text className="mb-2 text-center text-sm text-gray-500">{problem}</Text> : null}
            <Button
              title={isLast ? 'Start swiping' : 'Next'}
              onPress={next}
              disabled={!!problem || draft.uploading}
              loading={draft.saving}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
