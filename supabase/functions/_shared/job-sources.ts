// Fetch and normalize job listings from public job APIs.
// Runtime-agnostic (only uses fetch), like embeddings.ts, so it can be unit
// tested in Node and run in the import-jobs Edge Function.
//
// Terms we follow:
// - Adzuna: show "Jobs by Adzuna" attribution and send users to redirect_url.
// - Arbeitnow: link back to the listing (apply_url) and credit the source.
// - freehire.me: public, keyless aggregator API; link to the original posting
//   (its url, tagged utm_source=freehire.me) and credit freehire on the card.
// Remotive's public API is intentionally not used: its terms forbid showing
// listings behind a sign-up, which JobSwipe requires.

export type JobSource = 'adzuna' | 'arbeitnow' | 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'recruitee' | 'personio' | 'usajobs' | 'freehire';

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
  /** From the job board when it says; null lets the database derive it from the title. */
  employment_type: EmploymentType | null;
  workplace_type: WorkplaceType | null;
  /** Hourly pay from the board's salary field. With no salary at all, the database reads pay from the description. */
  hourly_min: number | null;
  hourly_max: number | null;
  /** Adzuna's own salary prediction (annual). Other sources leave these null and get a BLS estimate in the database. */
  est_pay_min: number | null;
  est_pay_max: number | null;
  est_pay_period: 'year' | null;
  est_pay_source: 'adzuna' | null;
}

export type EmploymentType = 'full_time' | 'part_time' | 'internship' | 'contract' | 'temporary';
export type WorkplaceType = 'onsite' | 'hybrid' | 'remote';

/** Maps a board's employment label ("Full-time", "FullTime", "Intern", "parttime") to ours. */
export function toEmploymentType(...labels: (string | null | undefined)[]): EmploymentType | null {
  for (const label of labels) {
    const l = label?.trim();
    if (!l) continue;
    if (/\b(intern(ship)?|co-?op|werkstudent|trainee)\b/i.test(l)) return 'internship';
    if (/part[\s_-]?time/i.test(l)) return 'part_time';
    if (/contract|freelance/i.test(l)) return 'contract';
    if (/\btemp(orary)?\b|seasonal/i.test(l)) return 'temporary';
    if (/full[\s_-]?time|permanent|regular/i.test(l)) return 'full_time';
  }
  return null;
}

/** Maps a board's workplace label ("OnSite", "hybrid", "Remote") to ours. */
export function toWorkplaceType(label: string | null | undefined): WorkplaceType | null {
  const l = label?.trim() ?? '';
  if (/hybrid/i.test(l)) return 'hybrid';
  if (/remote/i.test(l)) return 'remote';
  if (/on[\s_-]?site|in[\s_-]?office/i.test(l)) return 'onsite';
  return null;
}

function withTypes(job: ImportedJob | null, employment: EmploymentType | null, workplace: WorkplaceType | null): ImportedJob | null {
  if (job) { job.employment_type = employment; job.workplace_type = workplace; }
  return job;
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
  // Typographic entities job boards leave in descriptions ("$153,120&mdash;$196,750").
  mdash: '—', ndash: '–', minus: '−', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', eacute: 'é', egrave: 'è',
  aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
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
  // Adzuna predicts a salary when the ad has none: keep it, but as an estimate.
  const predicted = String(r.salary_is_predicted ?? '0') === '1';
  const [payMin, payMax] = normalizeSalary(r.salary_min, r.salary_max);
  const [salaryMin, salaryMax] = predicted ? [null, null] : [payMin, payMax];
  const estimated = predicted && (payMin != null || payMax != null);

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
    employment_type: null,
    workplace_type: null,
    hourly_min: null,
    hourly_max: null,
    est_pay_min: estimated ? payMin ?? payMax : null,
    est_pay_max: estimated ? payMax ?? payMin : null,
    est_pay_period: estimated ? 'year' : null,
    est_pay_source: estimated ? 'adzuna' : null,
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
    employment_type: null,
    workplace_type: 'remote',
    hourly_min: null, hourly_max: null, est_pay_min: null, est_pay_max: null, est_pay_period: null, est_pay_source: null,
  };
}

