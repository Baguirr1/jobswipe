import { Banknote, Building2, Globe, MapPin, RotateCw } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { CompanyLogo, MatchBadge, Tag } from '@/components/ui';
import { formatSalaryRange } from '@/lib/format';
import type { RecommendedJob } from '@/lib/types';

interface Props {
  job: RecommendedJob;
  /** Candidate's skills, highlighted when they overlap the job's requirements. */
  mySkills?: string[];
}

export function JobCardFront({ job, mySkills = [] }: Props) {
  const mine = new Set(mySkills.map((s) => s.toLowerCase()));
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
        <Text className="ml-1.5 text-base text-gray-600">{job.company_name}</Text>
      </View>

      <View className="mt-5 flex-row items-center rounded-2xl bg-green-50 px-4 py-3">
        <Banknote size={20} color="#16A34A" />
        <Text className="ml-2 text-lg font-bold text-green-700">
          {formatSalaryRange(job.salary_min, job.salary_max)}
        </Text>
      </View>

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

export function JobCardBack({ job }: Props) {
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
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          About the role
        </Text>
        <Text className="text-base leading-6 text-gray-700">
          {job.description || 'No description provided.'}
        </Text>
        <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
          All required skills
        </Text>
        <View className="flex-row flex-wrap pb-6">
          {job.required_skills.map((s) => (
            <Tag key={s} label={s} />
          ))}
        </View>
      </ScrollView>
      <Text className="pt-2 text-center text-xs text-gray-400">Tap to flip back</Text>
    </View>
  );
}
