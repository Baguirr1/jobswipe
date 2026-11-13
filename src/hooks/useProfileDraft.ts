import { useState } from 'react';

import { updateProfile } from '@/lib/api';
import { embedMyProfile } from '@/lib/embeddings';
import { showAlert } from '@/lib/notify';
import { pickResumeText } from '@/lib/resume';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Profile form state shared by the onboarding wizard and the edit-profile
 * screen. `save()` writes the profile, regenerates the AI match embedding for
 * candidates, and marks the profile onboarded.
 */
export function useProfileDraft(profile: Profile) {
  const { refreshProfile } = useAuth();
  const isCandidate = profile.role === 'candidate';

  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [targetTitle, setTargetTitle] = useState(profile.target_title ?? '');
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);
  const [salaryMin, setSalaryMin] = useState(profile.target_salary_min ?? 80_000);
  const [salaryMax, setSalaryMax] = useState(profile.target_salary_max ?? 100_000);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [resume, setResume] = useState(profile.resume_text ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const setSalary = (lo: number, hi: number) => {
    setSalaryMin(lo);
    setSalaryMax(hi);
  };

  const uploadResume = async () => {
    setUploading(true);
    try {
      const text = await pickResumeText();
      if (text != null) setResume(text);
    } catch (e) {
      showAlert('Couldn’t read that file', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /** First thing still missing, phrased as a hint; null when the profile can be saved. */
  const problems = {
    name: fullName.trim() ? null : 'Add your name to continue.',
    title: !isCandidate || targetTitle.trim() ? null : 'Add the job title you’re aiming for.',
    skills: !isCandidate || skills.length > 0 ? null : 'Pick at least one skill to continue.',
  };
  const firstProblem = problems.name ?? problems.title ?? problems.skills;

  const save = async (onSaved?: () => void) => {
    if (firstProblem) return;
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
          showAlert(
            'Profile saved',
            "We couldn't work out your job matches yet, so jobs will show newest-first for now.",
          );
        }
      }

      // Mark onboarded last so the router only moves on once everything is saved.
      if (!profile.onboarded) await updateProfile(profile.id, { onboarded: true });
      await refreshProfile();
      onSaved?.();
    } catch (e) {
      showAlert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return {
    isCandidate,
    fullName, setFullName,
    targetTitle, setTargetTitle,
    skills, setSkills,
    salaryMin, salaryMax, setSalary,
    bio, setBio,
    resume, setResume,
    uploadResume, uploading,
    problems, firstProblem,
    save, saving,
  };
}

export type ProfileDraft = ReturnType<typeof useProfileDraft>;

// Keyword → skills to pre-select after the user types a target title.
const TITLE_SKILLS: [RegExp, string[]][] = [
  [/data (analyst|analytics)|business intelligence|\bbi\b/i, ['SQL', 'Python', 'Data Analysis']],
  [/data scien|machine learning|\bml\b|\bai\b/i, ['Python', 'Machine Learning', 'SQL']],
  [/data engineer/i, ['Python', 'SQL', 'AWS']],
  [/react native|mobile|ios|android/i, ['React Native', 'TypeScript', 'JavaScript']],
  [/front.?end|web dev|react/i, ['React', 'TypeScript', 'JavaScript']],
  [/back.?end|api/i, ['Node.js', 'SQL', 'PostgreSQL']],
  [/full.?stack/i, ['React', 'Node.js', 'TypeScript', 'SQL']],
  [/devops|sre|site reliability|platform|cloud/i, ['DevOps', 'Docker', 'Kubernetes', 'AWS']],
  [/design|ux|ui\b/i, ['Figma', 'UI/UX']],
  [/product manag/i, ['Product Management', 'Data Analysis']],
];

/** Skills that commonly go with a job title, for pre-selecting in onboarding. */
export function suggestSkills(title: string): string[] {
  const out = new Set<string>();
  for (const [pattern, skills] of TITLE_SKILLS) {
    if (pattern.test(title)) skills.forEach((s) => out.add(s));
  }
  return [...out].slice(0, 4);
}