/** Keep the preferred provider, preserving the relative order of surviving jobs. */
export function dedupeJobs(jobs: ImportedJob[]): ImportedJob[] {
  const seen = new Set<string>();
  const unique = jobs.filter((j) => {
    const key = `${j.source}:${j.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // freehire aggregates employer boards, so a direct copy from the board wins.
  const priority: JobSource[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'personio', 'usajobs', 'freehire', 'arbeitnow', 'adzuna'];
  const winners = new Map<string, ImportedJob>();
  for (const job of unique) {
    const key = jobFingerprint(job);
    const previous = winners.get(key);
    if (!previous || priority.indexOf(job.source) < priority.indexOf(previous.source)) winners.set(key, job);
  }
  return unique.filter(job => winners.get(jobFingerprint(job)) === job);
}

// ---------- Shared ATS helpers ----------

export interface AtsOptions {
  earlyCareerOnly?: boolean;
  usOnly?: boolean;
  /**
   * Called with the external_id of every qualifying posting on the board's
   * index, including ones skipped by a detail-fetch cap. The importer uses it
   * to keep those listings alive instead of retiring them as unseen.
   */
  onListed?: (externalId: string) => void;
  /** Non-fatal problems (e.g. a detail page that failed after retries). */
  onWarning?: (message: string) => void;
}

// Only intern/internship overrides a senior word ("Senior Intern" is still an
// internship); "co-op" doesn't, so "Staff Analyst – Condo, Co-op Review" is out.
const INTERN = /\bintern\b|\binterns?hips?\b/i;
const SENIOR = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|vp)\b|\bhead of\b/i;
// Jobs *about* students or campuses ("University Recruiter") aren't student jobs.
const ABOUT_STUDENTS = /recruit|talent acquisition|professor|faculty|lecturer|instructor|teacher/i;
const EARLY = /\bintern\b|\binterns?hips?\b|\bco-?op\b|\bnew[ -]grad|\bentry[- _]level\b|\bjunior\b|\bjr\.?\b|apprentic|part[- _]?time|\bstudent|early[- _]career|university|campus|rotational|graduate|\bsummer (?:analyst|associate)\b/i;

export function isEarlyCareer(title: string, hints = ''): boolean {
  if ((SENIOR.test(title) || ABOUT_STUDENTS.test(title)) && !INTERN.test(title)) return false;
  return EARLY.test(`${title} ${hints}`);
}

const US_STATES = /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i;
const US_ABBREVIATIONS = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
const NON_US = /\b(?:UK|U\.?K\.?|United Kingdom|EMEA|Europe|European|EU|India|Canada|Canadian|LATAM|APAC|Germany|German|Australia|Australian|Asia|Africa|France|French|Spain|Netherlands|Ireland|Singapore|Brazil|Mexico|China|Japan|New Zealand|Middle East|South America|Latin America|Poland|Portugal|Italy|Sweden|Switzerland|Austria|Belgium|Denmark|Norway|Finland|Israel|Philippines|Pakistan|Bangladesh|Indonesia|Malaysia|Vietnam|Korea|Taiwan|Hong Kong|London|Berlin|Toronto|Vancouver)\b/i;

export function isUsOrRemote(location: string | null, opts: { remote?: boolean; country?: string | null } = {}): boolean {
  // A structured country field beats parsing the location string.
  const country = opts.country?.trim();
  if (country) return /^(us|usa|united states)$/i.test(country);
  const text = location?.trim() ?? '';
  if (/\bUnited States\b|\bUSA\b|\bU\.S\.(?:A\.)?|\bUS\b/i.test(text) || US_STATES.test(text)) return true;
  // Before the ", XX" check: "Barcelona, CT, Spain" is Catalonia, not Connecticut.
  if (NON_US.test(text)) return false;
  if (US_ABBREVIATIONS.test(text)) return true;
  if (!text) return true;
  return opts.remote === true || /\bremote\b|\banywhere\b/i.test(text);
}

export function jobFingerprint(j: ImportedJob): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const company = normalize(j.company_name).replace(/\b(?:inc|llc|ltd|corp|gmbh)\b/g, '').trim().replace(/\s+/g, ' ');
  return `${company}|${normalize(j.title)}|${normalize((j.location ?? '').split(/[,;|]/)[0])}`;
}

// Context is supplied separately from the URL so credentials never appear in errors.
export interface JobRequestInit extends RequestInit { provider?: string; company?: string; timeoutMs?: number }

export class JobRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// Retries for rate limits (429) and server errors (5xx). Kept small: runs share
// one Edge Function time budget, so a dead API must not eat the whole run.
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter == null ? NaN : Number(retryAfter);
  const hinted = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
  const backoff = 500 * 2 ** attempt + Math.random() * 250;
  return Math.min(Number.isFinite(hinted) && hinted >= 0 ? hinted : backoff, MAX_RETRY_WAIT_MS);
}

export async function fetchText(url: string, init: JobRequestInit = {}): Promise<string> {
  // The timeout also covers reading the body, so large boards need more time.
  const { provider = 'Jobs', company = '', timeoutMs = 15000, ...request } = init;
  const headers = new Headers(request.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'text/plain, application/xml, text/xml');
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...request, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      // Network errors and timeouts: retry, then report without the URL.
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }
      throw new JobRequestError(`${provider} ${company} request failed (${(e as Error).name})`);
    }
    if (response.ok) return response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      await response.body?.cancel();
      await sleep(retryDelayMs(attempt, response.headers.get('Retry-After')));
      continue;
    }
    throw new JobRequestError(`${provider} ${company} request failed (${response.status})`, response.status);
  }
}

export async function fetchJson<T = unknown>(url: string, init: JobRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return JSON.parse(await fetchText(url, { ...init, headers })) as T;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function prettify(company: string): string {
  return company.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function eligible(title: string, hints: string, location: string | null, remote: boolean, country: string | null | undefined, opts: AtsOptions): boolean {
  // German-language ads ("(m/w/d)") match English profiles poorly; same rule as Arbeitnow.
  return !!title.trim() && !GERMAN_AD.test(title) &&
    (opts.earlyCareerOnly === false || isEarlyCareer(title, hints)) &&
    (opts.usOnly === false || isUsOrRemote(location, { remote, country }));
}

function makeJob(source: JobSource, company: string, id: string | number | undefined, title: string, url: string | undefined,
  description: string, location: string | null, remote: boolean, companyName?: string,
  salary: [number | null, number | null] = [null, null]): ImportedJob | null {
  if (id == null || id === '' || !title.trim() || !url) return null;
  return {
    source, external_id: `${company}:${id}`, apply_url: url, title: title.trim(),
    company_name: companyName?.trim() || prettify(company), description, location,
    is_remote: remote, salary_min: salary[0], salary_max: salary[1],
    required_skills: extractSkills(`${title}\n${description}`),
    employment_type: null, workplace_type: null,
    hourly_min: null, hourly_max: null, est_pay_min: null, est_pay_max: null, est_pay_period: null, est_pay_source: null,
  };
}

function add(jobs: ImportedJob[], job: ImportedJob | null): void { if (job) jobs.push(job); }
function annual(interval?: string): boolean { return /^(?:annual(?:ly)?|year(?:ly)?|per[- ]year(?:-salary)?|1 year)$/i.test(interval?.trim() ?? ''); }
function hourly(interval?: string): boolean { return /^(?:hour(?:ly)?|per[- ]hour(?:-wage)?|1 hour)$/i.test(interval?.trim() ?? ''); }

/** Hourly rates from a board's salary field; drops implausible values and inverted ranges. */
export function normalizeHourly(min: unknown, max: unknown): [number | null, number | null] {
  const clean = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 7 && n <= 300 ? Math.round(n * 100) / 100 : null;
  };
  let lo = clean(min);
  let hi = clean(max);
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

function withHourly(job: ImportedJob | null, [lo, hi]: [number | null, number | null]): ImportedJob | null {
  if (job) { job.hourly_min = lo; job.hourly_max = hi; }
  return job;
}

// ---------- Greenhouse ----------
export interface GreenhouseResult {
  id: string | number; title: string; absolute_url?: string; location?: { name?: string };
  content?: string; company_name?: string; metadata?: { name?: string; value?: unknown }[];
}
export function normalizeGreenhouse(r: GreenhouseResult, company: string, opts: AtsOptions = {}): ImportedJob | null {
  const location = r.location?.name?.trim() || null;
  const remote = /remote/i.test(`${location ?? ''} ${r.title}`);
  const hints = (r.metadata ?? []).map(m => typeof m.value === 'string' ? m.value : Array.isArray(m.value) ? m.value.join(' ') : '').join(' ');
  if (!eligible(r.title, hints, location, remote, undefined, opts)) return null;
  return makeJob('greenhouse', company, r.id, r.title, r.absolute_url, htmlToText(decodeEntities(r.content ?? '')), location, remote, r.company_name);
}
const GREENHOUSE_MAX_DETAILS = 60;

/**
 * Lists the board without descriptions (?content=true is 32 MB for SpaceX,
 * which blows the Edge Function CPU limit), filters on title/location/metadata,
 * then fetches the description only for the jobs that pass.
 */
export async function fetchGreenhouse(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs`;
  const body = await fetchJson<{ jobs?: GreenhouseResult[] }>(base, { provider: 'Greenhouse', company, timeoutMs: 30000 });
  const qualifying = (body.jobs ?? [])
    .filter(r => normalizeGreenhouse({ ...r, content: '' }, company, opts) !== null);
  // Every qualifying posting is still live, even the ones past the detail cap.
  for (const r of qualifying) opts.onListed?.(`${company}:${r.id}`);
  const matches = qualifying.slice(0, GREENHOUSE_MAX_DETAILS);
  const jobs: ImportedJob[] = [];
  let failed = 0;
  for (const r of matches) {
    try {
      const detail = await fetchJson<GreenhouseResult>(`${base}/${encodeURIComponent(String(r.id))}`, { provider: 'Greenhouse', company });
      add(jobs, normalizeGreenhouse({ ...r, content: detail.content }, company, opts));
    } catch (e) {
      // 404: the posting closed between the list and detail calls. Anything
      // else (after retries) is worth surfacing, but shouldn't sink the board.
      if (!(e instanceof JobRequestError && e.status === 404)) failed++;
    }
  }
  if (failed) opts.onWarning?.(`greenhouse ${company}: ${failed}/${matches.length} detail requests failed`);
  return jobs;
}

// ---------- Lever ----------
export interface LeverResult {
  id: string; text: string; hostedUrl?: string; applyUrl?: string; company_name?: string;
  categories?: { location?: string; commitment?: string; team?: string; allLocations?: string[] };
  workplaceType?: string; country?: string; descriptionPlain?: string;
  lists?: { text?: string; content?: string }[]; additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; interval?: string };
}
export function normalizeLever(r: LeverResult, company: string, opts: AtsOptions = {}): ImportedJob | null {
  const location = r.categories?.allLocations?.join('; ') || r.categories?.location?.trim() || null;
  const remote = r.workplaceType === 'remote' || /remote/i.test(`${location ?? ''} ${r.text}`);
  if (!eligible(r.text, r.categories?.commitment ?? '', location, remote, r.country, opts)) return null;
  const description = [r.descriptionPlain, ...(r.lists ?? []).map(l => `${l.text ?? ''}\n${htmlToText(l.content ?? '')}`), r.additionalPlain].filter(Boolean).join('\n\n').slice(0, MAX_DESCRIPTION_CHARS);
  const salary = r.salaryRange;
  return withHourly(withTypes(makeJob('lever', company, r.id, r.text, r.hostedUrl, description, location, remote, r.company_name,
    annual(salary?.interval) ? normalizeSalary(salary?.min, salary?.max) : [null, null]),
    toEmploymentType(r.categories?.commitment), toWorkplaceType(r.workplaceType)),
    hourly(salary?.interval) ? normalizeHourly(salary?.min, salary?.max) : [null, null]);
}
export async function fetchLever(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const jobs: ImportedJob[] = [];
  for (let page = 0; page < 10; page++) {
    const rows = await fetchJson<LeverResult[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json&skip=${page * 100}&limit=100`, { provider: 'Lever', company, timeoutMs: 45000 });
    for (const row of rows) add(jobs, normalizeLever(row, company, opts));
    if (rows.length < 100) break;
  }
  return jobs;
}

// ---------- Ashby ----------
export interface AshbyResult {
  id: string; title: string; location?: string; secondaryLocations?: { location?: string }[];
  isRemote?: boolean; workplaceType?: string; employmentType?: string; isListed?: boolean;
  jobUrl?: string; applyUrl?: string; descriptionPlain?: string; descriptionHtml?: string; company_name?: string;
  address?: { postalAddress?: { addressCountry?: string } };
  compensation?: { summaryComponents?: { compensationType?: string; interval?: string; minValue?: number; maxValue?: number }[] };
}
export function normalizeAshby(r: AshbyResult, company: string, opts: AtsOptions = {}): ImportedJob | null {
  if (r.isListed === false) return null;
  const location = [r.location, ...(r.secondaryLocations ?? []).map(l => l.location)].filter(Boolean).join('; ') || null;
  const remote = r.isRemote === true || /^remote$/i.test(r.workplaceType ?? '') || /remote/i.test(`${location ?? ''} ${r.title}`);
  if (!eligible(r.title, r.employmentType ?? '', location, remote, r.address?.postalAddress?.addressCountry, opts)) return null;
  const salary = r.compensation?.summaryComponents?.find(c => c.compensationType === 'Salary' && annual(c.interval));
  const wage = r.compensation?.summaryComponents?.find(c => c.compensationType === 'Salary' && hourly(c.interval));
  return withHourly(withTypes(makeJob('ashby', company, r.id, r.title, r.jobUrl, r.descriptionPlain?.slice(0, MAX_DESCRIPTION_CHARS) || htmlToText(r.descriptionHtml ?? ''), location, remote, r.company_name,
    salary ? normalizeSalary(salary.minValue, salary.maxValue) : [null, null]),
    toEmploymentType(r.employmentType), toWorkplaceType(r.workplaceType) ?? (r.isRemote === true ? 'remote' : null)),
    wage ? normalizeHourly(wage.minValue, wage.maxValue) : [null, null]);
}
export async function fetchAshby(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const body = await fetchJson<{ jobs?: AshbyResult[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}?includeCompensation=true`, { provider: 'Ashby', company });
  return (body.jobs ?? []).map(r => normalizeAshby(r, company, opts)).filter((j): j is ImportedJob => j !== null);
}

// ---------- SmartRecruiters ----------
export interface SmartRecruitersResult {
  id: string; name: string; location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  experienceLevel?: { id?: string; label?: string }; typeOfEmployment?: { label?: string };
  company?: { name?: string; identifier?: string }; postingUrl?: string;
  jobAd?: { sections?: { companyDescription?: { text?: string }; jobDescription?: { text?: string }; qualifications?: { text?: string }; additionalInformation?: { text?: string } } };
}
function smartFields(r: SmartRecruitersResult) {
  const l = r.location;
  const location = l?.fullLocation || [l?.city, l?.region, l?.country].filter(Boolean).join(', ') || null;
  return { location, remote: l?.remote === true || /remote/i.test(`${location ?? ''} ${r.name}`), hints: `${r.experienceLevel?.id ?? ''} ${r.experienceLevel?.label ?? ''} ${r.typeOfEmployment?.label ?? ''}` };
}
export function normalizeSmartRecruiters(r: SmartRecruitersResult, company: string, opts: AtsOptions = {}): ImportedJob | null {
  const { location, remote, hints } = smartFields(r);
  if (!eligible(r.name, hints, location, remote, r.location?.country, opts)) return null;
  const sections = r.jobAd?.sections;
  const description = htmlToText([sections?.companyDescription?.text, sections?.jobDescription?.text, sections?.qualifications?.text, sections?.additionalInformation?.text].filter(Boolean).join('\n\n'));
  return withTypes(makeJob('smartrecruiters', company, r.id, r.name, r.postingUrl || `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(r.id)}`, description, location, remote, r.company?.name),
    toEmploymentType(r.typeOfEmployment?.label), r.location?.hybrid === true ? 'hybrid' : r.location?.remote === true ? 'remote' : null);
}
export async function fetchSmartRecruiters(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const jobs: ImportedJob[] = [];
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`;
  const seen = new Set<string>();
  let details = 0;
  for (let page = 0; page < 10; page++) {
    const body = await fetchJson<{ totalFound?: number; content?: SmartRecruitersResult[] }>(`${base}?limit=100&offset=${page * 100}`, { provider: 'SmartRecruiters', company });
    const rows = body.content ?? [];
    for (const row of rows) {
      const { location, remote, hints } = smartFields(row);
      if (seen.has(row.id) || !eligible(row.name, hints, location, remote, row.location?.country, opts)) continue;
      seen.add(row.id);
      opts.onListed?.(`${company}:${row.id}`);
      // Past the detail cap, keep paging so every live posting is reported as
      // listed, but don't fetch more descriptions.
      if (details >= 40) continue;
      details++;
      const detail = await fetchJson<Partial<SmartRecruitersResult>>(`${base}/${encodeURIComponent(row.id)}`, { provider: 'SmartRecruiters', company });
      add(jobs, normalizeSmartRecruiters({ ...row, ...detail }, company, opts));
    }
    if (!rows.length || (body.totalFound != null ? (page + 1) * 100 >= body.totalFound : rows.length < 100)) break;
  }
  return jobs;
}

// ---------- Recruitee ----------
export interface RecruiteeResult {
  id: string | number; slug?: string; title: string; status?: string; company_name?: string;
  location?: string; city?: string; country?: string; country_code?: string; remote?: boolean; hybrid?: boolean;
  careers_url?: string; description?: string; requirements?: string; employment_type_code?: string; experience_code?: string;
  salary?: { min?: number; max?: number; period?: string };
}
export function normalizeRecruitee(r: RecruiteeResult, company: string, opts: AtsOptions = {}): ImportedJob | null {
  if (r.status && r.status !== 'published') return null;
  const location = r.location || [r.city, r.country].filter(Boolean).join(', ') || null;
  const remote = r.remote === true || /remote/i.test(`${location ?? ''} ${r.title}`);
  if (!eligible(r.title, `${r.employment_type_code ?? ''} ${r.experience_code ?? ''}`, location, remote, r.country_code || r.country, opts)) return null;
  return withHourly(withTypes(makeJob('recruitee', company, r.id, r.title, r.careers_url || (r.slug ? `https://${company}.recruitee.com/o/${encodeURIComponent(r.slug)}` : undefined), htmlToText(`${r.description ?? ''}\n${r.requirements ?? ''}`), location, remote, r.company_name,
    annual(r.salary?.period) ? normalizeSalary(r.salary?.min, r.salary?.max) : [null, null]),
    toEmploymentType(r.employment_type_code), r.hybrid === true ? 'hybrid' : r.remote === true ? 'remote' : null),
    hourly(r.salary?.period) ? normalizeHourly(r.salary?.min, r.salary?.max) : [null, null]);
}
export async function fetchRecruitee(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const body = await fetchJson<{ offers?: RecruiteeResult[] }>(`https://${encodeURIComponent(company)}.recruitee.com/api/offers/`, { provider: 'Recruitee', company });
  return (body.offers ?? []).map(r => normalizeRecruitee(r, company, opts)).filter((j): j is ImportedJob => j !== null);
}

