// Edge Function: POST /functions/v1/parse-resume
//   { "kind": "pdf" | "docx", "data": "<base64 file contents>" } -> { "text": "..." }
//
// Pulls plain text out of an uploaded resume so the app can show it for the
// user to check before it is saved. Nothing is stored here: the client saves
// the text with the rest of the profile, then the `embed` function scores it.

import { Buffer } from 'node:buffer';
import mammoth from 'npm:mammoth@1';
import { extractText, getDocumentProxy } from 'npm:unpdf@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 20_000;

type Body = { kind: 'pdf' | 'docx'; data: string };

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
  if ((body.kind !== 'pdf' && body.kind !== 'docx') || typeof body.data !== 'string') {
    return json({ error: 'Send { kind: "pdf" | "docx", data: <base64> }' }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'The file data could not be read.' }, 400);
  }
  if (bytes.length > MAX_BYTES) {
    return json({ error: 'That file is over 5 MB. Try a smaller file, or paste the text instead.' }, 413);
  }

  try {
    let text: string;
    if (body.kind === 'pdf') {
      const pdf = await getDocumentProxy(bytes);
      text = (await extractText(pdf, { mergePages: true })).text as string;
    } else {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    }

    text = text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_CHARS);

    if (!text) {
      return json({
        error: 'We couldn’t find any text in that file. If it’s a scanned image, paste your resume instead.',
      }, 422);
    }
    return json({ text });
  } catch (e) {
    console.error('parse-resume failed', e);
    return json({ error: 'We couldn’t read that file. Try another format, or paste the text instead.' }, 422);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
