// Fetch and normalize job listings from public job APIs.
// Runtime-agnostic (only uses fetch), like embeddings.ts, so it can be unit
// tested in Node and run in the import-jobs Edge Function.
//
// Terms we follow:
// - Adzuna: show "Jobs by Adzuna" attribution and send users to redirect_url.
// - Arbeitnow: link back to the listing (apply_url) and credit the source.
// Remotive's public API is intentionally not used: its terms forbid showing
// listings behind a sign-up, which JobSwipe requires.

export type JobSource = 'adzuna' | 'arbeitnow';

export interface ImportedJob {
  source: JobSource;
  external_id: string;
  apply_url: string;
  title: string;
  company_name: string;
  description: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  required_skills: string[];
}

const MAX_DESCRIPTION_CHARS = 5000;

// Canonical skill names match the app's SKILL_OPTIONS so imported jobs
// highlight the same tags a candidate picked during onboarding.
const SKILL_PATTERNS: [string, RegExp][] = [
  ['React Native', /\breact[\s-]?native\b/i],
  ['React', /\breact(?:\.?js)?\b(?![\s-]?native)/i],
  ['Next.js', /\bnext\.?js\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b|\bes6\b/i],
  ['Node.js', /\bnode(?:\.?js)?\b/i],
  ['Python', /\bpython\b/i],
  ['Go', /\bgolang\b|\bgo (?:developer|engineer)\b/i],
  ['Rust', /\brust\b/i],
  ['Java', /\bjava\b(?!\s?script)/i],
  ['Kotlin', /\bkotlin\b/i],
  ['Swift', /\bswift(?:ui)?\b/i],
  ['C#', /(?:^|[^\w])c#(?![\w])|\.net\b/i],
  ['SQL', /\bsql\b/i],
  ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
  ['GraphQL', /\bgraphql\b/i],
  ['AWS', /\baws\b|\bamazon web services\b/i],
  ['Azure', /\bazure\b/i],
  ['Docker', /\bdocker\b/i],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['Figma', /\bfigma\b/i],
  ['UI/UX', /\bui\s?\/\s?ux\b|\bux design|\buser experience\b/i],
  ['Product Management', /\bproduct manag(?:er|ement)\b/i],
  ['Machine Learning', /\bmachine learning\b|\bml engineer|\bdeep learning\b/i],
  ['Data Analysis', /\bdata analy(?:st|sis|tics)\b/i],
  ['DevOps', /\bdevops\b|\bci\/cd\b/i],
  ['Excel', /\bexcel\b/i],
  ['Tableau', /\btableau\b/i],
  ['Power BI', /\bpower ?bi\b/i],
];

export function extractSkills(text: string, max = 10): string[] {
  return SKILL_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name).slice(0, max);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

/** Strip HTML to readable plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DESCRIPTION_CHARS);
}

/** Annual salaries only; drops hourly/daily figures and inverted ranges. */
export function normalizeSalary(min: unknown, max: unknown): [number | null, number | null] {
  const clean = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 10_000 ? Math.round(n) : null;
  };
  let lo = clean(min);
  let hi = clean(max);
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

// ---------- Adzuna ----------

export interface AdzunaOptions {
  appId: string;
  appKey: string;
  country?: string; // ISO code: us, gb, ca, ...
  what: string;
  where?: string;
  resultsPerPage?: number;
  maxDaysOld?: number;
}

interface AdzunaResult {
  id: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
}

export async function fetchAdzuna(opts: AdzunaOptions): Promise<ImportedJob[]> {
  const params = new URLSearchParams({
    app_id: opts.appId,
    app_key: opts.appKey,
    results_per_page: String(opts.resultsPerPage ?? 50),
    max_days_old: String(opts.maxDaysOld ?? 30),
    what: opts.what,
    'content-type': 'application/json',
  });
  if (opts.where) params.set('where', opts.where);

  const url = `https://api.adzuna.com/v1/api/jobs/${opts.country ?? 'us'}/search/1?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    // Never echo the URL: it contains the app key.
    throw new Error(`Adzuna request failed (${res.status}) for "${opts.what}"`);
  }
  const body = (await res.json()) as { results?: AdzunaResult[] };
  return (body.results ?? []).map(normalizeAdzuna).filter((j): j is ImportedJob => j !== null);
}

export function normalizeAdzuna(r: AdzunaResult): ImportedJob | null {
  const title = htmlToText(r.title ?? '');
  if (!r.id || !title || !r.redirect_url) return null;

  const description = htmlToText(r.description ?? '');
  const location = r.location?.display_name?.trim() || null;
  const isRemote = /\bremote\b/i.test(`${title} ${location ?? ''}`);
  // Adzuna estimates salaries when the ad has none; only keep real ones.
  const predicted = String(r.salary_is_predicted ?? '0') === '1';
  const [salaryMin, salaryMax] = predicted ? [null, null] : normalizeSalary(r.salary_min, r.salary_max);

  return {
    source: 'adzuna',
    external_id: String(r.id),
    apply_url: r.redirect_url,
    title,
    company_name: r.company?.display_name?.trim() || 'Unknown company',
    description,
    location,
    is_remote: isRemote,
    salary_min: salaryMin,
    salary_max: salaryMax,
    required_skills: extractSkills(`${title}\n${description}`),
  };
}

// ---------- Arbeitnow ----------

interface ArbeitnowResult {
  slug: string;
  title?: string;
  company_name?: string;
  description?: string;
  url?: string;
  remote?: boolean;
  location?: string;
  tags?: string[];
}

// German-language ads ("Entwickler (m/w/d)") don't match English profiles well.
const GERMAN_AD = /\((?:m|w|f|d)\s*\/\s*(?:m|w|f|d)(?:\s*\/\s*(?:m|w|f|d|x))?\)|\b(?:und|für|mit|wir suchen)\b/i;

export async function fetchArbeitnow({ pages = 5 }: { pages?: number } = {}): Promise<ImportedJob[]> {
  const jobs: ImportedJob[] = [];
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Arbeitnow request failed (${res.status})`);
    const body = (await res.json()) as { data?: ArbeitnowResult[] };
    for (const r of body.data ?? []) {
      const job = normalizeArbeitnow(r);
      if (job) jobs.push(job);
    }
  }
  return jobs;
}

/** Remote, English-language listings only. */
export function normalizeArbeitnow(r: ArbeitnowResult): ImportedJob | null {
  const title = htmlToText(r.title ?? '');
  if (!r.slug || !title || !r.url || !r.remote) return null;

  const description = htmlToText(r.description ?? '');
  if (GERMAN_AD.test(title) || GERMAN_AD.test(description.slice(0, 400))) return null;

  return {
    source: 'arbeitnow',
    external_id: r.slug,
    apply_url: r.url,
    title,
    company_name: r.company_name?.trim() || 'Unknown company',
    description,
    location: r.location?.trim() || null,
    is_remote: true,
    salary_min: null,
    salary_max: null,
    required_skills: extractSkills(`${title}\n${(r.tags ?? []).join(', ')}\n${description}`),
  };
}

/** Keep the first copy of each (source, external_id). */
export function dedupeJobs(jobs: ImportedJob[]): ImportedJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const key = `${j.source}:${j.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