// ---------- Personio (no DOM or runtime-specific XML dependencies) ----------
function xmlTag(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i').exec(xml)?.[1] ?? '';
}
function xmlText(value: string): string {
  // CDATA is already literal; decode only text outside CDATA sections.
  return value.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map(part => part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeEntities(part)).join('').trim();
}
export function normalizePersonio(positionXml: string, company: string, opts: AtsOptions = {}): ImportedJob | null {
  const field = (name: string) => xmlText(xmlTag(positionXml, name));
  const title = field('name');
  const location = field('office') || null;
  const remote = /remote/i.test(`${location ?? ''} ${title}`);
  if (!eligible(title, `${field('seniority')} ${field('employmentType')} ${field('schedule')}`, location, remote, undefined, opts)) return null;
  const descriptions = xmlTag(positionXml, 'jobDescriptions').match(/<jobDescription\b[^>]*>[\s\S]*?<\/jobDescription\s*>/gi) ?? [];
  const description = htmlToText(descriptions.map(d => `${xmlText(xmlTag(d, 'name'))}\n${xmlText(xmlTag(d, 'value'))}`).join('\n\n'));
  const id = field('id');
  return withTypes(makeJob('personio', company, id, title, id ? `https://${company}.jobs.personio.de/job/${encodeURIComponent(id)}` : undefined, description, location, remote, field('subcompany')),
    toEmploymentType(field('employmentType'), field('schedule')), null);
}
export async function fetchPersonio(company: string, opts: AtsOptions = {}): Promise<ImportedJob[]> {
  const xml = await fetchText(`https://${encodeURIComponent(company)}.jobs.personio.de/xml?language=en`, { provider: 'Personio', company });
  const jobs: ImportedJob[] = [];
  for (const match of xml.matchAll(/<position\b[^>]*>([\s\S]*?)<\/position\s*>/gi)) add(jobs, normalizePersonio(match[1], company, opts));
  return jobs;
}

