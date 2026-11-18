// BEA 2024 Regional Price Parities, all items (U.S. = 100), released February 19, 2026.
// https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area
// Values retrieved from FRED's <ST>RPPALL series, e.g. https://fred.stlouisfed.org/series/PARPPALL

export const RPP_YEAR: number = 2024;

export const STATE_RPP: Readonly<Record<string, number>> = {
  AK: 102.4,
  AL: 88.8,
  AR: 86.9,
  AZ: 100.7,
  CA: 110.7,
  CO: 103.1,
  CT: 103.6,
  DC: 109.9,
  DE: 99.8,
  FL: 103.4,
  GA: 96.3,
  HI: 110.0,
  IA: 87.8,
  ID: 95.5,
  IL: 100.0,
  IN: 93.3,
  KS: 90.1,
  KY: 90.2,
  LA: 88.2,
  MA: 105.8,
  MD: 105.0,
  ME: 97.0,
  MI: 96.2,
  MN: 98.6,
  MO: 90.8,
  MS: 87.0,
  MT: 94.6,
  NC: 94.3,
  ND: 89.0,
  NE: 90.1,
  NH: 104.2,
  NJ: 108.8,
  NM: 92.2,
  NV: 100.0,
  NY: 107.9,
  OH: 92.8,
  OK: 87.8,
  OR: 103.4,
  PA: 97.6,
  RI: 102.3,
  SC: 93.7,
  SD: 88.6,
  TN: 91.9,
  TX: 97.1,
  UT: 98.9,
  VA: 101.1,
  VT: 98.0,
  WA: 107.0,
  WI: 94.1,
  WV: 89.5,
  WY: 92.7,
};

// States with no state income tax on wages in 2025.
// https://taxfoundation.org/data/all/state/state-income-tax-rates/
export const NO_WAGE_TAX_STATES: ReadonlySet<string> = new Set([
  'AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY',
]);

const stateCodesByName: Readonly<Record<string, string>> = {
  alaska: 'AK',
  alabama: 'AL',
  arkansas: 'AR',
  arizona: 'AZ',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  'district of columbia': 'DC',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  iowa: 'IA',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  massachusetts: 'MA',
  maryland: 'MD',
  maine: 'ME',
  michigan: 'MI',
  minnesota: 'MN',
  missouri: 'MO',
  mississippi: 'MS',
  montana: 'MT',
  'north carolina': 'NC',
  'north dakota': 'ND',
  nebraska: 'NE',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  nevada: 'NV',
  'new york': 'NY',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  virginia: 'VA',
  vermont: 'VT',
  washington: 'WA',
  wisconsin: 'WI',
  'west virginia': 'WV',
  wyoming: 'WY',
};

const stateNamePattern = Object.keys(stateCodesByName).join('|');
const stateCodePattern = Object.keys(STATE_RPP).join('|');
const stateTokenPattern = new RegExp(
  String.raw`\b(${stateNamePattern}|d\.c)\b|(?:^|[,\s])(${stateCodePattern})(?=$|[,\s])`,
  'gi',
);

export function stateFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;

  let state: string | null = null;
  for (const [, name, code] of location.matchAll(stateTokenPattern)) {
    if (name) {
      const normalizedName = name.toLowerCase();
      state = normalizedName === 'd.c' ? 'DC' : stateCodesByName[normalizedName];
    } else if (code === code.toUpperCase()) {
      state = code;
    }
  }
  return state;
}

export interface ColAdjusted {
  state: string;
  rpp: number;
  adjusted: number;
}

export function adjustForCostOfLiving(
  annualPay: number,
  location: string | null | undefined,
): ColAdjusted | null {
  const state = stateFromLocation(location);
  if (state === null) return null;

  const rpp = STATE_RPP[state];
  const adjusted = Math.round(annualPay / rpp) * 100;
  return { state, rpp, adjusted };
}
