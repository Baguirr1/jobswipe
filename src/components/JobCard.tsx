import {
  MapPin,
  RotateCw,
  Sparkles,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { SwipeBackground } from '@/components/SwipeBackground';
import { CompanyLogo, Tag } from '@/components/ui';
import { formatSalaryRange, sourceLabel } from '@/lib/format';
import { explainMatch, summarizeMatch } from '@/lib/matchReasons';
import type { Profile, RecommendedJob } from '@/lib/types';

interface Props {
  job: RecommendedJob;
  /** The candidate: their skills are highlighted and compared with the job's. */
  me?: Pick<Profile, 'skills' | 'target_salary_min' | 'target_salary_max'> | null;
}

export function JobCardFront({ job, me }: Props) {
  const mine = new Set((me?.skills ?? []).map((s) => s.toLowerCase()));
  const summary = summarizeMatch(explainMatch(job, me));
  return (
    <View className="flex-1">
      <SwipeBackground dark />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start justify-between">
          <CompanyLogo uri={job.company_logo} name={job.company_name} size={56} />
          {job.match_score_percentage != null ? (
            <View className="rounded-full bg-white/15 px-3 py-2">
              <Text className="text-xs font-bold text-white">{Math.round(job.match_score_percentage)}% match</Text>
            </View>
          ) : null}
        </View>
        <View className="min-h-8 flex-1" />
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-purple-200">YOUR NEXT MOVE</Text>
        <Text className="text-3xl font-extrabold leading-9 text-white" numberOfLines={3}>{job.title}</Text>
        <Text className="mt-2 text-lg font-medium text-purple-100" numberOfLines={1}>{job.company_name}</Text>
        <View className="mt-4 flex-row items-center">
          <MapPin size={15} color="#DDD6FE" />
          <Text className="ml-2 flex-1 text-sm text-purple-100" numberOfLines={2}>
            {[job.location, job.is_remote ? 'Remote' : 'On-site'].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text className="mt-4 text-2xl font-bold text-white">{formatSalaryRange(job.salary_min, job.salary_max)}</Text>
        {summary ? (
          <View className="mt-3 flex-row items-center">
            <Sparkles size={14} color="#DDD6FE" />
            <Text className="ml-2 flex-1 text-sm text-purple-100" numberOfLines={2}>{summary}</Text>
          </View>
        ) : null}
        <View className="mt-5 flex-row flex-wrap">
          {job.required_skills.slice(0, 3).map((skill) => (
            <View key={skill} className={mine.has(skill.toLowerCase()) ? 'mb-2 mr-2 rounded-full border border-purple-300/50 bg-purple-300/20 px-3 py-1.5' : 'mb-2 mr-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5'}>
              <Text className="text-xs font-medium text-white">{skill}</Text>
            </View>
          ))}
          {job.required_skills.length > 3 ? <Text className="py-1.5 text-xs text-purple-200">+{job.required_skills.length - 3} more</Text> : null}
        </View>
        <View className="mt-3 flex-row items-center justify-between border-t border-white/15 pt-4">
          <Text className="text-xs text-purple-200">{job.source !== 'jobswipe' ? 'Save now · apply on their site' : 'Find your next opportunity'}</Text>
          <RotateCw size={15} color="#DDD6FE" />
        </View>
        <Text className="mt-3 text-center text-xs text-purple-200">Tap for details</Text>
      </ScrollView>
    </View>
  );
}

export function JobCardBack({ job, me }: Props) {
  const attribution = sourceLabel(job.source);
  const reasons = explainMatch(job, me);
  return (
    <View className="flex-1 p-6">
      <View className="flex-row items-center">
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={40} />
        <View className="ml-3 flex-1">
          <Text className="text-lg font-bold text-gray-900" numberOfLines={1}>
            {job.title}
          </Text>
          <Text className="text-sm text-gray-500">{job.company_name}</Text>
        </View>
      </View>
      <ScrollView className="mt-4 flex-1" showsVerticalScrollIndicator={false}>
        <WhyThisMatch score={job.match_score_percentage} reasons={reasons} />
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          About the role
        </Text>
        <Text className="text-base leading-6 text-gray-700">
          {job.description || 'No description provided.'}
        </Text>
        {attribution ? (
          <Text className="pb-6 text-sm text-gray-500">
            {attribution}. Swipe right to save it, then apply from the Saved tab.
          </Text>
        ) : null}
      </ScrollView>
      <Text className="pt-2 text-center text-xs text-gray-400">Tap to flip back</Text>
    </View>
  );
}

function WhyThisMatch({
  score,
  reasons,
}: {
  score: number | null;
  reasons: ReturnType<typeof explainMatch>;
}) {
  const salaryText = {
    fits: 'The listed pay reaches your target salary.',
    below: 'The listed pay is below your target salary.',
    unknown: null,
  }[reasons.salary];
  return (
    <View className="mb-6 rounded-2xl bg-brand-light p-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand">
        Why this match
      </Text>
      <Text className="mb-3 text-sm text-gray-700">
        {score != null
          ? `${Math.round(score)}% is how closely your profile text matches this job's description, scored by an AI embedding model.`
          : 'No AI score yet: this job or your profile is still being processed.'}
      </Text>
      {reasons.have.length > 0 ? (
        <>
          <Text className="mb-1.5 text-xs font-semibold text-gray-600">Skills you have</Text>
          <View className="flex-row flex-wrap">
            {reasons.have.map((s) => (
              <Tag key={s} label={s} highlighted />
            ))}
          </View>
        </>
      ) : null}
      {reasons.missing.length > 0 ? (
        <>
          <Text className="mb-1.5 mt-1 text-xs font-semibold text-gray-600">Skills to add</Text>
          <View className="flex-row flex-wrap">
            {reasons.missing.map((s) => (
              <Tag key={s} label={s} />
            ))}
          </View>
        </>
      ) : null}
      {salaryText ? <Text className="mt-1 text-sm text-gray-700">{salaryText}</Text> : null}
    </View>
  );
}