// ---------- USAJOBS ----------
export interface UsaJobsOptions { apiKey: string; userAgentEmail: string; keywords?: string[]; pages?: number }
export interface UsaJobsResult {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string; PositionURI?: string; ApplyURI?: string[]; OrganizationName?: string; DepartmentName?: string;
    PositionLocationDisplay?: string; PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    QualificationSummary?: string; UserArea?: { Details?: { JobSummary?: string } };
  };
}
export function normalizeUsaJobs(r: UsaJobsResult, hiringPath = false): ImportedJob | null {
  const d = r.MatchedObjectDescriptor;
  if (!hiringPath && !isEarlyCareer(d.PositionTitle)) return null;
  const location = d.PositionLocationDisplay || null;
  const remote = /remote|anywhere/i.test(`${location ?? ''} ${d.PositionTitle}`);
  const salary = d.PositionRemuneration?.find(s => s.RateIntervalCode === 'PA');
  const job = makeJob('usajobs', '', r.MatchedObjectId, d.PositionTitle, d.PositionURI,
    htmlToText(`${d.UserArea?.Details?.JobSummary ?? ''}\n${d.QualificationSummary ?? ''}`), location, remote,
    d.OrganizationName || d.DepartmentName || 'US Government', salary ? normalizeSalary(salary.MinimumRange, salary.MaximumRange) : [null, null]);
  if (job) job.external_id = r.MatchedObjectId;
  return job;
}
export async function fetchUsaJobs(opts: UsaJobsOptions): Promise<ImportedJob[]> {
  const jobs: ImportedJob[] = [];
  const pages = Math.max(0, Math.floor(opts.pages ?? 1));
  for (const keyword of opts.keywords ?? ['intern', 'student trainee', 'recent graduate']) {
    for (const hiringPath of [true, false]) {
      for (let page = 1; page <= pages; page++) {
        const params = new URLSearchParams({ Keyword: keyword, ResultsPerPage: '250', Page: String(page) });
        if (hiringPath) params.set('HiringPath', 'student;graduates');
        const body = await fetchJson<{ SearchResult?: { SearchResultCountAll?: string | number; SearchResultItems?: UsaJobsResult[] } }>(`https://data.usajobs.gov/api/search?${params}`, {
          provider: 'USAJOBS', company: 'US Government', headers: { Host: 'data.usajobs.gov', 'User-Agent': opts.userAgentEmail, 'Authorization-Key': opts.apiKey },
        });
        const result = body.SearchResult;
        const rows = result?.SearchResultItems ?? [];
        for (const row of rows) add(jobs, normalizeUsaJobs(row, hiringPath));
        if (!rows.length || (result?.SearchResultCountAll != null ? page * 250 >= Number(result.SearchResultCountAll) : rows.length < 250)) break;
      }
    }
  }
  return dedupeJobs(jobs);
}

