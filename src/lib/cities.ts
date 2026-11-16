/**
 * US metros the map and the cost-of-living estimates know about.
 *
 * x / y: position on the map in src/lib/usmap.ts (Albers USA, 975 x 610).
 * costIndex: overall cost of living, US average = 100.
 * rent: typical monthly rent for a one-bedroom apartment, USD.
 *
 * The cost figures are rounded estimates compiled from public cost-of-living
 * indexes and rent surveys (2025). They are good for comparing cities, not for
 * budgeting to the dollar. Refresh them here; nothing else needs to change.
 */
export interface City {
  city: string;
  state: string;
  x: number;
  y: number;
  costIndex: number;
  rent: number;
}

export const CITIES: City[] = [
  { city: "New York", state: 'NY', x: 869.7, y: 215.7, costIndex: 170, rent: 3400 },
  { city: "Los Angeles", state: 'CA', x: 86.8, y: 363.1, costIndex: 150, rent: 2300 },
  { city: "Chicago", state: 'IL', x: 638.2, y: 226.1, costIndex: 107, rent: 1850 },
  { city: "Houston", state: 'TX', x: 510.4, y: 509.2, costIndex: 94, rent: 1250 },
  { city: "Phoenix", state: 'AZ', x: 197.2, y: 399.8, costIndex: 105, rent: 1400 },
  { city: "Philadelphia", state: 'PA', x: 854.2, y: 237.1, costIndex: 110, rent: 1650 },
  { city: "San Antonio", state: 'TX', x: 448.7, y: 516.3, costIndex: 90, rent: 1150 },
  { city: "San Diego", state: 'CA', x: 99.7, y: 397.5, costIndex: 150, rent: 2400 },
  { city: "Dallas", state: 'TX', x: 482.9, y: 440.5, costIndex: 102, rent: 1500 },
  { city: "Austin", state: 'TX', x: 463.9, y: 497.5, costIndex: 104, rent: 1500 },
  { city: "San Jose", state: 'CA', x: 41.3, y: 273.7, costIndex: 190, rent: 2900 },
  { city: "San Francisco", state: 'CA', x: 34.8, y: 261.4, costIndex: 180, rent: 3000 },
  { city: "Seattle", state: 'WA', x: 97.6, y: 46.3, costIndex: 152, rent: 2100 },
  { city: "Denver", state: 'CO', x: 342.9, y: 273.9, costIndex: 112, rent: 1750 },
  { city: "Washington", state: 'DC', x: 827.4, y: 267.3, costIndex: 152, rent: 2300 },
  { city: "Boston", state: 'MA', x: 908.7, y: 167.1, costIndex: 152, rent: 2700 },
  { city: "Nashville", state: 'TN', x: 665.1, y: 355, costIndex: 102, rent: 1550 },
  { city: "Atlanta", state: 'GA', x: 715, y: 405.1, costIndex: 102, rent: 1650 },
  { city: "Miami", state: 'FL', x: 822.7, y: 572.5, costIndex: 125, rent: 2300 },
  { city: "Charlotte", state: 'NC', x: 775.3, y: 362.4, costIndex: 98, rent: 1500 },
  { city: "Raleigh", state: 'NC', x: 813, y: 343.1, costIndex: 99, rent: 1450 },
  { city: "Durham", state: 'NC', x: 807.4, y: 339.1, costIndex: 98, rent: 1400 },
  { city: "Portland", state: 'OR', x: 79.5, y: 90.1, costIndex: 118, rent: 1600 },
  { city: "Las Vegas", state: 'NV', x: 153, y: 328.1, costIndex: 104, rent: 1350 },
  { city: "Detroit", state: 'MI', x: 713.2, y: 207.3, costIndex: 93, rent: 1100 },
  { city: "Minneapolis", state: 'MN', x: 541.9, y: 161, costIndex: 104, rent: 1450 },
  { city: "Columbus", state: 'OH', x: 721.4, y: 260.9, costIndex: 92, rent: 1200 },
  { city: "Indianapolis", state: 'IN', x: 667.8, y: 271.8, costIndex: 91, rent: 1150 },
  { city: "Salt Lake City", state: 'UT', x: 228.5, y: 235.3, costIndex: 106, rent: 1400 },
  { city: "Pittsburgh", state: 'PA', x: 770.7, y: 242.2, costIndex: 95, rent: 1350 },
  { city: "St. Louis", state: 'MO', x: 599.8, y: 303.6, costIndex: 89, rent: 1150 },
  { city: "Kansas City", state: 'MO', x: 522.8, y: 295.7, costIndex: 91, rent: 1150 },
  { city: "Tampa", state: 'FL', x: 769.5, y: 530.9, costIndex: 105, rent: 1750 },
  { city: "Orlando", state: 'FL', x: 789, y: 514.6, costIndex: 104, rent: 1650 },
  { city: "Baltimore", state: 'MD', x: 832.9, y: 257.2, costIndex: 104, rent: 1550 },
  { city: "Cleveland", state: 'OH', x: 738.3, y: 222.8, costIndex: 89, rent: 1050 },
  { city: "Cincinnati", state: 'OH', x: 697.9, y: 283.7, costIndex: 90, rent: 1150 },
  { city: "Sacramento", state: 'CA', x: 55.6, y: 248, costIndex: 120, rent: 1700 },
  { city: "New Orleans", state: 'LA', x: 614.4, y: 501.3, costIndex: 100, rent: 1350 },
  { city: "Richmond", state: 'VA', x: 826.7, y: 299.4, costIndex: 99, rent: 1450 },
  { city: "Jersey City", state: 'NJ', x: 868.4, y: 215.7, costIndex: 140, rent: 2900 },
  { city: "Irvine", state: 'CA', x: 92.5, y: 373.1, costIndex: 165, rent: 2800 },
  { city: "Milwaukee", state: 'WI', x: 631.3, y: 200.1, costIndex: 93, rent: 1150 },
  { city: "Oklahoma City", state: 'OK', x: 470.3, y: 378.8, costIndex: 86, rent: 950 },
  { city: "Albuquerque", state: 'NM', x: 302.4, y: 376.9, costIndex: 93, rent: 1100 },
  { city: "Boise", state: 'ID', x: 170.1, y: 157.7, costIndex: 105, rent: 1450 },
  { city: "Omaha", state: 'NE', x: 499.1, y: 246.5, costIndex: 91, rent: 1100 },
  { city: "Honolulu", state: 'HI', x: 267, y: 549.2, costIndex: 186, rent: 2300 },
  { city: "Anchorage", state: 'AK', x: 112.3, y: 544.3, costIndex: 124, rent: 1400 },
  { city: "Hartford", state: 'CT', x: 885.8, y: 187.1, costIndex: 113, rent: 1450 },
  { city: "Providence", state: 'RI', x: 906.1, y: 180.4, costIndex: 113, rent: 1750 },
  { city: "Buffalo", state: 'NY', x: 779.5, y: 183.8, costIndex: 95, rent: 1150 },
  { city: "Louisville", state: 'KY', x: 678.4, y: 305.5, costIndex: 90, rent: 1100 },
  { city: "Memphis", state: 'TN', x: 607.4, y: 382.9, costIndex: 86, rent: 1050 },
  { city: "Jacksonville", state: 'FL', x: 777.4, y: 475.2, costIndex: 96, rent: 1350 },
  { city: "Fort Worth", state: 'TX', x: 472.8, y: 440.9, costIndex: 98, rent: 1350 },
  { city: "Madison", state: 'WI', x: 606.7, y: 201.2, costIndex: 104, rent: 1450 },
  { city: "Ann Arbor", state: 'MI', x: 701.8, y: 209.9, costIndex: 113, rent: 1750 },
];

