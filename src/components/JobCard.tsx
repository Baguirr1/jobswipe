import { Check, MapPin, RotateCw } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';

import { CompanyLogo, Tag } from '@/components/ui';
import { EST_TAX_RATE, payPicture, vsUs, vsUsPhrase, type PayPicture } from '@/lib/cost';
import { ageDays, formatSalaryRange, money, moneyExact, postedAgo, sourceLabel } from '@/lib/format';
import { explainMatch } from '@/lib/matchReasons';
import { matchColor, NUM, salaryColor } from '@/lib/theme';
import type { Profile, RecommendedJob } from '@/lib/types';
import { usePalette } from '@/providers/ThemeProvider';

interface Props {
  job: RecommendedJob;
  /** The candidate: their skills are highlighted and compared with the job's. */
  me?: Pick<Profile, 'skills' | 'target_salary_min' | 'target_salary_max'> | null;
}

/** Front: a "ticket" with the essentials, pay, and what the pay is worth locally. */
export function JobCardFront({ job, me }: Props) {
  const C = usePalette();
  const reasons = explainMatch(job, me);
  const pay = payPicture(job);
  const isNew = ageDays(job.created_at) <= 3;
  const imported = job.source !== 'jobswipe';
  return (
    <View className="flex-1 bg-surface">
      <TicketHead job={job} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 18, gap: 14 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
          {isNew ? <Pill tone="accent" dot label="New" /> : null}
          <Pill label={job.is_remote ? 'Remote' : 'On-site'} />
          {reasons.have.length + reasons.missing.length > 0 ? (
            <Pill
              tone={reasons.have.length ? 'like' : 'muted'}
              label={`${reasons.have.length} of ${reasons.have.length + reasons.missing.length} skills`}
            />
          ) : null}
          {reasons.salary === 'fits' ? <Pill tone="like" label="Pay fits your range" /> : null}
          {reasons.salary === 'below' ? <Pill tone="gold" label="Pay below your range" /> : null}
          {imported ? <Pill label="Apply on their site" /> : null}
        </View>

        <SalaryBlock job={job} pay={pay} />
        {pay ? <CostBox pay={pay} remote={job.is_remote} /> : null}

        {reasons.have.length ? (
          <View>
            <Eyebrow>Skills you have ({reasons.have.length})</Eyebrow>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {reasons.have.map((s) => (
                <View key={s} className="flex-row items-center rounded-md bg-like-soft px-2 py-1">
                  <Check size={12} color={C.like} strokeWidth={3} />
                  <Text className="ml-1 text-xs font-semibold text-like">{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {reasons.missing.length ? (
          <View>
            <Eyebrow>Skills to build</Eyebrow>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {reasons.missing.slice(0, 6).map((s) => (
                <View key={s} className="rounded-md border border-dashed border-line bg-surface2 px-2 py-1">
                  <Text className="text-xs font-semibold text-ink-2">{s}</Text>
                </View>
              ))}
              {reasons.missing.length > 6 ? (
                <Text className="self-center text-xs text-ink-3">+{reasons.missing.length - 6} more</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text className="text-[13px] leading-5 text-ink-2" numberOfLines={3}>
          {job.description || 'No description provided.'}
        </Text>
        <View className="flex-row items-center justify-between border-t border-line pt-3">
          <Text className="text-[13px] font-bold text-brand">Details & cost breakdown</Text>
          <View className="flex-row items-center">
            <Text className="mr-1.5 text-xs text-ink-3">Tap card</Text>
            <RotateCw size={13} color={C.ink3} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Back: why it matches, the full cost-of-living breakdown, and the description. */
export function JobCardBack({ job, me }: Props) {
  const attribution = sourceLabel(job.source);
  const reasons = explainMatch(job, me);
  const pay = payPicture(job);
  return (
    <View className="flex-1 bg-surface p-5">
      <View className="flex-row items-center">
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={40} />
        <View className="ml-3 flex-1">
          <Text className="text-lg font-extrabold tracking-tight text-ink" numberOfLines={1}>
            {job.title}
          </Text>
          <Text className="text-sm text-ink-3">{job.company_name}</Text>
        </View>
      </View>
      <ScrollView className="mt-4 flex-1" showsVerticalScrollIndicator={false}>
        <WhyThisMatch score={job.match_score_percentage} reasons={reasons} />
        {pay ? <CostBreakdown pay={pay} remote={job.is_remote} /> : null}
        <Eyebrow>About the role</Eyebrow>
        <Text className="mb-4 text-[15px] leading-6 text-ink-2">{job.description || 'No description provided.'}</Text>
        {attribution ? (
          <Text className="pb-6 text-sm text-ink-3">
            {attribution}. Swipe right to save it, then apply from the Saved tab.
          </Text>
        ) : null}
      </ScrollView>
      <Text className="pt-2 text-center text-xs text-ink-3">Tap to flip back</Text>
    </View>
  );
}

function TicketHead({ job }: { job: RecommendedJob }) {
  const C = usePalette();
  return (
    <View>
      <View className="flex-row items-start px-5 pb-4 pt-5" style={{ gap: 14 }}>
        <CompanyLogo uri={job.company_logo} name={job.company_name} size={52} />
        <View className="flex-1">
          <Text className="text-[22px] font-extrabold leading-7 tracking-tight text-ink" numberOfLines={3}>
            {job.title}
          </Text>
          <Text className="mt-0.5 text-[14px] font-semibold text-ink-2" numberOfLines={1}>
            {job.company_name}
          </Text>
          <View className="mt-0.5 flex-row items-center">
            <MapPin size={12} color={C.ink3} />
            <Text className="ml-1 flex-1 text-[13px] text-ink-3" numberOfLines={1}>
              {job.location || (job.is_remote ? 'Remote' : 'Location not listed')}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-ink-3">Posted {postedAgo(job.created_at)}</Text>
        </View>
        <MatchRing score={job.match_score_percentage} />
      </View>
      {/* Perforation with punched notches, like a ticket stub. */}
      <View style={{ height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: C.line }} />
      <View className="absolute h-5 w-5 rounded-full border border-line bg-canvas" style={{ bottom: -10, left: -11 }} />
      <View className="absolute h-5 w-5 rounded-full border border-line bg-canvas" style={{ bottom: -10, right: -11 }} />
    </View>
  );
}


export function MatchRing({ score, size = 58 }: { score: number | null; size?: number }) {
  const C = usePalette();
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.round(score);
  return (
    <View
      style={{ width: size, height: size + 14 }}
      accessible
      accessibilityLabel={score == null ? 'Match score pending' : `${pct} percent match`}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surface2} strokeWidth={6} />
        {score != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={matchColor(pct, C)}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${(circ * pct) / 100} ${circ}`}
          />
        ) : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} className="items-center justify-center">
        <Text className="text-[15px] font-bold text-ink" style={NUM}>
          {score == null ? '…' : pct}
        </Text>
      </View>
      <Text className="text-center text-[10px] font-semibold text-ink-3">match</Text>
    </View>
  );
}

const METER_MIN = 30_000;
const METER_MAX = 200_000;
const meterPos = (v: number) => Math.min(100, Math.max(0, ((v - METER_MIN) / (METER_MAX - METER_MIN)) * 100));

function SalaryBlock({ job, pay }: { job: RecommendedJob; pay: PayPicture | null }) {
  const C = usePalette();
  if (!pay) {
    return <Text className="text-lg font-semibold text-ink-3">Salary not listed</Text>;
  }
  const lo = job.salary_min ?? pay.mid;
  const hi = job.salary_max ?? pay.mid;
  const col = salaryColor(pay.mid, C.ramp);
  return (
    <View>
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} />
        <Text className="text-[22px] font-bold tracking-tight text-ink" style={NUM}>
          {formatSalaryRange(job.salary_min, job.salary_max)}
        </Text>
        <Text className="text-xs text-ink-3">per year</Text>
      </View>
      <View className="mt-2 h-2 rounded bg-surface2" accessibilityElementsHidden importantForAccessibility="no">
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            borderRadius: 4,
            left: `${meterPos(lo)}%`,
            width: `${Math.max(2, meterPos(hi) - meterPos(lo))}%`,
            backgroundColor: col,
          }}
        />
      </View>
      <View className="mt-1 flex-row justify-between">
        {['$30k', '$100k', '$200k+'].map((l) => (
          <Text key={l} className="text-[10.5px] text-ink-3" style={NUM}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Three-up strip: what the pay is worth locally. */
function CostBox({ pay, remote }: { pay: PayPicture; remote: boolean }) {
  const where = pay.col.city ? pay.col.city.city : remote ? 'Remote' : 'This area';
  return (
    <View className="rounded-xl bg-surface2 px-3 py-2.5">
      <View className="flex-row" style={{ gap: 8 }}>
        <Stat
          label="Cost of living"
          value={pay.col.estimated ? 'US avg' : vsUs(pay.col.index)}
          sub={pay.col.estimated ? (remote ? 'Depends where you live' : 'Not in our data') : 'vs US average'}
          tone={pay.col.index >= 130 ? 'warn' : undefined}
        />
        <Stat label="Feels like" value={money(pay.adjusted)} sub="in an avg US city" />
        <Stat
          label="Left / month"
          value={moneyExact(pay.leftover)}
          sub="after tax & costs"
          tone={pay.leftover < 0 ? 'warn' : pay.leftover > 1500 ? 'good' : undefined}
        />
      </View>
      <Text className="mt-1.5 text-[11px] text-ink-3" numberOfLines={1}>
        {pay.col.estimated
          ? 'Using US-average costs. Estimates, for comparing offers.'
          : `${where}: typical 1-bed rent ${moneyExact(pay.col.rent)}/mo. Estimates.`}
      </Text>
    </View>
  );
}

function CostBreakdown({ pay, remote }: { pay: PayPicture; remote: boolean }) {
  const takeHome = (pay.mid * (1 - EST_TAX_RATE)) / 12;
  const other = pay.col.monthly - pay.col.rent;
  const rows: [string, string][] = [
    ['Salary (midpoint)', `${money(pay.mid)} / yr`],
    [`Take-home, ~${Math.round(EST_TAX_RATE * 100)}% to taxes`, `${moneyExact(takeHome)} / mo`],
    ['Typical 1-bed rent', `− ${moneyExact(pay.col.rent)}`],
    ['Food, transport, utilities, health', `− ${moneyExact(other)}`],
  ];
  return (
    <View className="mb-6 rounded-2xl border border-line p-4">
      <Eyebrow>
        Pay vs. cost of living{pay.col.city ? ` · ${pay.col.city.city}, ${pay.col.city.state}` : ''}
      </Eyebrow>
      {rows.map(([k, v]) => (
        <View key={k} className="flex-row justify-between border-b border-line py-1.5">
          <Text className="flex-1 text-[13px] text-ink-2">{k}</Text>
          <Text className="text-[13px] text-ink" style={NUM}>
            {v}
          </Text>
        </View>
      ))}
      <View className="flex-row justify-between pt-2">
        <Text className="text-[13px] font-bold text-ink">Left over each month</Text>
        <Text className={`text-[13px] font-bold ${pay.leftover < 0 ? 'text-nope' : 'text-like'}`} style={NUM}>
          {moneyExact(pay.leftover)}
        </Text>
      </View>
      <Text className="mt-3 text-xs leading-4 text-ink-3">
        {pay.col.estimated
          ? remote
            ? 'Remote role: figures use US-average costs. Your own city changes the picture.'
            : 'We don’t have cost data for this place yet, so US-average costs are used.'
          : `Living costs here are ${vsUsPhrase(pay.col.index)}, so ${money(pay.mid)} here buys about what ${money(pay.adjusted)} does in an average US city.`}{' '}
        Rounded estimates for one adult; use them to compare offers, not to budget.
      </Text>
    </View>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? 'text-nope' : tone === 'good' ? 'text-like' : 'text-ink';
  return (
    <View className="flex-1">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-ink-3" numberOfLines={1}>
        {label}
      </Text>
      <Text className={`text-[14px] font-bold ${color}`} style={NUM} numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-[11px] text-ink-3" numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function Pill({ label, tone = 'plain', dot }: { label: string; tone?: 'plain' | 'accent' | 'like' | 'gold' | 'muted'; dot?: boolean }) {
  const C = usePalette();
  const cls = {
    plain: ['bg-surface2', 'text-ink-2', C.ink2],
    accent: ['bg-brand-light', 'text-brand', C.accent],
    like: ['bg-like-soft', 'text-like', C.like],
    gold: ['bg-gold-soft', 'text-gold-ink', C.goldInk],
    muted: ['bg-surface2', 'text-ink-3', C.ink3],
  }[tone];
  return (
    <View className={`flex-row items-center rounded-md px-2 py-1 ${cls[0]}`}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cls[2], marginRight: 5 }} /> : null}
      <Text className={`text-xs font-bold ${cls[1]}`}>{label}</Text>
    </View>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{children}</Text>
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
    <View className="mb-5 rounded-2xl bg-brand-light p-4">
      <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand">Why this match</Text>
      <Text className="mb-3 text-sm text-ink-2">
        {score != null
          ? `${Math.round(score)}% match, based on how closely your resume, skills and target role line up with this job's description.`
          : 'We’re still working out how well this job fits you. Check back in a minute.'}
      </Text>
      {reasons.have.length > 0 ? (
        <>
          <Text className="mb-1.5 text-xs font-semibold text-ink-2">Skills you have</Text>
          <View className="flex-row flex-wrap">
            {reasons.have.map((s) => (
              <Tag key={s} label={s} highlighted />
            ))}
          </View>
        </>
      ) : null}
      {reasons.missing.length > 0 ? (
        <>
          <Text className="mb-1.5 mt-1 text-xs font-semibold text-ink-2">Skills to add</Text>
          <View className="flex-row flex-wrap">
            {reasons.missing.map((s) => (
              <Tag key={s} label={s} />
            ))}
          </View>
        </>
      ) : null}
      {salaryText ? <Text className="mt-1 text-sm text-ink-2">{salaryText}</Text> : null}
    </View>
  );
}
