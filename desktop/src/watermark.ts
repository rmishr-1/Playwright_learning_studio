/**
 * Invisible marks in the lesson text, so a copy of the course can be traced to the licence it was
 * made from. A mark is the licence ID written in zero-width characters: it does not show on the
 * page, and it goes along when the text is copied, printed to PDF, or scraped.
 *
 *   START  bits of the ID (U+200B = 0, U+200C = 1)  END
 */
const ZERO = '​';
const ONE = '‌';
const START = '⁠‍';
const END = '‍⁠';

export function encode(id: string): string {
  let bits = '';
  for (const byte of Buffer.from(id, 'utf-8')) bits += byte.toString(2).padStart(8, '0');
  return START + bits.replace(/0/g, ZERO).replace(/1/g, ONE) + END;
}

/** Every mark in a text, decoded. */
export function decodeAll(text: string): string[] {
  const found: string[] = [];
  const re = new RegExp(START + '([' + ZERO + ONE + ']+)' + END, 'g');
  for (const m of text.matchAll(re)) {
    const bits = m[1].replace(new RegExp(ZERO, 'g'), '0').replace(new RegExp(ONE, 'g'), '1');
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    found.push(Buffer.from(bytes).toString('utf-8'));
  }
  return found;
}

/**
 * Marks one markdown text: after the first ordinary sentence, outside code, headings, lists and
 * tables, so nothing a learner copies to run and nothing the page matches on is touched.
 */
export function markMarkdown(text: string, id: string): string {
  const lines = text.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const t = line.trim();
    if (t.length < 40 || /^([#>|*+-]|\d+[.)]\s|<)/.test(t) || !/[A-Za-z]/.test(t[0]) || !/[.!?:]$/.test(t)) continue;
    lines[i] = line + encode(id);
    return lines.join('\n');
  }
  return text;
}
