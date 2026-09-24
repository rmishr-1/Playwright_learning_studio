/**
 * Invisible marks in the lesson text, so a copy of the course can be traced to the licence it was
 * made from. A mark is the licence ID written in zero-width characters: it does not show on the
 * page, and it goes along when the text is copied, printed to PDF, or scraped.
 *
 *   START  bits of the ID (U+200B = 0, U+200C = 1)  END
 *
 * The desktop build marks the course with the licence it is made for (desktop/scripts/
 * pack-content.ts), and the app marks every day again, as it serves it, with the licence in use
 * (backend/src/routes.ts), so even a build made for any licence traces to the one that opened it.
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
 * tables, so nothing a learner copies to run and nothing the page matches on is touched. A line
 * with a web address is skipped: a mark right after a bare link would become part of the link.
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
    if (/:\/\/|www\./i.test(t)) continue;
    lines[i] = line + encode(id);
    return lines.join('\n');
  }
  return text;
}

/** The block types whose text is prose to mark. */
const MARKED = new Set(['markdown', 'callout', 'at-a-glance', 'recap', 'reference']);

type MarkableDay = {
  parts: {
    blocks: { type: string; text: string; checkpoint?: { explanation: string } | null }[];
    problems?: { statement: string; hints?: string[]; solution?: string | null }[];
  }[];
};

/**
 * Marks a whole day: its prose blocks, quiz explanations, and each exercise's statement, hints and
 * written solution. Returns a new day and how many marks went in; the day given is not changed.
 */
export function markDay<T extends MarkableDay>(day: T, id: string): { day: T; marks: number } {
  const copy = JSON.parse(JSON.stringify(day)) as T;
  let marks = 0;
  const mark = (text: string): string => {
    const marked = markMarkdown(text, id);
    if (marked !== text) marks++;
    return marked;
  };
  for (const part of copy.parts) {
    for (const block of part.blocks) {
      if (MARKED.has(block.type) && typeof block.text === 'string') block.text = mark(block.text);
      if (block.checkpoint && typeof block.checkpoint.explanation === 'string') block.checkpoint.explanation = mark(block.checkpoint.explanation);
    }
    for (const problem of part.problems ?? []) {
      problem.statement = mark(problem.statement);
      if (problem.hints) problem.hints = problem.hints.map(mark);
      // A solution is marked only when it is Markdown: code outside a fence would take the mark
      // into the editor, and break.
      const bareCode = typeof problem.solution === 'string' && !problem.solution.includes('```') && /[;{}]\s*$/m.test(problem.solution);
      if (typeof problem.solution === 'string' && !bareCode) problem.solution = mark(problem.solution);
    }
  }
  return { day: copy, marks };
}
