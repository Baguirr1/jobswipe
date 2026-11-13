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
  /** Only used to strip the name out of the resume; never embedded. */
  full_name?: string | null;
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

// A profile is embedded as several pieces: a header (title, skills, bio) plus
// up to MAX_RESUME_CHUNKS slices of the resume. Embedding the whole thing as one
// 1500-char string used to leave ~900 chars for the resume, most of it the
// name/email/phone block at the top. Each gte-small call costs ~0.3-0.4s of the
// ~2s CPU budget, so header + 4 chunks keeps a profile to one request.
export const MAX_RESUME_CHUNKS = 4;
/** Share of the final vector given to the header; the rest is split across resume chunks. */
const HEADER_WEIGHT = 0.5;

// Candidate and job text share the same shape (title, skills, then prose) so
// they land in comparable regions of the embedding space.
export function buildProfileTexts(p: ProfileEmbeddingInput): { header: string; chunks: string[] } {
  const header = compact([
    p.target_title && `Role: ${p.target_title}`,
    p.skills?.length && `Skills: ${p.skills.join(', ')}`,
    p.bio && `Summary: ${stripContactInfo(p.bio, p.full_name)}`,
  ]);
  const resume = p.resume_text ? stripContactInfo(p.resume_text, p.full_name) : '';
  const chunks = chunkText(resume, MAX_INPUT_CHARS - 'Experience: '.length, MAX_RESUME_CHUNKS).map(
    (c) => `Experience: ${c}`,
  );
  return { header, chunks };
}

/**
 * Embed a profile: header and resume chunks are embedded separately, then
 * combined as a weighted mean (header HEADER_WEIGHT, chunks share the rest)
 * and re-normalized, so the result is still one unit vector and the ranking
 * SQL, HNSW index and match_pct() work unchanged.
 */
export async function generateProfileEmbedding(p: ProfileEmbeddingInput): Promise<number[]> {
  const { header, chunks } = buildProfileTexts(p);
  const parts: { text: string; weight: number }[] = [];
  if (header && chunks.length) {
    parts.push({ text: header, weight: HEADER_WEIGHT });
    for (const text of chunks) parts.push({ text, weight: (1 - HEADER_WEIGHT) / chunks.length });
  } else if (header) {
    parts.push({ text: header, weight: 1 });
  } else {
    for (const text of chunks) parts.push({ text, weight: 1 / chunks.length });
  }
  if (!parts.length) throw new EmbeddingError('Cannot embed an empty profile', 400);

  const sum = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const { text, weight } of parts) {
    const v = await generateEmbedding(text);
    for (let i = 0; i < sum.length; i++) sum[i] += weight * v[i];
  }
  return normalize(sum);
}

export function normalize(v: number[]): number[] {
  const norm = Math.hypot(...v);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL = /\b(https?:\/\/|www\.)\S+|\b(linkedin\.com|github\.com|gitlab\.com)\/\S*/gi;
// +1 (555) 123-4567, 555.123.4567, +44 20 7946 0958 ... (10+ digits, so year ranges like 2019-2021 survive)
const PHONE = /(\+?\d{1,3}[\s.-]?)?(\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}([\s.-]\d{2,4})?/g;
// "123 Main St", "42 Oak Avenue Apt 5"
const STREET =
  /\b\d{1,6}\s+(?:[A-Z][\w.]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Hwy)\b\.?(?:,?\s*(?:Apt|Suite|Unit|#)\s*\w+)?/g;
// "Charlotte, NC 28223"
const CITY_STATE_ZIP = /\b[A-Z][a-zA-Z.\s]{1,30},\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/g;

/**
 * Remove contact details (and the person's name) from resume/bio text. They
 * carry no signal about fit, waste the embedding's input budget, and names and
 * addresses can act as demographic proxies in the score recruiters see.
 */
export function stripContactInfo(text: string, fullName?: string | null): string {
  let out = text
    .replace(EMAIL, ' ')
    .replace(URL, ' ')
    .replace(STREET, ' ')
    .replace(CITY_STATE_ZIP, ' ')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? ' ' : m));

  const name = fullName?.trim();
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }

  // Drop lines left with nothing but separators ("|", "•", "-", ...).
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => /[\p{L}\p{N}]{2,}/u.test(l))
    .join('\n')
    .trim();
}

/**
 * Split text into at most `maxChunks` pieces of at most `maxChars`, breaking at
 * line, then sentence, then word boundaries. Keeps the start of the text
 * (resumes put recent experience first) and drops what doesn't fit.
 */
export function chunkText(text: string, maxChars: number, maxChunks: number): string[] {
  const units = text
    .split(/\n+/)
    .flatMap((line) => (line.length <= maxChars ? [line] : line.split(/(?<=[.!?;])\s+/)))
    .flatMap((piece) => (piece.length <= maxChars ? [piece] : splitWords(piece, maxChars)))
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const next = current ? `${current} ${unit}` : unit;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    chunks.push(current);
    if (chunks.length === maxChunks) return chunks;
    current = unit;
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks;
}

function splitWords(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) current = next;
    else {
      if (current) out.push(current);
      current = word.slice(0, maxChars);
    }
  }
  if (current) out.push(current);
  return out;
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
