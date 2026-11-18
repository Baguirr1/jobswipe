import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { adjustForCostOfLiving, NO_WAGE_TAX_STATES, RPP_YEAR, type ColAdjusted } from '@/lib/costOfLiving';
import { canUsePayEstimate, statedAnnualPay, type PayFields } from '@/lib/format';
import type { Profile, SavedJob } from '@/lib/types';

/** Applications with no update for this long are worth a follow-up. */
const FOLLOW_UP_DAYS = 14;
const DAY_MS = 86_400_000;

const usdK = (n: number) => `$${Math.round(n / 1000)}k`;

/** Annual pay for comparisons: stated pay first, else the midpoint of an estimate. */
export function annualPayOf(job: Partial<PayFields>): { amount: number; estimated: boolean } | null {
  const stated = statedAnnualPay(job);
  if (stated != null) return { amount: stated, estimated: false };
  if (!canUsePayEstimate(job)) return null;
  const lo = job.est_pay_min ?? job.est_pay_max;
  const hi = job.est_pay_max ?? job.est_pay_min;
  if (lo == null || hi == null) return null;
  const mid = (Number(lo) + Number(hi)) / 2;
  return { amount: job.est_pay_period === 'hour' ? mid * 2080 : mid, estimated: true };
}

/** Cost-of-living view of one saved job; null for remote jobs or unknown locations. */
export function colForJob(job: SavedJob['job']): (ColAdjusted & { noWageTax: boolean; estimated: boolean }) | null {
  if (job.is_remote) return null;
  const pay = annualPayOf(job);
  if (!pay) return null;
  const col = adjustForCostOfLiving(pay.amount, job.location);
  return col ? { ...col, noWageTax: NO_WAGE_TAX_STATES.has(col.state), estimated: pay.estimated } : null;
}

