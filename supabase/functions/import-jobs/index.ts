// Edge Function: POST /functions/v1/import-jobs
// Pulls real listings from public job APIs into public.jobs, embeds them, and
// turns off listings that have dropped out of the feeds.
//
// Called by a daily Supabase Cron job (see README), or by hand:
//   curl -X POST https://<ref>.supabase.co/functions/v1/import-jobs \
//     -H "x-import-secret: $IMPORT_SECRET" -H "content-type: application/json" \
//     -d '{"sources":["adzuna"],"what":["data analyst"],"where":"Charlotte, NC"}'
//
// Body (all optional):
//   sources  which feeds to pull. Default: ["adzuna", "arbeitnow"] (whichever
//            are configured). Also available: "greenhouse", "lever", "ashby",
//            "smartrecruiters", "recruitee", "personio" (employer job boards;
//            internships / entry-level / part-time roles in the US or remote)
//            "usajobs" (needs USAJOBS_API_KEY + USAJOBS_EMAIL secrets) and
//            "freehire" (freehire.me aggregator, no key; intern / junior US
//            roles matching `keywords`).
//            Pull employer boards in their own scheduled runs: fetching all of
//            them in one call can exceed the Edge Function time limit.
//   companies  override board tokens per source, e.g. {"greenhouse": ["stripe"]}
//   batch      "i/n": only the i-th of n slices of the board list, so big
//              sources can be split across scheduled runs (e.g. "2/3")
//   what     search terms for Adzuna  (default: ADZUNA_WHAT secret, or DEFAULT_WHAT)
//   where    Adzuna location filter   (default: ADZUNA_WHERE secret, or nationwide)
//   country  Adzuna country code      (default: ADZUNA_COUNTRY secret, or "us")
//   keywords search terms for freehire (default: FREEHIRE_KEYWORDS secret, or
//            data analyst / engineer / scientist, analytics engineer, BI)
//   embed_only  true: skip fetching, just embed jobs that still need it
//   embed_limit how many jobs to embed this run (default 5, max 8)
//
// Secrets:
//   IMPORT_SECRET                  required; callers send it as x-import-secret
//   ADZUNA_APP_ID, ADZUNA_APP_KEY  free keys from developer.adzuna.com
//   USAJOBS_API_KEY, USAJOBS_EMAIL free key from developer.usajobs.gov (the
//                                  registered email is sent as User-Agent)
//
// Deploy with --no-verify-jwt: the shared secret is the authentication.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildJobText, generateEmbedding, toPgVector } from '../_shared/embeddings.ts';
import { ATS_COMPANIES, ATS_SOURCES, type AtsSource } from '../_shared/ats-companies.ts';
import {
  type AtsOptions,
  dedupeJobs,
  fetchAdzuna,
  fetchArbeitnow,
  fetchAshby,
  fetchFreehire,
  fetchGreenhouse,
  fetchLever,
  fetchPersonio,
  fetchRecruitee,
  fetchSmartRecruiters,
  fetchUsaJobs,
  type ImportedJob,
  isEarlyCareer,
  jobFingerprint,
  type JobSource,
} from '../_shared/job-sources.ts';

const ATS_FETCHERS: Record<AtsSource, (company: string, opts: AtsOptions) => Promise<ImportedJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
  recruitee: fetchRecruitee,
  personio: fetchPersonio,
};
// Boards fetched at once per source: keeps runs short without hammering any API.
const ATS_CONCURRENCY = 4;

const IMPORTER_ID = 'de000000-0000-4000-8000-000000000002';
const DEFAULT_WHAT = [
  'software engineer',
  'frontend developer',
  'data analyst',
  'data scientist',
  'product designer',
  'devops engineer',
];
const STALE_AFTER_DAYS = 7;
// Edge Functions get about 2s of CPU per request on the free plan, and gte-small
// takes ~0.4s per job, so each call embeds a handful. A per-minute cron job
// ({"embed_only": true}) works through the rest; see "unembedded" in the response.
// Measured 2026-11-12: 3 embeddings per call succeed, 4 or more fail with
// WORKER_RESOURCE_LIMIT.
const MAX_EMBED_PER_RUN = 3;
const DEFAULT_EMBED_PER_RUN = 3;

