import {
  Banknote,
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  RotateCw,
  Sparkles,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { CompanyLogo, MatchBadge, Tag } from '@/components/ui';
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
  const attribution = sourceLabel(job.source);
  const summary = summarizeMatch(explainMatch(job, me));
  return (
    <View className="flex-1 p-6">
      <View className="flex-row items-start justify-between">
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={64} />
        <MatchBadge score={job.match_score_percentage} />
      </View>

      <Text className="mt-5 text-3xl font-extrabold leading-9 text-gray-900" numberOfLines={3}>
        {job.title}
      </Text>
      <View className="mt-2 flex-row items-center">
        <Building2 size={16} color="#6B7280" />
        <Text className="ml-1.5 flex-1 text-base text-gray-600" numberOfLines={1}>
          {job.company_name}
        </Text>
      </View>
      {attribution ? (
        <View className="mt-1 flex-row items-center">
          <ExternalLink size={13} color="#9CA3AF" />
          <Text className="ml-1.5 flex-1 text-xs font-medium text-gray-400" numberOfLines={1}>
            {attribution} · swipe right to save, apply on their site
          </Text>
        </View>
      ) : null}

      <View className="mt-5 flex-row items-center rounded-2xl bg-green-50 px-4 py-3">
        <Banknote size={20} color="#16A34A" />
        <Text className="ml-2 text-lg font-bold text-green-700">
          {formatSalaryRange(job.salary_min, job.salary_max)}
        </Text>
      </View>

      {summary ? (
        <View className="mt-3 flex-row items-center">
          <Sparkles size={14} color="#6C47FF" />
          <Text className="ml-1.5 flex-1 text-sm font-medium text-brand" numberOfLines={1}>
            {summary}
          </Text>
        </View>
      ) : null}

      <View className="mt-4 flex-row flex-wrap">
        <View className="mb-2 mr-2 flex-row items-center rounded-full bg-blue-50 px-3 py-1.5">
          <Globe size={13} color="#2563EB" />
          <Text className="ml-1 text-xs font-semibold text-blue-700">
            {job.is_remote ? 'Remote' : 'On-site'}
          </Text>
        </View>
        {job.location ? (
          <View className="mb-2 mr-2 flex-row items-center rounded-full bg-gray-100 px-3 py-1.5">
            <MapPin size={13} color="#374151" />
            <Text className="ml-1 text-xs font-semibold text-gray-700">{job.location}</Text>
          </View>
        ) : null}
      </View>

      <Text className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Skills
      </Text>
      <View className="flex-row flex-wrap">
        {job.required_skills.slice(0, 8).map((s) => (
          <Tag key={s} label={s} highlighted={mine.has(s.toLowerCase())} />
        ))}
      </View>

      <View className="mt-auto flex-row items-center justify-center">
        <RotateCw size={14} color="#9CA3AF" />
        <Text className="ml-1.5 text-xs text-gray-400">Tap for full description</Text>
      </View>
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