export const cityLabel = (c: City) => `${c.city}, ${c.state}`;

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

/** Common spellings that don't follow "City, ST". */
const ALIASES: Record<string, string> = {
  nyc: 'New York, NY',
  'new york city': 'New York, NY',
  manhattan: 'New York, NY',
  brooklyn: 'New York, NY',
  sf: 'San Francisco, CA',
  'san francisco bay area': 'San Francisco, CA',
  'bay area': 'San Francisco, CA',
  'washington dc': 'Washington, DC',
  'washington d.c.': 'Washington, DC',
  'washington, d.c.': 'Washington, DC',
  dc: 'Washington, DC',
  'saint louis': 'St. Louis, MO',
  'st louis': 'St. Louis, MO',
  philly: 'Philadelphia, PA',
};

const byLabel = new Map(CITIES.map((c) => [cityLabel(c).toLowerCase(), c]));
const byCity = new Map<string, City[]>();
for (const c of CITIES) {
  const k = c.city.toLowerCase();
  byCity.set(k, [...(byCity.get(k) ?? []), c]);
}

const cache = new Map<string, City | null>();

/**
 * Best-effort lookup of a free-text job location ("Austin, TX",
 * "Austin, Texas, United States", "NYC", "Remote - Boston, MA") to a known city.
 * Returns null for remote-only or unknown places.
 */
export function resolveCity(location: string | null | undefined): City | null {
  if (!location) return null;
  const key = location.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const found = lookup(key);
  cache.set(key, found);
  return found;
}

function lookup(raw: string): City | null {
  // Several locations ("Boston, MA; New York, NY"): use the first we know.
  for (const part of raw.split(/\s*(?:;|\||\/|\bor\b)\s*/)) {
    const hit = lookupOne(part);
    if (hit) return hit;
  }
  return null;
}

function lookupOne(raw: string): City | null {
  const s = raw
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/\b(remote|hybrid|on-?site|in office|metro(politan)? area|area|greater)\b/g, ' ')
    .replace(/[-–]/g, ',')
    .replace(/,?\s*(united states( of america)?|usa|us)\.?\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .trim();
  if (!s) return null;
  if (ALIASES[s]) return byLabel.get(ALIASES[s].toLowerCase()) ?? null;

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const city = parts[i]!;
    if (ALIASES[city]) return byLabel.get(ALIASES[city].toLowerCase()) ?? null;
    const next = parts[i + 1];
    const st = next ? (next.length === 2 ? next.toUpperCase() : STATES[next]) : undefined;
    if (st) {
      const hit = byLabel.get(`${city}, ${st}`.toLowerCase());
      if (hit) return hit;
    }
    const same = byCity.get(city);
    // A bare city name only counts when it's unambiguous.
    if (same?.length === 1 && (!st || same[0]!.state === st)) return same[0]!;
  }
  return null;
}
