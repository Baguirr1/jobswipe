// Embedding generation for JobSwipe.
// Uses Supabase's built-in gte-small model (384 dims, L2-normalized), which
// runs inside the Edge Runtime: no API key, no per-call cost.
// Earlier versions called Hugging Face's all-MiniLM-L6-v2; vectors from the two
// models are not comparable, so switching models means re-embedding everything.

export const EMBEDDING_MODEL = 'gte-small';
export const EMBEDDING_DIMENSIONS = 384;

// gte-small reads up to 512 tokens; ~1500 chars keeps the important parts
// (title, skills, start of the description) and keeps inference fast.
const MAX_INPUT_CHARS = 1500;

export class EmbeddingError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EmbeddingError';
    this.status = status;
  }
}

export interface ProfileEmbeddingInput {
  target_title?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  resume_text?: string | null;
}

export interface JobEmbeddingInput {
  title: string;
  company_name?: string | null;
  description?: string | null;
  required_skills?: string[] | null;
  location?: string | null;
  is_remote?: boolean | null;
}

// Candidate and job text share the same shape (title, skills, then prose) so
// they land in comparable regions of the embedding space.
export function buildProfileText(p: ProfileEmbeddingInput): string {
  return compact([
    p.target_title && `Role: ${p.target_title}`,
    p.skills?.length && `Skills: ${p.skills.join(', ')}`,
    p.bio && `Summary: ${p.bio}`,
    p.resume_text && `Experience: ${p.resume_text}`,
  ]);
}

export function buildJobText(j: JobEmbeddingInput): string {
  return compact([
    `Role: ${j.title}`,
    j.required_skills?.length && `Skills: ${j.required_skills.join(', ')}`,
    j.is_remote ? 'Remote' : j.location && `Location: ${j.location}`,
    j.description && `Experience: ${j.description}`,
  ]);
}

function compact(parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join('\n').replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
}

// Supabase's built-in model, run by the Edge Runtime itself: free, no API key.
// Typed locally so this file stays importable outside the Edge Runtime.
interface AiSession {
  run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<unknown>;
}
let session: AiSession | null = null;

function getSession(): AiSession {
  if (!session) {
    const ai = (globalThis as { Supabase?: { ai?: { Session: new (model: string) => AiSession } } })
      .Supabase?.ai;
    if (!ai) throw new EmbeddingError('Supabase.ai is only available inside Supabase Edge Functions', 500);
    session = new ai.Session(EMBEDDING_MODEL);
  }
  return session;
}

/** Generate a 384-d, L2-normalized embedding with gte-small. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) throw new EmbeddingError('Cannot embed empty text', 400);

  const raw = await getSession().run(input, { mean_pool: true, normalize: true });
  const vector = Array.from(raw as ArrayLike<number>);
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
  }
  return vector;
}

/** Embed several texts, one at a time (the runtime has no batch API). */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) vectors.push(await generateEmbedding(text));
  return vectors;
}

/** pgvector accepts the JSON-ish literal "[0.1,0.2,...]". */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