/** "Prices 8% above the US average" */
export function describeRpp(rpp: number): string {
  const diff = Math.round(rpp - 100);
  if (diff === 0) return 'prices at the US average';
  return `prices ${Math.abs(diff)}% ${diff > 0 ? 'above' : 'below'} the US average`;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

interface Insights {
  medianPay: number | null;
  payCount: number;
  estimatedCount: number;
  aboveTarget: number | null;
  bestValue: { title: string; company: string; adjusted: number; state: string; rpp: number }[];
  appliedTotal: number;
  responseRate: number | null;
  followUps: number;
  skillGaps: { skill: string; count: number }[];
  remoteShare: number;
}

function computeInsights(saved: SavedJob[], profile: Profile | null): Insights {
  const pays: number[] = [];
  let estimatedCount = 0;
  const bestValue: Insights['bestValue'] = [];
  const skillCounts = new Map<string, { skill: string; count: number }>();
  const mySkills = new Set((profile?.skills ?? []).map((s) => s.trim().toLowerCase()));
  let applied = 0;
  let heardBack = 0;
  let followUps = 0;
  let remote = 0;
  const now = Date.now();

  for (const s of saved) {
    const { job } = s;
    if (job.is_remote) remote++;

    const pay = annualPayOf(job);
    if (pay) {
      pays.push(pay.amount);
      if (pay.estimated) estimatedCount++;
    }
    const col = colForJob(job);
    if (col) bestValue.push({ title: job.title, company: job.company_name, adjusted: col.adjusted, state: col.state, rpp: col.rpp });

    for (const raw of job.required_skills) {
      const key = raw.trim().toLowerCase();
      if (!key || mySkills.has(key)) continue;
      const entry = skillCounts.get(key) ?? { skill: raw.trim(), count: 0 };
      entry.count++;
      skillCounts.set(key, entry);
    }

    if (s.stage !== 'saved') {
      applied++;
      if (s.stage === 'interviewing' || s.stage === 'offer') heardBack++;
    }
    if (s.stage === 'applied') {
      const last = new Date(s.tracked_at ?? s.applied_at ?? s.created_at).getTime();
      if (now - last > FOLLOW_UP_DAYS * DAY_MS) followUps++;
    }
  }

  const target = profile?.target_salary_min ?? null;
  return {
    medianPay: median(pays),
    payCount: pays.length,
    estimatedCount,
    aboveTarget: target ? pays.filter((p) => p >= target).length : null,
    bestValue: bestValue.sort((a, b) => b.adjusted - a.adjusted).slice(0, 3),
    appliedTotal: applied,
    responseRate: applied ? heardBack / applied : null,
    followUps,
    skillGaps: [...skillCounts.values()]
      .filter((g) => g.count > 1 || saved.length <= 3)
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
      .slice(0, 5),
    remoteShare: saved.length ? remote / saved.length : 0,
  };
}

export function SavedInsights({ saved, profile }: { saved: SavedJob[]; profile: Profile | null }) {
  const [open, setOpen] = useState(false);
  const data = useMemo(() => computeInsights(saved, profile), [saved, profile]);
  if (!saved.length) return null;

  const headline =
    data.medianPay != null
      ? `Typical pay ${usdK(data.medianPay)} · ${saved.length} saved`
      : `${saved.length} saved job${saved.length === 1 ? '' : 's'}`;

  return (
    <View className="mb-5 rounded-3xl border border-purple-100 bg-white">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Insights on your saved jobs. ${open ? 'Hide' : 'Show'}`}
        className="min-h-14 flex-row items-center px-5 py-4"
      >
        <BarChart3 size={20} color="#6C47FF" />
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-gray-900">Insights</Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>{headline}</Text>
        </View>
        {open ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
      </Pressable>

      {open ? (
        <View className="gap-3 border-t border-purple-50 px-5 pb-5 pt-4">
          {/* Stat tiles */}
          <View className="flex-row gap-3">
            <Stat
              label="Median pay"
              value={data.medianPay != null ? usdK(data.medianPay) : '—'}
              caption={
                data.payCount
                  ? `${data.payCount} with pay${data.estimatedCount ? ` · ${data.estimatedCount} est.` : ''}`
                  : 'No pay listed yet'
              }
            />
            <Stat
              label="Response rate"
              value={data.responseRate != null ? `${Math.round(data.responseRate * 100)}%` : '—'}
              caption={data.appliedTotal ? `of ${data.appliedTotal} applied` : 'Mark jobs as applied'}
            />
          </View>
          <View className="flex-row gap-3">
            <Stat
              label="Meets your target"
              value={data.aboveTarget != null && data.payCount ? `${data.aboveTarget}/${data.payCount}` : '—'}
              caption={profile?.target_salary_min ? `at ${usdK(profile.target_salary_min)}+` : 'Set a target in Profile'}
            />
            <Stat label="Remote" value={`${Math.round(data.remoteShare * 100)}%`} caption="of saved jobs" />
          </View>

          {data.followUps ? (
            <View className="rounded-2xl bg-amber-50 px-4 py-3">
              <Text className="text-sm font-semibold text-amber-800">
                {data.followUps} application{data.followUps === 1 ? '' : 's'} with no update in {FOLLOW_UP_DAYS}+ days
              </Text>
              <Text className="mt-0.5 text-xs text-amber-700">A short follow-up email often gets a reply.</Text>
            </View>
          ) : null}

          {/* Cost of living */}
          <Section title="Best value after cost of living">
            {data.bestValue.length ? (
              <>
                {data.bestValue.map((b, i) => (
                  <View key={`${b.title}-${b.company}-${i}`} className="flex-row items-center py-1.5">
                    <Text className="w-5 text-sm font-bold text-brand">{i + 1}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{b.title}</Text>
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {b.company} · {b.state}, {describeRpp(b.rpp)}
                      </Text>
                    </View>
                    <Text className="ml-2 text-sm font-bold text-gray-900">{usdK(b.adjusted)}</Text>
                  </View>
                ))}
                <Text className="mt-1 text-xs text-gray-400">
                  Pay in US-average dollars, using BEA {RPP_YEAR} Regional Price Parities by state. Remote jobs aren’t included.
                </Text>
              </>
            ) : (
              <Text className="text-sm text-gray-500">Save on-site or hybrid US jobs with pay to compare them here.</Text>
            )}
          </Section>

          {/* Skills gap */}
          <Section title="Skills to add">
            {data.skillGaps.length ? (
              <>
                <View className="flex-row flex-wrap">
                  {data.skillGaps.map((g) => (
                    <View key={g.skill} className="mb-2 mr-2 rounded-full bg-brand-light px-3 py-1.5">
                      <Text className="text-xs font-semibold text-brand-dark">
                        {g.skill} · {g.count} job{g.count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="text-xs text-gray-400">Required by your saved jobs, missing from your profile.</Text>
              </>
            ) : (
              <Text className="text-sm text-gray-500">Your profile covers the skills your saved jobs ask for.</Text>
            )}
          </Section>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-gray-50 px-4 py-3">
      <Text className="text-xs font-medium text-gray-500">{label}</Text>
      <Text className="mt-0.5 text-xl font-extrabold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-400" numberOfLines={1}>{caption}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-1">
      <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">{title}</Text>
      {children}
    </View>
  );
}
