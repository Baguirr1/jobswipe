import { Banknote, RotateCw } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { Avatar, MatchBadge, Tag } from '@/components/ui';
import { formatSalaryRange } from '@/lib/format';
import type { CandidateForJob } from '@/lib/types';

interface Props {
  candidate: CandidateForJob;
  requiredSkills?: string[];
}

export function CandidateCardFront({ candidate, requiredSkills = [] }: Props) {
  const required = new Set(requiredSkills.map((s) => s.toLowerCase()));
  return (
    <View className="flex-1 p-6">
      <View className="flex-row items-start justify-between">
        <Avatar uri={candidate.avatar_url} name={candidate.full_name} size={80} />
        <MatchBadge score={candidate.match_score_percentage} />
      </View>
      <Text className="mt-5 text-3xl font-extrabold text-gray-900">
        {candidate.full_name ?? 'Anonymous candidate'}
      </Text>
      {candidate.target_title ? (
        <Text className="mt-1 text-base text-gray-600">{candidate.target_title}</Text>
      ) : null}

      <View className="mt-5 flex-row items-center rounded-2xl bg-green-50 px-4 py-3">
        <Banknote size={20} color="#16A34A" />
        <Text className="ml-2 text-base font-semibold text-green-700">
          Wants {formatSalaryRange(candidate.target_salary_min, candidate.target_salary_max)}
        </Text>
      </View>

      {candidate.bio ? (
        <Text className="mt-4 text-base leading-6 text-gray-700" numberOfLines={4}>
          {candidate.bio}
        </Text>
      ) : null}

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Skills
      </Text>
      <View className="flex-row flex-wrap">
        {candidate.skills.slice(0, 10).map((s) => (
          <Tag key={s} label={s} highlighted={required.has(s.toLowerCase())} />
        ))}
      </View>

      <View className="mt-auto flex-row items-center justify-center">
        <RotateCw size={14} color="#9CA3AF" />
        <Text className="ml-1.5 text-xs text-gray-400">Tap to view resume</Text>
      </View>
    </View>
  );
}

export function CandidateCardBack({ candidate }: Props) {
  return (
    <View className="flex-1 p-6">
      <Text className="text-lg font-bold text-gray-900">{candidate.full_name}</Text>
      <Text className="mb-3 text-sm text-gray-500">Resume</Text>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <Text className="pb-6 text-base leading-6 text-gray-700">
          {candidate.resume_text || 'No resume provided.'}
        </Text>
      </ScrollView>
      <Text className="pt-2 text-center text-xs text-gray-400">Tap to flip back</Text>
    </View>
  );
}
