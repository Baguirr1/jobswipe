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
//   sources  ["adzuna", "arbeitnow"]  which feeds to pull (default: all configured)
//   what     search terms for Adzuna  (default: ADZUNA_WHAT secret, or DEFAULT_WHAT)
//   where    Adzuna location filter   (default: ADZUNA_WHERE secret, or nationwide)
//   country  Adzuna country code      (default: ADZUNA_COUNTRY secret, or "us")
//
// Secrets:
//   IMPORT_SECRET                  required; callers send it as x-import-secret
//   ADZUNA_APP_ID, ADZUNA_APP_KEY  free keys from developer.adzuna.com
//   HF_TOKEN                       already set for the embed function
//
// Deploy with --no-verify-jwt: the shared secret is the authentication.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildJobText, generateEmbeddings, toPgVector } from '../_shared/embeddings.ts';
import {
  dedupeJobs,
  fetchAdzuna,
  fetchArbeitnow,
  type ImportedJob,
  type JobSource,
} from '../_shared/job-sources.ts';

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
const EMBED_BATCH = 16;
const MAX_EMBED_PER_RUN = 300;

interface Body {
  sources?: JobSource[];
  what?: string[] | string;
  where?: string;
  country?: string;
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
  const configured: JobSource[] = adzunaId && adzunaKey ? ['adzuna', 'arbeitnow'] : ['arbeitnow'];
  const sources = (body.sources ?? configured).filter((s) => configured.includes(s));

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: Record<string, unknown> = { sources };
  const errors: string[] = [];
  if (body.sources?.includes('adzuna') && !sources.includes('adzuna')) {
    errors.push('adzuna skipped: set ADZUNA_APP_ID and ADZUNA_APP_KEY secrets');
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

  // 2. Upsert. Embeddings are left alone on update; new rows get them below.
  const now = new Date().toISOString();
  const rows = dedupeJobs(fetched).map((j) => ({
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

  // 3. Retire listings a feed stopped returning. Only for feeds that loaded,
  //    so an API outage doesn't wipe the feed.
  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const healthy = sources.filter((s) => rows.some((r) => r.source === s));
  let deactivated = 0;
  for (const source of healthy) {
    const { data, error } = await admin
      .from('jobs')
      .update({ is_active: false })
      .eq('source', source)
      .eq('is_active', true)
      .lt('last_seen_at', staleBefore)
      .select('id');
    if (error) errors.push(`deactivate ${source}: ${error.message}`);
    else deactivated += data.length;
  }
  report.deactivated = deactivated;

  // 4. Embed imported jobs that don't have a vector yet.
  const hfToken = Deno.env.get('HF_TOKEN');
  let embedded = 0;
  if (!hfToken) {
    errors.push('HF_TOKEN is not configured; jobs imported without match scores');
  } else {
    const { data: pending, error } = await admin
      .from('jobs')
      .select('id, title, company_name, description, required_skills, location, is_remote')
      .neq('source', 'jobswipe')
      .eq('is_active', true)
      .is('embedding', null)
      .order('created_at', { ascending: false })
      .limit(MAX_EMBED_PER_RUN);
    if (error) errors.push(`embed query: ${error.message}`);

    for (let i = 0; i < (pending ?? []).length; i += EMBED_BATCH) {
      const batch = pending!.slice(i, i + EMBED_BATCH);
      try {
        const vectors = await generateEmbeddings(batch.map(buildJobText), hfToken);
        for (let k = 0; k < batch.length; k++) {
          const { error: updateError } = await admin
            .from('jobs')
            .update({ embedding: toPgVector(vectors[k]) })
            .eq('id', batch[k].id);
          if (!updateError) embedded++;
        }
      } catch (e) {
        errors.push(`embed: ${(e as Error).message}`);
        break; // HF is down or rate limited; the next run picks up the rest
      }
    }
  }
  report.embedded = embedded;

  return json({ ok: errors.length === 0, ...report, errors });
});

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
