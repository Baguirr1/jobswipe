import { Fragment, type ReactNode } from 'react';
import { Text, View } from 'react-native';

// Job boards (freehire's "text" format, Greenhouse, Lever...) hand us
// descriptions with light Markdown: "*Title:*", "**Requirements**",
// "## About us", "- bullet". Render that instead of showing the symbols.

// Backslash escapes ("\*") become private-use characters while parsing, then
// turn back into the literal character.
const ESC_BASE = 0xe000;
const ESCAPABLE = '\\`*_{}[]()#+-.!';
const escape = (s: string) =>
  s.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, (_, c: string) => String.fromCharCode(ESC_BASE + ESCAPABLE.indexOf(c)));
const unescape = (s: string) =>
  s.replace(/[-]/g, (c) => ESCAPABLE[c.charCodeAt(0) - ESC_BASE] ?? c);

const INLINE = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`\n]+)`|\[([^\]\n]+)\]\([^)\s]+\)/g;
const isWord = (c: string | undefined) => !!c && /[A-Za-z0-9À-ɏ]/.test(c);

/** Bold for **x**, __x__, *x*, _x_ (labels in job posts); plain text for `code` and [links](url). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const [, b1, b2, i1, i2, code, link] = m;
    const single = i1 ?? i2;
    // Leave snake_case, 2*3*4 and "* not emphasis *" alone.
    if (single != null && (isWord(text[start - 1]) || isWord(text[end]) || /^\s|\s$/.test(single))) continue;
    if (start > last) out.push(unescape(text.slice(last, start)));
    const bold = b1 ?? b2 ?? single;
    out.push(
      bold != null ? (
        <Text key={key++} className="font-semibold text-gray-900">
          {unescape(bold)}
        </Text>
      ) : (
        unescape(code ?? link ?? m[0])
      ),
    );
    last = end;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; marker: string; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'gap' };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of escape(source.replace(/\r\n?/g, '\n')).split('\n')) {
    const line = raw.trim();
    const prev = blocks[blocks.length - 1];
    if (!line || /^([-*_])(\s*\1){2,}$/.test(line)) {
      if (prev && prev.kind !== 'gap') blocks.push({ kind: 'gap' });
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/) ?? line.match(/^(?:\*\*?|__?)([^*_]+?)(?:\*\*?|__?):?$/);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    const bullet = line.match(/^(?:[-*+•·▪●]|(\d{1,2}[.)]))\s+(.+)$/);
    if (bullet) {
      blocks.push({ kind: 'bullet', marker: bullet[1] ?? '•', text: bullet[2] });
      continue;
    }
    blocks.push({ kind: 'para', text: line });
  }
  while (blocks[blocks.length - 1]?.kind === 'gap') blocks.pop();
  return blocks;
}

export function JobDescription({ text, compact = false }: { text?: string | null; compact?: boolean }) {
  const body = compact ? 'text-sm leading-5' : 'text-base leading-6';
  if (!text?.trim()) return <Text className={`${body} text-gray-500`}>No description provided.</Text>;
  return (
    <View>
      {parse(text).map((b, i) => (
        <Fragment key={i}>
          {b.kind === 'gap' ? (
            <View className={compact ? 'h-2' : 'h-3'} />
          ) : b.kind === 'heading' ? (
            <Text className={`${compact ? 'text-sm' : 'text-base'} mb-1 font-bold text-gray-900`}>{inline(b.text)}</Text>
          ) : b.kind === 'bullet' ? (
            <View className="mb-1 flex-row pl-1">
              <Text className={`${body} w-5 text-gray-400`}>{b.marker}</Text>
              <Text className={`${body} flex-1 text-gray-700`}>{inline(b.text)}</Text>
            </View>
          ) : (
            <Text className={`${body} mb-1 text-gray-700`}>{inline(b.text)}</Text>
          )}
        </Fragment>
      ))}
    </View>
  );
}
