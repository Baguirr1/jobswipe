import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { cityLabel, resolveCity, type City } from '@/lib/cities';
import { costLabel, salaryMid, vsUs, vsUsPhrase } from '@/lib/cost';
import { median, money } from '@/lib/format';
import { NUM, salaryColor } from '@/lib/theme';
import { US_NATION_PATH, US_STATES_PATH, US_VIEWBOX } from '@/lib/usmap';
import { usePalette } from '@/providers/ThemeProvider';

type MapJob = {
  id: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
};

export interface CityGroup {
  city: City;
  label: string;
  count: number;
  /** Median salary midpoint of the jobs that list one. */
  medianSalary: number | null;
}

/** Group jobs by the city they resolve to; the rest are remote / unplaced. */
export function groupByCity(jobs: MapJob[]) {
  const groups = new Map<string, { city: City; mids: number[]; count: number }>();
  let remote = 0;
  let unplaced = 0;
  for (const j of jobs) {
    const city = resolveCity(j.location);
    if (!city) {
      if (j.is_remote) remote++;
      else unplaced++;
      continue;
    }
    const key = cityLabel(city);
    const g = groups.get(key) ?? { city, mids: [], count: 0 };
    g.count++;
    const mid = salaryMid(j.salary_min, j.salary_max);
    if (mid != null) g.mids.push(mid);
    groups.set(key, g);
  }
  const rows: CityGroup[] = [...groups.entries()]
    .map(([label, g]) => ({ city: g.city, label, count: g.count, medianSalary: median(g.mids) }))
    .sort((a, b) => b.count - a.count || (b.medianSalary ?? 0) - (a.medianSalary ?? 0));
  return { rows, remote, unplaced };
}

const pinRadius = (n: number) => 20 + Math.sqrt(n) * 9;

/**
 * "Where these jobs are": pins sized by job count, colored by median salary.
 * Tapping a pin (or a row in the list) selects that city; tapping it again clears it.
 */
