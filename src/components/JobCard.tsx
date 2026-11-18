import { ExternalLink, MapPin, RotateCw, Sparkles, Zap } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { JobDescription } from '@/components/JobDescription';
import { SwipeBackground } from '@/components/SwipeBackground';
import { CompanyLogo, Tag } from '@/components/ui';
import { formatPay, sourceLabel } from '@/lib/format';
import { employmentTypeLabel, workplaceTypeLabel } from '@/lib/jobLabels';
import { explainMatch, summarizeMatch } from '@/lib/matchReasons';
import type { Profile, RecommendedJob } from '@/lib/types';

interface Props {
  job: RecommendedJob;
  /** The candidate: their skills are highlighted and compared with the job's. */
  me?: Pick<Profile, 'skills' | 'target_salary_min' | 'target_salary_max'> | null;
}

export function JobCardFront({ job, me }: Props) {
  const mine = new Set((me?.skills ?? []).map((s) => s.toLowerCase()));
  const reasons = explainMatch(job, me);
  const summary = summarizeMatch(reasons);
  const totalSkills = reasons.have.length + reasons.missing.length;
  const imported = job.source !== 'jobswipe';
  return (
    <View className="flex-1">
      <SwipeBackground dark />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start justify-between">
          <CompanyLogo uri={job.company_logo} name={job.company_name} size={56} />
          {job.match_score_percentage != null ? (
            <View className="items-end rounded-2xl bg-white/15 px-3 py-2">
              <Text className="text-sm font-bold text-white">{Math.round(job.match_score_percentage)}% match</Text>
              <Text className="mt-0.5 text-[11px] text-purple-100">
                {totalSkills > 0
                  ? `${reasons.have.length} of ${totalSkills} skills`
                  : 'Based on your profile'}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="min-h-8 flex-1" />
        <View
          className={`mb-3 self-start flex-row items-center rounded-full px-3 py-1 ${
            imported ? 'bg-white/15' : 'bg-green-400/25'
          }`}
        >
          {imported ? <ExternalLink size={12} color="#E9D5FF" /> : <Zap size={12} color="#BBF7D0" fill="#BBF7D0" />}
          <Text
            className={`ml-1.5 text-xs font-bold uppercase tracking-wider ${
              imported ? 'text-purple-100' : 'text-green-100'
            }`}
          >
            {imported ? `External listing${sourceLabel(job.source) ? ` · ${sourceLabel(job.source)!.replace(/^via /i, '')}` : ''}` : 'Quick apply'}
          </Text>
        </View>
        <Text className="text-3xl font-extrabold leading-9 text-white" numberOfLines={3}>{job.title}</Text>
        <Text className="mt-2 text-lg font-medium text-purple-100" numberOfLines={1}>{job.company_name}</Text>
        <View className="mt-4 flex-row items-center">
          <MapPin size={15} color="#DDD6FE" />
          <Text className="ml-2 flex-1 text-sm text-purple-100" numberOfLines={2}>
            {[job.location, workplaceTypeLabel(job.workplace_type) ?? (job.is_remote ? 'Remote' : 'On-site'), employmentTypeLabel(job.employment_type)]
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
        <PayLine job={job} />
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
          <Text className="mr-3 flex-1 text-xs text-purple-200">
            {imported
              ? 'Swipe right to save · apply on their site'
              : 'Swipe right to share your profile & resume with the recruiter'}
          </Text>
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
        <JobDescription text={job.description} />
        {attribution ? (
          <Text className="pb-6 pt-4 text-sm text-gray-500">
            {attribution}. Swipe right to save it, then apply from the Saved tab.
          </Text>
        ) : (
          <View className="mb-6 mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-green-700">
              What happens when you apply
            </Text>
            <Text className="text-sm leading-5 text-gray-700">
              {job.company_name} sees your name, photo, target role, desired salary, bio, skills and
              resume. If they like you back, it’s a match and you can chat.
            </Text>
          </View>
        )}
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
          ? `${Math.round(score)}% match, based on how closely your resume, skills and target role line up with this job's description.`
          : 'We’re still working out how well this job fits you. Check back in a minute.'}
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

function PayLine({ job }: { job: RecommendedJob }) {
  const pay = formatPay(job);
  return (
    <View className="mt-4">
      <Text className={pay.estimated ? 'text-xl font-semibold text-purple-100' : 'text-2xl font-bold text-white'}>{pay.text}</Text>
      {pay.note ? <Text className="mt-0.5 text-xs text-purple-200">{pay.note}</Text> : null}
    </View>
  );
}
