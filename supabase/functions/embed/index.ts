// Edge Function: POST /functions/v1/embed
//   { "target": "profile" }              -> embeds the caller's profile
//   { "target": "job", "id": "<uuid>" }  -> embeds one of the caller's jobs
//   { "target": "backfill" }             -> embeds active jobs that have no
//                                           embedding yet (seeded jobs, or saves
//                                           where embedding failed)
//
// profile/job run with the caller's JWT, so RLS guarantees users only embed rows
// they own. backfill uses the service role but only fills NULL embeddings from
// server-side job text, so callers can't change any data they don't own.
// Embeddings come from Supabase's built-in gte-small model; no API key needed.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildJobText,
  buildProfileText,
  EmbeddingError,
  generateEmbedding,
  toPgVector,
} from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = { target: 'profile' } | { target: 'job'; id: string } | { target: 'backfill' };

const BACKFILL_BATCH = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    if (body.target === 'profile') {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('target_title, bio, skills, resume_text')
        .eq('id', user.id)
        .single();
      if (error) return json({ error: error.message }, 404);

      const embedding = await generateEmbedding(buildProfileText(profile));
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ embedding: toPgVector(embedding) })
        .eq('id', user.id);
      if (updateError) return json({ error: updateError.message }, 500);

      return json({ ok: true, dimensions: embedding.length });
    }

    if (body.target === 'job' && body.id) {
      const { data: job, error } = await supabase
        .from('jobs')
        .select('title, company_name, description, required_skills, location, is_remote')
        .eq('id', body.id)
        .eq('recruiter_id', user.id)
        .single();
      if (error) return json({ error: 'Job not found' }, 404);

      const embedding = await generateEmbedding(buildJobText(job));
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ embedding: toPgVector(embedding) })
        .eq('id', body.id);
      if (updateError) return json({ error: updateError.message }, 500);

      return json({ ok: true, dimensions: embedding.length });
    }

    if (body.target === 'backfill') {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: jobs, error } = await admin
        .from('jobs')
        .select('id, title, company_name, description, required_skills, location, is_remote')
        .eq('is_active', true)
        .is('embedding', null)
        .order('created_at', { ascending: true })
        .limit(BACKFILL_BATCH);
      if (error) return json({ error: error.message }, 500);

      let embedded = 0;
      for (const job of jobs ?? []) {
        const embedding = await generateEmbedding(buildJobText(job));
        const { error: updateError } = await admin
          .from('jobs')
          .update({ embedding: toPgVector(embedding) })
          .eq('id', job.id)
          .is('embedding', null);
        if (!updateError) embedded++;
      }

      const { count } = await admin
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('embedding', null);

      return json({ ok: true, embedded, remaining: count ?? 0 });
    }

    return json({ error: 'Expected target "profile", "job" (with id) or "backfill"' }, 400);
  } catch (e) {
    const status = e instanceof EmbeddingError && e.status ? (e.status >= 500 ? 502 : e.status) : 500;
    return json({ error: (e as Error).message }, status);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