// ---------- freehire.me ----------
// Aggregator of ~50 ATS platforms behind one public JSON API (no key). The
// /agent/ search endpoint returns full descriptions, so one request per page.
// Seniority, employment type and salary come from freehire's own enrichment.
export interface FreehireOptions extends AtsOptions {
  /** Search terms; sent 5 per request (the API's OR limit). */
  keywords?: string[];
  /** Lowercase ISO-3166 alpha-2 codes. Default ['us'] unless usOnly is false. */
  countries?: string[];
  postedWithinDays?: number;
  /** Pages of 100 per request. Default 3, max 10. */
  pages?: number;
  /** Self-hosted instance; default https://freehire.me. */
  baseUrl?: string;
}
export interface FreehireResult {
  public_slug: string; url?: string; title?: string; company?: string; location?: string | null;
  description?: string; countries?: string[]; skills?: string[]; work_mode?: string | null; closed_at?: string | null;
  enrichment?: {
    seniority?: string | null; employment_type?: string | null; posting_language?: string | null;
    salary_min?: number | null; salary_max?: number | null; salary_currency?: string | null; salary_period?: string | null;
  } | null;
}
export const FREEHIRE_DEFAULT_KEYWORDS = ['data analyst', 'data engineer', 'data scientist', 'analytics engineer', 'business intelligence'];
const FREEHIRE_PAGE_SIZE = 100;