export function JobMap({
  jobs,
  selected,
  onSelect,
  current,
  showList = true,
  listLimit,
}: {
  jobs: MapJob[];
  /** City label ("Austin, TX") currently used as the location filter. */
  selected?: string | null;
  onSelect?: (label: string | null) => void;
  /** The job on top of the deck: its city gets a dashed ring. */
  current?: MapJob | null;
  showList?: boolean;
  listLimit?: number;
}) {
  const C = usePalette();
  const { rows, remote, unplaced } = useMemo(() => groupByCity(jobs), [jobs]);
  const now = current ? resolveCity(current.location) : null;
  const nowRow = now ? rows.find((r) => r.city === now) : null;
  const toggle = (label: string) => onSelect?.(selected === label ? null : label);
  const listed = listLimit ? rows.slice(0, listLimit) : rows;

  return (
    <View>
      <Svg
        width="100%"
        style={{ aspectRatio: US_VIEWBOX.width / US_VIEWBOX.height }}
        viewBox={`0 0 ${US_VIEWBOX.width} ${US_VIEWBOX.height}`}
        accessibilityLabel={`Map of ${rows.length} cities with jobs`}
      >
        <Path d={US_NATION_PATH} fill={C.land} />
        <Path d={US_STATES_PATH} fill="none" stroke={C.mapStroke} strokeWidth={1.6} strokeLinejoin="round" />
        {/* Big pins first so small ones stay tappable on top. */}
        {[...rows]
          .sort((a, b) => b.count - a.count)
          .map((r) => {
            const dim = !!selected && selected !== r.label;
            return (
              <G key={r.label} onPress={onSelect ? () => toggle(r.label) : undefined} opacity={dim ? 0.25 : 1}>
                <Circle
                  cx={r.city.x}
                  cy={r.city.y}
                  r={pinRadius(r.count)}
                  fill={r.medianSalary != null ? salaryColor(r.medianSalary, C.ramp) : C.ink3}
                  stroke={selected === r.label ? C.ink : C.mapStroke}
                  strokeWidth={selected === r.label ? 6 : 4}
                />
                {r.count > 1 ? (
                  <SvgText
                    x={r.city.x}
                    y={r.city.y + 9}
                    fontSize={26}
                    fontWeight="700"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {String(r.count)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        {now ? (
          <G pointerEvents="none">
            <Circle
              cx={now.x}
              cy={now.y}
              r={pinRadius(nowRow?.count ?? 1) + 11}
              fill="none"
              stroke={C.ink}
              strokeWidth={4}
              strokeDasharray="9 7"
            />
            {/* Halo underneath, then the label, so it reads over pins and borders. */}
            {[true, false].map((halo) => (
              <SvgText
                key={String(halo)}
                x={now.x > 700 ? now.x - pinRadius(nowRow?.count ?? 1) - 18 : now.x + pinRadius(nowRow?.count ?? 1) + 18}
                y={now.y + 10}
                fontSize={30}
                fontWeight="700"
                fill={halo ? C.surface : C.ink}
                stroke={halo ? C.surface : 'none'}
                strokeWidth={halo ? 8 : 0}
                strokeLinejoin="round"
                textAnchor={now.x > 700 ? 'end' : 'start'}
              >
                {now.city}
              </SvgText>
            ))}
          </G>
        ) : null}
      </Svg>

      <SalaryLegend />

      {showList ? (
        <View className="mt-3">
          {listed.map((r) => {
            const on = selected === r.label;
            return (
              <Pressable
                key={r.label}
                onPress={onSelect ? () => toggle(r.label) : undefined}
                accessibilityRole={onSelect ? 'button' : undefined}
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${r.label}: ${r.count} jobs, median ${r.medianSalary ? money(r.medianSalary) : 'salary not listed'}, living costs ${vsUsPhrase(r.city.costIndex)}`}
                className={`flex-row items-center rounded-lg px-1.5 py-1.5 ${on ? 'bg-brand-light' : ''}`}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: r.medianSalary != null ? salaryColor(r.medianSalary, C.ramp) : C.ink3,
                  }}
                />
                <Text className="ml-2 flex-1 text-[13px] text-ink" numberOfLines={1}>
                  {r.label}
                </Text>
                <Text className="w-8 text-right text-xs text-ink-3" style={NUM}>
                  {r.count}
                </Text>
                <Text className="w-14 text-right text-xs font-semibold text-ink" style={NUM}>
                  {r.medianSalary != null ? money(r.medianSalary) : '—'}
                </Text>
                <Text
                  className="w-20 text-right text-[11px] text-ink-3"
                  style={NUM}
                  accessibilityLabel={costLabel(r.city.costIndex)}
                >
                  {vsUs(r.city.costIndex)}
                </Text>
              </Pressable>
            );
          })}
          {listLimit && rows.length > listLimit ? (
            <Text className="mt-1 text-xs text-ink-3">+{rows.length - listLimit} more cities</Text>
          ) : null}
          {remote || unplaced ? (
            <Text className="mt-1 text-xs text-ink-3">
              {[remote ? `${remote} remote` : null, unplaced ? `${unplaced} in places not on the map` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {rows.length ? (
            <Text className="mt-1 text-[11px] text-ink-3">Last column: cost of living vs the US average.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SalaryLegend() {
  const C = usePalette();
  return (
    <View className="mt-2">
      <Svg width="100%" height={8}>
        <Defs>
          <LinearGradient id="salramp" x1="0" y1="0" x2="1" y2="0">
            {[0, 0.25, 0.5, 0.75, 1].map((o) => (
              <Stop key={o} offset={o} stopColor={salaryColor(45_000 + o * 90_000, C.ramp)} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={8} rx={4} fill="url(#salramp)" />
      </Svg>
      <View className="mt-1 flex-row justify-between">
        <Text className="text-[10.5px] text-ink-3" style={NUM}>$45k</Text>
        <Text className="text-[10.5px] text-ink-3">Median salary</Text>
        <Text className="text-[10.5px] text-ink-3" style={NUM}>$135k+</Text>
      </View>
    </View>
  );
}
