import { supabase } from './supabase';

// Client-side wrapper around the `embed` Edge Function. The Hugging Face token
// lives only on the server; the app just asks for a row to be (re)embedded
// after the text it is built from changes.

type EmbedBody = { target: 'profile' } | { target: 'job'; id: string } | { target: 'backfill' };

async function invokeEmbed<T = { ok: boolean; dimensions: number }>(body: EmbedBody) {
  const { data, error } = await supabase.functions.invoke<T>(
    'embed',
    { body },
  );
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data!;
}

/** Regenerate the signed-in candidate's profile embedding. */
export const embedMyProfile = () => invokeEmbed({ target: 'profile' });

/** Regenerate a job's embedding (caller must own the job). */
export const embedJob = (jobId: string) => invokeEmbed({ target: 'job', id: jobId });

/** Embed a batch of active jobs that are still missing an embedding. */
export const backfillJobEmbeddings = () =>
  invokeEmbed<{ ok: boolean; embedded: number; remaining: number }>({ target: 'backfill' });
