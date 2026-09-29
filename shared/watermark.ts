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

/** A text without its marks. */
export const strip = (text: string): string => text.replace(new RegExp(START + '[' + ZERO + ONE + ']*' + END, 'g'), '');

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
 * Marks one markdown text: every paragraph and list, on its first line of ordinary prose, outside
 * code, headings and tables, so nothing a learner copies to run and nothing the page matches on
 * is touched. A line with a web address is skipped: a mark right after a bare link would become
 * part of the link. The mark goes before any trailing spaces, which Markdown reads as a line break.
 * A line already marked (the build's mark) takes the new mark after its own, so the text carries
 * both, always in the same place, however many times it is marked.
 */
export function markMarkdown(text: string, id: string): string {
  const lines = text.split('\n');
  let fence = false;
  let paragraphMarked = false;
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const t = strip(line).trim();
    if (t === '') {
      paragraphMarked = false;
      continue;
    }
    if (paragraphMarked) continue;
    // Indented code (four spaces or a tab) is code, not prose.
    if (/^( {4}|\t)/.test(line)) continue;
    // A list item's words count, after its marker; headings, quotes, tables and HTML never.
    if (/^[#>|<]/.test(t)) continue;
    // A line that is only code (a hint such as `await expect(page).toHaveTitle(/x/)`) is left alone:
    // a learner may copy it into the editor.
    if (/^([*+-]\s+|\d+[.)]\s+)?`[^`]*`[.:;,]?$/.test(t)) continue;
    // After a list marker and any opening emphasis, code, quote, bracket or checkbox, the words.
    const body = t.replace(/^([*+-]|\d+[.)])\s+/, '').replace(/^(\[[ xX]\]\s*|[*_`"'(\[]+)+/, '');
    if (body.length < 20 || !/[A-Za-z]/.test(body[0])) continue;
    if (/:\/\/|www\./i.test(t)) continue;
    lines[i] = append(line, id);
    paragraphMarked = true;
    changed = true;
  }
  return changed ? lines.join('\n') : text;
}

/** Marks a quiz option that reads as words (it has a space), at its end. Answers are indexes, so a mark changes nothing. */
function markOption(text: string, id: string): string {
  const t = strip(text).trim();
  // An option that is only code is left alone: a learner may copy it into the editor.
  const codeOnly = /^`[^`]*`$/.test(t);
  return !codeOnly && t.includes(' ') && /[A-Za-z]/.test(t) && !/:\/\/|www\./i.test(t) ? append(text, id) : text;
}

/**
 * A line with the mark at its end, before any trailing spaces (Markdown reads two as a line break).
 * After a closing *, _, ` or ~ the mark follows a space: straight after one, Markdown would not see
 * the emphasis or code close there ("**Before you start:**" would show its asterisks).
 */
function append(line: string, id: string): string {
  const closes = /[*_`~]$/.test(line.replace(/\s+$/, ''));
  return line.replace(/(\s*)$/, (_all, trailing: string) => (closes ? ' ' : '') + encode(id) + trailing);
}

/** The block types whose text is prose to mark (a checkpoint's text is its question). */
const MARKED = new Set(['markdown', 'callout', 'at-a-glance', 'recap', 'reference', 'checkpoint']);

type MarkableDay = {
  parts: {
    blocks: { type: string; text: string; checkpoint?: { explanation: string; options?: string[] } | null }[];
    problems?: { statement: string; hints?: string[]; solution?: string | null; kind?: string }[];
  }[];
};

/**
 * Marks a whole day: its prose blocks, quiz questions, options and explanations, and each
 * exercise's statement, hints and written solution. Returns a new day and how many marks went in;
 * the day given is not changed.
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
      if (block.checkpoint && Array.isArray(block.checkpoint.options)) {
        block.checkpoint.options = block.checkpoint.options.map((o) => {
          const marked = typeof o === 'string' ? markOption(o, id) : o;
          if (marked !== o) marks++;
          return marked;
        });
      }
    }
    for (const problem of part.problems ?? []) {
      problem.statement = mark(problem.statement);
      if (problem.hints) problem.hints = problem.hints.map(mark);
      // A solution is marked when it is written in words (a written or predict exercise), or when its
      // code is fenced Markdown; code outside a fence would take the mark into the editor, and break.
      const prose = problem.kind === 'written' || problem.kind === 'predict';
      if (typeof problem.solution === 'string' && (prose || /^\s*(```|~~~)/m.test(problem.solution))) problem.solution = mark(problem.solution);
    }
  }
  return { day: copy, marks };
}