export function normalizeFreehire(r: FreehireResult, opts: AtsOptions = {}): ImportedJob | null {
  if (r.closed_at) return null;
  const e = r.enrichment ?? {};
  if (e.posting_language && e.posting_language !== 'en') return null;
  const title = htmlToText(r.title ?? '');
  const location = r.location?.trim() || null;
  const workplace = toWorkplaceType(r.work_mode);
  const remote = workplace === 'remote' || /\bremote\b/i.test(`${location ?? ''} ${title}`);
  const countries = r.countries ?? [];
  const country = countries.includes('us') ? 'us' : countries[0];
  // freehire's seniority tag ("junior", "intern") is the early-career signal:
  // titles like "Data Analyst I" carry no keyword the title check would see.
  if (!eligible(title, `${e.seniority ?? ''} ${e.employment_type ?? ''}`, location, remote, country, opts)) return null;

  const usd = !e.salary_currency || /^usd$/i.test(e.salary_currency);
  const period = e.salary_period ?? null;
  // A missing period is common; the annual/hourly normalizers' ranges tell them apart.
  const salary = usd && (period == null || annual(period)) ? normalizeSalary(e.salary_min, e.salary_max) : [null, null] as [null, null];
  const wage = usd && (period == null || hourly(period)) ? normalizeHourly(e.salary_min, e.salary_max) : [null, null] as [null, null];
  const skillHints = (r.skills ?? []).map(s => s.replace(/-/g, ' ')).join(', ');
  const job = makeJob('freehire', '', r.public_slug, title, r.url, htmlToText(r.description ?? ''), location, remote,
    r.company?.trim() || 'Unknown company', salary);
  if (!job) return null;
  job.external_id = r.public_slug;
  job.required_skills = extractSkills(`${title}\n${skillHints}\n${job.description}`);
  return withHourly(withTypes(job, toEmploymentType(e.employment_type), workplace), wage);
}