interface Body {
  sources?: JobSource[];
  what?: string[] | string;
  where?: string;
  country?: string;
  /** freehire search terms. */
  keywords?: string[] | string;
  embed_only?: boolean;
  embed_limit?: number;
  companies?: Partial<Record<AtsSource, string[]>>;
  /** "i/n": pull only the i-th of n equal slices of each source's board list. */
  batch?: string;
}

function batchOf<T>(items: T[], batch: string | undefined): T[] {
  const m = /^(\d+)\/(\d+)$/.exec(batch ?? '');
  if (!m) return items;
  const [i, n] = [Number(m[1]), Number(m[2])];
  if (n < 1 || i < 1 || i > n) return items;
  const size = Math.ceil(items.length / n);
  return items.slice((i - 1) * size, i * size);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('IMPORT_SECRET');
  if (!secret) return json({ error: 'IMPORT_SECRET is not configured' }, 500);
  if (!timingSafeEqual(req.headers.get('x-import-secret') ?? '', secret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Body = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const adzunaId = Deno.env.get('ADZUNA_APP_ID');
  const adzunaKey = Deno.env.get('ADZUNA_APP_KEY');
  const usajobsKey = Deno.env.get('USAJOBS_API_KEY');
  const usajobsEmail = Deno.env.get('USAJOBS_EMAIL');
  const legacy: JobSource[] = adzunaId && adzunaKey ? ['adzuna', 'arbeitnow'] : ['arbeitnow'];
  const configured: JobSource[] = [
    ...legacy,
    ...ATS_SOURCES,
    ...(usajobsKey && usajobsEmail ? (['usajobs'] as JobSource[]) : []),
    'freehire',
  ];
  // The default stays the original feeds, so the existing daily cron is unchanged.
  const sources = body.embed_only
    ? []
    : (body.sources ?? legacy).filter((s) => configured.includes(s));

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const startedAt = new Date().toISOString();
  const report: Record<string, unknown> = { sources };
  const errors: string[] = [];
  if (body.sources?.includes('adzuna') && !sources.includes('adzuna')) {
    errors.push('adzuna skipped: set ADZUNA_APP_ID and ADZUNA_APP_KEY secrets');
  }
  if (body.sources?.includes('usajobs') && !sources.includes('usajobs')) {
    errors.push('usajobs skipped: set USAJOBS_API_KEY and USAJOBS_EMAIL secrets');
  }

  // 1. Fetch. One failing feed or query shouldn't stop the others.
  const fetched: ImportedJob[] = [];
  if (sources.includes('adzuna')) {
    const what = toList(body.what) ?? toList(Deno.env.get('ADZUNA_WHAT')) ?? DEFAULT_WHAT;
    const where = body.where ?? Deno.env.get('ADZUNA_WHERE') ?? undefined;
    const country = body.country ?? Deno.env.get('ADZUNA_COUNTRY') ?? 'us';
    for (const term of what) {
      try {
        fetched.push(
          ...(await fetchAdzuna({ appId: adzunaId!, appKey: adzunaKey!, country, what: term, where })),
        );
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  if (sources.includes('arbeitnow')) {
    try {
      fetched.push(...(await fetchArbeitnow()));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  // Employer boards, a few at a time. A board that fails is reported and
  // skipped; its existing listings are left alone (see step 3).
  const okBoards = new Map<JobSource, string[]>();
  // external_ids each board listed as live, including postings past a fetcher's
  // detail cap. Only boards that loaded completely contribute (see step 2b).
  const listed = new Map<JobSource, string[]>();
  const warnings: string[] = [];
  for (const source of sources.filter((s): s is AtsSource => (ATS_SOURCES as string[]).includes(s))) {
    const companies = body.companies?.[source] ?? batchOf(ATS_COMPANIES[source], body.batch);
    const done: string[] = [];
    const ids: string[] = [];
    // Lever pages are ~1 MB each and parallel downloads get cut off: one at a time.
    await mapLimit(companies, source === 'lever' ? 1 : ATS_CONCURRENCY, async (company) => {
      const boardIds: string[] = [];
      try {
        fetched.push(...(await ATS_FETCHERS[source](company, {
          onListed: (id) => boardIds.push(id),
          onWarning: (msg) => warnings.push(msg),
        })));
        done.push(company);
        ids.push(...boardIds);
      } catch (e) {
        errors.push(`${source} ${company}: ${(e as Error).message}`);
      }
    });
    okBoards.set(source, done);
    listed.set(source, ids);
  }
  if (sources.includes('usajobs')) {
    try {
      fetched.push(...(await fetchUsaJobs({ apiKey: usajobsKey!, userAgentEmail: usajobsEmail! })));
    } catch (e) {
      errors.push(`usajobs: ${(e as Error).message}`);
    }
  }
  if (sources.includes('freehire')) {
    try {
      const keywords = toList(body.keywords) ?? toList(Deno.env.get('FREEHIRE_KEYWORDS')) ?? undefined;
      fetched.push(...(await fetchFreehire({ keywords })));
    } catch (e) {
      errors.push(`freehire: ${(e as Error).message}`);
    }
  }

  // 2. Dedupe across providers, then upsert. A listing already saved under
  //    another source (same company, title and location) keeps its existing
  //    row, so saved jobs and swipe history stay attached to it.
  const existing = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('jobs')
      .select('source, external_id, company_name, title, location')
      .neq('source', 'jobswipe')
      .eq('is_active', true)
      .range(from, from + 999);
    if (error) {
      errors.push(`dedupe query: ${error.message}`);
      break;
    }
    for (const j of data) {
      existing.set(jobFingerprint(j as ImportedJob), `${j.source}:${j.external_id}`);
    }
    if (data.length < 1000) break;
  }
  const fresh = dedupeJobs(fetched).filter((j) => {
    const owner = existing.get(jobFingerprint(j));
    return !owner || owner === `${j.source}:${j.external_id}`;
  });
  report.duplicates_skipped = fetched.length - fresh.length;

  // Embeddings are left alone on update; new rows get them below.
  const now = new Date().toISOString();
  const rows = fresh.map((j) => ({
    ...j,
    recruiter_id: IMPORTER_ID,
    is_active: true,
    last_seen_at: now,
  }));
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin.from('jobs').upsert(chunk, { onConflict: 'source,external_id' });
    if (error) errors.push(`upsert: ${error.message}`);
    else upserted += chunk.length;
  }
  report.fetched = fetched.length;
  report.upserted = upserted;
  report.early_career = rows.filter((r) => isEarlyCareer(r.title)).length;
  report.by_source = Object.fromEntries(
    sources.map((s) => [s, {
      fetched: fetched.filter((j) => j.source === s).length,
      saved: rows.filter((r) => r.source === s).length,
    }]),
  );

  // 2b. Postings a board still lists but that weren't fetched in full (detail
  //     caps keep runs under the CPU limit) are still live: refresh their
  //     last_seen_at so step 3 doesn't retire them.
  let keptAlive = 0;
  for (const [source, ids] of listed) {
    const upsertedIds = new Set(rows.filter((r) => r.source === source).map((r) => r.external_id));
    const rest = [...new Set(ids)].filter((id) => !upsertedIds.has(id));
    for (let i = 0; i < rest.length; i += 200) {
      const { data, error } = await admin
        .from('jobs')
        .update({ last_seen_at: now })
        .eq('source', source)
        .eq('is_active', true)
        .in('external_id', rest.slice(i, i + 200))
        .select('id');
      if (error) errors.push(`keep-alive ${source}: ${error.message}`);
      else keptAlive += data.length;
    }
  }
  report.kept_alive = keptAlive;

  // 3. Retire listings a feed stopped returning. Only for feeds that loaded,
  //    so an API outage doesn't wipe the feed.
  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  // Employer boards count as healthy when at least one board loaded, even if it
  // had no qualifying jobs; otherwise that batch's old jobs would never retire.
  const healthy = sources.filter((s) =>
    okBoards.has(s) ? okBoards.get(s)!.length > 0 : rows.some((r) => r.source === s),
  );
  let deactivated = 0;
  for (const source of healthy) {
    // Employer boards: only retire jobs from boards that loaded this run.
    for (const board of okBoards.get(source) ?? [null]) {
      let query = admin
        .from('jobs')
        .update({ is_active: false })
        .eq('source', source)
        .eq('is_active', true)
        .lt('last_seen_at', staleBefore);
      if (board) query = query.like('external_id', `${board}:%`);
      const { data, error } = await query.select('id');
      if (error) errors.push(`deactivate ${source}${board ? ` ${board}` : ''}: ${error.message}`);
      else deactivated += data.length;
    }
  }
  report.deactivated = deactivated;

  // 4. Embed imported jobs that don't have a vector yet. Runs that pull the
  //    newer sources skip this: fetching plus ~0.4s CPU per embedding exceeds
  //    the per-request CPU limit, so the {"embed_only": true} cron does it.
  let embedded = 0;
  const skipEmbed = sources.some((s) => !legacy.includes(s));
  if (!skipEmbed) {
    const { data: pending, error } = await admin
      .from('jobs')
      .select('id, title, company_name, description, required_skills, location, is_remote, updated_at')
      .neq('source', 'jobswipe')
      .eq('is_active', true)
      .is('embedding', null)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(body.embed_limit ?? DEFAULT_EMBED_PER_RUN, MAX_EMBED_PER_RUN)));
    if (error) errors.push(`embed query: ${error.message}`);

    // Save each vector as soon as it exists, so a CPU-limit kill mid-run keeps
    // the jobs already done. The write only lands if the row is unchanged since
    // we read it (same updated_at, still no embedding); otherwise another worker
    // or a newer import got there first and this vector would be stale.
    for (const job of pending ?? []) {
      try {
        const vector = await generateEmbedding(buildJobText(job));
        const { data: written, error: updateError } = await admin
          .from('jobs')
          .update({ embedding: toPgVector(vector) })
          .eq('id', job.id)
          .eq('updated_at', job.updated_at)
          .is('embedding', null)
          .select('id');
        if (updateError) errors.push(`embed save: ${updateError.message}`);
        else if (written.length) embedded++;
      } catch (e) {
        errors.push(`embed: ${(e as Error).message}`);
        break; // the next run picks up the rest
      }
    }
  }
  report.embedded = embedded;

  const { count: unembedded } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('embedding', null);
  report.unembedded = unembedded ?? null;

  // 5. Durable run log, so failures are visible after the HTTP response is gone
  //    (pg_cron never reads it). See public.import_health for a summary.
  //    The per-minute embed_only cron is logged only when it fails.
  const ok = errors.length === 0;
  const { error: logError } = body.embed_only && ok ? { error: null } : await admin.from('import_runs').insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    request: body,
    sources,
    ok,
    fetched: (report.fetched as number | undefined) ?? 0,
    upserted: (report.upserted as number | undefined) ?? 0,
    duplicates_skipped: (report.duplicates_skipped as number | undefined) ?? 0,
    kept_alive: keptAlive,
    deactivated,
    embedded,
    unembedded: unembedded ?? null,
    boards_ok: Object.fromEntries([...okBoards].map(([s, b]) => [s, b.length])),
    by_source: report.by_source ?? null,
    errors,
    warnings,
  });
  if (logError) console.error(`import_runs insert failed: ${logError.message}`);

  // 207: the run finished but something failed. Shows up in net._http_response.
  return json({ ok, ...report, errors, warnings }, ok ? 200 : 207);
});

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function toList(value: string[] | string | undefined | null): string[] | null {
  const list = (Array.isArray(value) ? value : (value ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
