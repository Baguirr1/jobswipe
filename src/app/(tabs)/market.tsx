import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Chip, NO_FILTERS } from '@/components/FilterSheet';
import { groupByCity, JobMap } from '@/components/JobMap';
import { getRecommendedJobs } from '@/lib/api';
import { costOfLiving, payPicture, vsUs } from '@/lib/cost';
import { ageDays, median, money, moneyExact } from '@/lib/format';
import { C, matchColor, NUM, salaryColor } from '@/lib/theme';
import type { RecommendedJob } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const POOL = 100;

/**
 * Candidate insights: what the jobs ranked for you look like, where they are,
 * what they pay, and what that pay is worth after the local cost of living.
 */
export default function InsightsScreen() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [jobs, setJobs] = useState<RecommendedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setJobs(await getRecommendedJobs(userId, POOL, NO_FILTERS));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 1080, alignSelf: 'center' }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={C.accent}
          />
        }
      >
        <Text className="text-[26px] font-extrabold tracking-tight text-ink">Insights</Text>
        <Text className="mb-4 mt-0.5 text-[13px] text-ink-3">
          The {jobs?.length ?? POOL} best-matching jobs you haven’t swiped yet: fit, pay, places, and cost of living.
        </Text>

        {error ? (
          <Pressable onPress={load} className="mb-4 rounded-xl bg-nope-soft px-4 py-3">
            <Text className="text-sm text-nope">Couldn’t load insights. Tap to try again.</Text>
          </Pressable>
        ) : null}

        {!jobs ? (
          error ? null : <ActivityIndicator className="mt-10" color={C.accent} />
        ) : jobs.length === 0 ? (
          <Box title="Nothing to show yet">
            <Text className="text-sm text-ink-3">
              There are no unswiped jobs right now. New listings show up here as they’re imported.
            </Text>
          </Box>
        ) : (
          <Body jobs={jobs} skills={profile?.skills ?? []} twoCol={twoCol} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Body({ jobs, skills, twoCol }: { jobs: RecommendedJob[]; skills: string[]; twoCol: boolean }) {
  const stats = useMemo(() => summarize(jobs, skills), [jobs, skills]);
  const col = twoCol ? { width: '49%' as const } : { width: '100%' as const };

  return (
    <>
      <View className="mb-4 flex-row flex-wrap justify-between">
        {stats.kpis.map((k) => (
          <View key={k.label} className="mb-3 rounded-2xl border border-line bg-white px-4 py-3" style={{ width: twoCol ? '32%' : '48.5%' }}>
            <Text className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{k.label}</Text>
            <Text className="text-[28px] font-extrabold tracking-tight text-ink" style={NUM}>
              {k.value}
            </Text>
            <Text className="text-xs text-ink-3">{k.sub}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap justify-between">
        <Box title="Where these jobs are" sub="Pin size = number of jobs, color = median salary." style={col}>
          <JobMap jobs={jobs} listLimit={8} />
        </Box>

        <Box title="Pay vs. cost of living" sub="Median pay per city, and what it’s worth after local costs." style={col}>
          <CityTable jobs={jobs} />
        </Box>

        <Box title="Match score distribution" sub="How many of your jobs land at each match score." style={col}>
          <Histogram jobs={jobs} />
        </Box>

        <Box title="Salary vs. match" sub="Each dot is a job. Do the best matches also pay the most? Tap a dot." style={col}>
          <Scatter jobs={jobs} />
        </Box>

        <Box title="Skills" sub="Counted across these jobs." style={col}>
          <View className="flex-row" style={{ gap: 16 }}>
            <View className="flex-1">
              <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">Most requested, you’re missing</Text>
              <Bars rows={stats.missing} color={C.pass} empty="None. Nice." />
            </View>
            <View className="flex-1">
              <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">Most requested, you have</Text>
              <Bars rows={stats.have} color={C.like} empty="Add skills to your profile." />
            </View>
          </View>
        </Box>

        <Box title="Top 5 matches" sub="Highest match scores right now." style={col}>
          {stats.top.map((j) => {
            const pay = payPicture(j);
            return (
              <View key={j.id} className="flex-row items-center border-b border-line py-2.5" style={{ gap: 12 }}>
                <Text className="w-11 text-[15px] font-semibold text-brand" style={NUM}>
                  {j.match_score_percentage == null ? '—' : `${Math.round(j.match_score_percentage)}%`}
                </Text>
                <View className="flex-1">
                  <Text className="text-[13.5px] font-bold text-ink" numberOfLines={1}>{j.title}</Text>
                  <Text className="text-xs text-ink-3" numberOfLines={1}>
                    {j.company_name} · {j.location || (j.is_remote ? 'Remote' : '—')}
                  </Text>
                </View>
                {pay ? (
                  <View className="flex-row items-center">
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: salaryColor(pay.mid), marginRight: 6 }} />
                    <Text className="text-xs text-ink-2" style={NUM}>{money(pay.mid)}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Box>
      </View>

      <Text className="mt-2 text-xs leading-4 text-ink-3">
        Cost-of-living figures are rounded estimates for one adult (compared with the US average), with ~25% of pay to taxes. Use
        them to compare cities, not to budget. Pull down to refresh.
      </Text>
    </>
  );
}

function summarize(jobs: RecommendedJob[], skills: string[]) {
  const n = jobs.length;
  const scored = jobs.map((j) => j.match_score_percentage).filter((v): v is number => v != null);
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const strong = scored.filter((v) => v >= 75).length;
  const pays = jobs.map(payPicture).filter((p) => p != null);
  const medPay = median(pays.map((p) => p.mid));
  const medAdj = median(pays.map((p) => p.adjusted));
  const remote = jobs.filter((j) => j.is_remote).length;
  const week = jobs.filter((j) => ageDays(j.created_at) <= 7).length;

  const mine = new Set(skills.map((s) => s.toLowerCase()));
  const have = new Map<string, number>();
  const missing = new Map<string, number>();
  for (const j of jobs) {
    for (const s of j.required_skills) {
      const m = mine.has(s.toLowerCase()) ? have : missing;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
  }
  const topOf = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return {
    kpis: [
      { label: 'Average match', value: avg == null ? '—' : `${Math.round(avg)}%`, sub: `${scored.length} of ${n} scored` },
      { label: 'Strong matches', value: `${strong}`, sub: `75%+ match, of ${n} jobs` },
      { label: 'Median salary', value: medPay == null ? '—' : money(medPay), sub: `${pays.length} list a salary` },
      { label: 'Feels like', value: medAdj == null ? '—' : money(medAdj), sub: 'median, after cost of living' },
      { label: 'Remote', value: `${Math.round((remote / n) * 100)}%`, sub: `${remote} fully remote` },
      { label: 'Posted this week', value: `${week}`, sub: `of ${n} jobs` },
    ],
    have: topOf(have),
    missing: topOf(missing),
    top: [...jobs]
      .sort((a, b) => (b.match_score_percentage ?? -1) - (a.match_score_percentage ?? -1))
      .slice(0, 5),
  };
}

// ---------- building blocks ----------

function Box({
  title,
  sub,
  children,
  style,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  style?: { width: `${number}%` };
}) {
  return (
    <View className="mb-4 rounded-2xl border border-line bg-white p-4" style={style}>
      <Text className="text-[15px] font-extrabold text-ink">{title}</Text>
      {sub ? <Text className="mb-3 mt-0.5 text-[12.5px] text-ink-3">{sub}</Text> : <View className="h-3" />}
      {children}
    </View>
  );
}

function Bars({ rows, color, empty }: { rows: [string, number][]; color: string; empty: string }) {
  if (!rows.length) return <Text className="text-xs text-ink-3">{empty}</Text>;
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <View>
      {rows.map(([k, v]) => (
        <View key={k} className="mb-1.5 flex-row items-center" style={{ gap: 8 }}>
          <Text className="w-24 text-[12.5px] text-ink" numberOfLines={1}>{k}</Text>
          <View className="h-2 flex-1 overflow-hidden rounded bg-surface2">
            <View style={{ width: `${(v / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
          </View>
          <Text className="w-6 text-right text-xs font-semibold text-ink" style={NUM}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function useWidth() {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  return [w, onLayout] as const;
}

function CityTable({ jobs }: { jobs: RecommendedJob[] }) {
  const [sort, setSort] = useState<'feels' | 'jobs' | 'left'>('feels');
  const rows = useMemo(() => {
    const { rows: groups } = groupByCity(jobs);
    return groups
      .filter((g) => g.medianSalary != null)
      .map((g) => {
        const col = costOfLiving(g.label);
        const mid = g.medianSalary!;
        return {
          ...g,
          index: col.index,
          feels: (mid * 100) / col.index,
          left: (mid * 0.75) / 12 - col.monthly,
        };
      })
      .sort((a, b) => (sort === 'jobs' ? b.count - a.count : sort === 'left' ? b.left - a.left : b.feels - a.feels));
  }, [jobs, sort]);

  if (!rows.length) return <Text className="text-sm text-ink-3">No jobs with a salary in a known city yet.</Text>;
  return (
    <View>
      <View className="mb-1 flex-row flex-wrap">
        <Chip label="Feels like" selected={sort === 'feels'} onPress={() => setSort('feels')} />
        <Chip label="Left / month" selected={sort === 'left'} onPress={() => setSort('left')} />
        <Chip label="Most jobs" selected={sort === 'jobs'} onPress={() => setSort('jobs')} />
      </View>
      <View className="flex-row border-b border-line pb-1.5">
        {['City', 'Jobs', 'Median', 'Cost', 'Feels like', 'Left/mo'].map((h, i) => (
          <Text
            key={h}
            className={`text-[10.5px] font-bold uppercase tracking-wider text-ink-3 ${i === 0 ? 'flex-1' : 'w-[52px] text-right'}`}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.slice(0, 10).map((r) => (
        <View key={r.label} className="flex-row items-center border-b border-line py-2">
          <Text className="flex-1 text-[13px] text-ink" numberOfLines={1}>{r.city.city}</Text>
          <Text className="w-[52px] text-right text-[12.5px] text-ink-3" style={NUM}>{r.count}</Text>
          <Text className="w-[52px] text-right text-[12.5px] text-ink" style={NUM}>{money(r.medianSalary!)}</Text>
          <Text
            className={`w-[52px] text-right text-[12.5px] ${r.index >= 130 ? 'text-nope' : r.index < 95 ? 'text-like' : 'text-ink-2'}`}
            style={NUM}
          >
            {vsUs(r.index)}
          </Text>
          <Text className="w-[52px] text-right text-[12.5px] font-bold text-ink" style={NUM}>{money(r.feels)}</Text>
          <Text className={`w-[52px] text-right text-[12.5px] ${r.left < 0 ? 'text-nope' : 'text-ink-2'}`} style={NUM}>
            {moneyExact(r.left)}
          </Text>
        </View>
      ))}
      <Text className="mt-2 text-[11px] text-ink-3">
        Cost = living costs vs the US average. Feels like = what the median pay buys in an average US city. Left/mo = take-home minus typical rent and essentials.
      </Text>
    </View>
  );
}

const BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

function Histogram({ jobs }: { jobs: RecommendedJob[] }) {
  const [w, onLayout] = useWidth();
  const H = 190;
  const L = 28;
  const B = 30;
  const T = 18;
  const counts = BINS.map(
    (lo) =>
      jobs.filter((j) => {
        const v = j.match_score_percentage;
        return v != null && v >= lo && (lo === 90 ? v <= 100 : v < lo + 10);
      }).length,
  );
  const max = Math.max(1, ...counts);
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = w ? (w - L) / BINS.length : 0;

  return (
    <View onLayout={onLayout}>
      {w ? (
        <Svg width={w} height={H} accessibilityLabel="Histogram of match scores">
          {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
            <G key={v}>
              <Line x1={L} x2={w} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} />
              <SvgText x={L - 6} y={y(v) + 4} fontSize={11} fill={C.ink3} textAnchor="end">
                {String(v)}
              </SvgText>
            </G>
          ))}
          {counts.map((n, i) => (
            <G key={i}>
              {n ? (
                <Rect
                  x={L + i * bw + 2}
                  y={y(n)}
                  width={Math.max(1, bw - 4)}
                  height={y(0) - y(n)}
                  rx={3}
                  fill={matchColor(BINS[i]! + 5)}
                />
              ) : null}
              {n ? (
                <SvgText x={L + i * bw + bw / 2} y={y(n) - 4} fontSize={10} fill={C.ink2} textAnchor="middle">
                  {String(n)}
                </SvgText>
              ) : null}
              <SvgText x={L + i * bw + bw / 2} y={H - B + 15} fontSize={11} fill={C.ink3} textAnchor="middle">
                {String(BINS[i])}
              </SvgText>
            </G>
          ))}
          <Line x1={L} x2={w} y1={y(0)} y2={y(0)} stroke={C.ink3} strokeWidth={1} />
          <SvgText x={(L + w) / 2} y={H - 2} fontSize={11.5} fontWeight="600" fill={C.ink3} textAnchor="middle">
            Match score (%)
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <Legend />
    </View>
  );
}

function Legend() {
  return (
    <View className="mt-2 flex-row flex-wrap" style={{ gap: 14 }}>
      {[
        [C.like, 'Strong (75%+)'],
        [C.gold, 'Fair (60–74%)'],
        [C.ink3, 'Weak'],
      ].map(([c, l]) => (
        <View key={l} className="flex-row items-center">
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c, marginRight: 6 }} />
          <Text className="text-xs text-ink-2">{l}</Text>
        </View>
      ))}
    </View>
  );
}

function Scatter({ jobs }: { jobs: RecommendedJob[] }) {
  const [w, onLayout] = useWidth();
  const [picked, setPicked] = useState<string | null>(null);
  const H = 220;
  const L = 46;
  const R = 10;
  const T = 10;
  const B = 32;
  const pts = jobs.filter((j) => j.match_score_percentage != null && payPicture(j));
  if (!pts.length) return <Text className="text-sm text-ink-3">No scored jobs with a salary yet.</Text>;
  const maxS = Math.max(50_000, Math.ceil(Math.max(...pts.map((j) => j.salary_max ?? j.salary_min ?? 0)) / 50_000) * 50_000);
  const xs = (v: number) => L + ((w - L - R) * v) / 100;
  const ys = (v: number) => T + (H - T - B) * (1 - v / maxS);
  const sel = pts.find((j) => j.id === picked);
  const selPay = sel ? payPicture(sel) : null;

  return (
    <View onLayout={onLayout}>
      {w ? (
        <Svg width={w} height={H} accessibilityLabel="Scatter plot of salary against match score">
          {Array.from({ length: maxS / 50_000 + 1 }, (_, i) => i * 50_000).map((v) => (
            <G key={v}>
              <Line x1={L} x2={w - R} y1={ys(v)} y2={ys(v)} stroke={C.line} strokeWidth={1} />
              <SvgText x={L - 6} y={ys(v) + 4} fontSize={11} fill={C.ink3} textAnchor="end">
                {money(v)}
              </SvgText>
            </G>
          ))}
          {[0, 20, 40, 60, 80, 100].map((v) => (
            <SvgText key={v} x={xs(v)} y={H - B + 15} fontSize={11} fill={C.ink3} textAnchor="middle">
              {String(v)}
            </SvgText>
          ))}
          <SvgText x={(L + w) / 2} y={H - 2} fontSize={11.5} fontWeight="600" fill={C.ink3} textAnchor="middle">
            Match score (%)
          </SvgText>
          {pts.map((j) => {
            const m = j.match_score_percentage!;
            const p = payPicture(j)!;
            const cx = xs(m);
            const on = j.id === picked;
            return (
              <G key={j.id} onPress={() => setPicked(on ? null : j.id)}>
                {j.salary_min != null && j.salary_max != null ? (
                  <Line x1={cx} x2={cx} y1={ys(j.salary_min)} y2={ys(j.salary_max)} stroke={matchColor(m)} strokeWidth={2} opacity={0.35} />
                ) : null}
                <Circle cx={cx} cy={ys(p.mid)} r={on ? 7.5 : 5.5} fill={matchColor(m)} stroke={on ? C.ink : '#fff'} strokeWidth={2} />
                <Circle cx={cx} cy={ys(p.mid)} r={12} fill="transparent" />
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <View className="mt-2 min-h-[44px] rounded-xl bg-surface2 px-3 py-2">
        {sel && selPay ? (
          <>
            <Text className="text-[13px] font-bold text-ink" numberOfLines={1}>{sel.title}</Text>
            <Text className="text-xs text-ink-2" numberOfLines={2}>
              {sel.company_name} · {sel.location || 'Remote'} · {Math.round(sel.match_score_percentage!)}% match ·{' '}
              {money(selPay.mid)} (feels like {money(selPay.adjusted)})
            </Text>
          </>
        ) : (
          <Text className="text-xs text-ink-3">Tap a dot to see the job. Lines show each salary range.</Text>
        )}
      </View>
    </View>
  );
}