export async function fetchFreehire(opts: FreehireOptions = {}): Promise<ImportedJob[]> {
  const base = (opts.baseUrl ?? 'https://freehire.me').replace(/\/+$/, '');
  const keywords = (opts.keywords?.length ? opts.keywords : FREEHIRE_DEFAULT_KEYWORDS)
    // A literal "OR" inside a term would add alternatives past the API's limit of 5.
    .map(k => k.replace(/\bOR\b/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const countries = opts.countries ?? (opts.usOnly === false ? [] : ['us']);
  const pages = Math.min(10, Math.max(1, Math.floor(opts.pages ?? 3)));
  const jobs: ImportedJob[] = [];
  for (let i = 0; i < keywords.length; i += 5) {
    const q = keywords.slice(i, i + 5).join(' OR ');
    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        q, limit: String(FREEHIRE_PAGE_SIZE), offset: String(page * FREEHIRE_PAGE_SIZE),
        description_format: 'text', posted_within_days: String(opts.postedWithinDays ?? 30),
      });
      for (const c of countries) params.append('countries', c.toLowerCase());
      if (opts.earlyCareerOnly !== false) for (const s of ['intern', 'junior']) params.append('seniority', s);
      const body = await fetchJson<{ data?: FreehireResult[]; meta?: { total?: number } }>(
        `${base}/api/v1/agent/jobs/search?${params}`, { provider: 'freehire', company: 'search', timeoutMs: 30000 });
      const rows = body.data ?? [];
      for (const row of rows) add(jobs, normalizeFreehire(row, opts));
      const total = body.meta?.total;
      if (rows.length < FREEHIRE_PAGE_SIZE || (total != null && (page + 1) * FREEHIRE_PAGE_SIZE >= total)) break;
    }
  }
  return dedupeJobs(jobs);
}
