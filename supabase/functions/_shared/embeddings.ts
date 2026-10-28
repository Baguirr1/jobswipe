// Embedding generation for JobSwipe.
// Runtime-agnostic (only uses fetch), so it works in Deno Edge Functions,
// Node scripts, or anywhere else with a global fetch.

export const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

const HF_ENDPOINT =
  `https://router.huggingface.co/hf-inference/models/${EMBEDDING_MODEL}/pipeline/feature-extraction`;

// MiniLM was trained on 256 word-piece tokens; ~1500 chars keeps us under it.
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

/**
 * Generate a 384-d, L2-normalized embedding via the Hugging Face Inference API.
 * Retries on 503 (model cold start) and 429 (rate limit) with backoff.
 */
export async function generateEmbedding(
  text: string,
  hfToken: string,
  { retries = 3 }: { retries?: number } = {},
): Promise<number[]> {
  const input = text.trim();
  if (!input) throw new EmbeddingError('Cannot embed empty text', 400);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: input, normalize: true, truncate: true }),
    });

    if (res.ok) {
      return toSentenceVector(await res.json());
    }

    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    throw new EmbeddingError(
      `Hugging Face request failed (${res.status}): ${await res.text()}`,
      res.status,
    );
  }
}

/**
 * Embed several texts in one request. Falls back to one request per text if
 * the batch call fails, so a single bad input can't sink the whole batch.
 */
export async function generateEmbeddings(
  texts: string[],
  hfToken: string,
  { retries = 3 }: { retries?: number } = {},
): Promise<number[][]> {
  const inputs = texts.map((t) => t.trim());
  if (inputs.length === 0) return [];
  if (inputs.some((t) => !t)) throw new EmbeddingError('Cannot embed empty text', 400);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs, normalize: true, truncate: true }),
    });

    if (res.ok) {
      const raw = (await res.json()) as unknown[];
      if (Array.isArray(raw) && raw.length === inputs.length) {
        return raw.map((item) => toSentenceVector(item));
      }
      break; // unexpected shape: fall back to single requests
    }

    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new EmbeddingError(
        `Hugging Face request failed (${res.status}): ${await res.text()}`,
        res.status,
      );
    }
    break;
  }

  const vectors: number[][] = [];
  for (const text of inputs) vectors.push(await generateEmbedding(text, hfToken, { retries }));
  return vectors;
}

// The API returns either a sentence vector [384] or, for some deployments,
// token vectors [tokens][384] (optionally wrapped in a batch dimension).
// Mean-pool token vectors, then L2-normalize so cosine distance is well-behaved.
function toSentenceVector(raw: unknown): number[] {
  let data = raw as number[] | number[][] | number[][][];
  if (Array.isArray(data[0]) && Array.isArray((data as number[][][])[0][0])) {
    data = (data as number[][][])[0];
  }

  let vector: number[];
  if (typeof data[0] === 'number') {
    vector = data as number[];
  } else {
    const tokens = data as number[][];
    vector = new Array(tokens[0].length).fill(0);
    for (const t of tokens) for (let i = 0; i < t.length; i++) vector[i] += t[i];
    vector = vector.map((v) => v / tokens.length);
  }

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      `Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`,
    );
  }

  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** pgvector accepts the JSON-ish literal "[0.1,0.2,...]". */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
