import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 20_000;

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

type Kind = 'pdf' | 'docx' | 'text';

function kindOf(name: string, mimeType?: string): Kind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (n.endsWith('.docx') || mimeType === ACCEPTED_TYPES[1]) return 'docx';
  if (n.endsWith('.txt') || n.endsWith('.md') || mimeType?.startsWith('text/')) return 'text';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Lets the user pick a resume (PDF, Word .docx, .txt or .md) and returns its
 * plain text, or null if they cancelled. Text files are read on the device;
 * PDF and DOCX are sent to the `parse-resume` Edge Function, because parsing
 * them inside React Native is unreliable.
 */
export async function pickResumeText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const kind = kindOf(asset.name, asset.mimeType);
  if (!kind) {
    throw new Error('Upload a PDF, a Word file (.docx) or a .txt file. Older .doc files aren’t supported.');
  }
  if (asset.size != null && asset.size > MAX_BYTES) {
    throw new Error('That file is over 5 MB. Try a smaller file, or paste the text instead.');
  }

  // On web the picker hands us a browser File; on native we read from the cache URI.
  if (kind === 'text') {
    const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
    return text.slice(0, MAX_CHARS);
  }

  const buffer = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
  const { data, error } = await supabase.functions.invoke<{ text: string }>('parse-resume', {
    body: { kind, data: toBase64(new Uint8Array(buffer)) },
  });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return (data?.text ?? '').slice(0, MAX_CHARS);
}
