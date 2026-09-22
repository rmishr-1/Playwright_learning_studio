/**
 * The mechanical half of docs/STYLE.md.
 *
 * These rules lint the text this project AUTHORS - the lesson cards, your-turn variations and
 * practice solutions under Data/Content/. They deliberately do NOT lint the lesson bodies, which
 * are generated from notebooks in a training repo this checkout does not have: a rule that fails
 * on text nobody here can edit turns `npm run verify` permanently red, and a check everyone
 * ignores is worse than no check.
 *
 * What they can and cannot prove is written out in docs/STYLE.md. In short: they catch known-bad
 * phrasing and runaway structure. They cannot tell you whether an explanation actually lands.
 */

export type Severity = 'error' | 'warn';
export type Finding = { where: string; rule: string; detail: string; severity: Severity };

/** Phrasing that is never right in this course. Matched whole-word, after code is stripped. */
const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bgotchas?\b/i, 'gotcha'],
  [/\bsweet spot\b/i, 'sweet spot'],
  [/\bnothing new today\b/i, 'nothing new today'],
  [/\bkinda\b|\bsorta\b/i, 'kinda/sorta'],
  [/\btons of\b/i, 'tons of'],
  [/\bawesome\b/i, 'awesome'],
  [/\bhandy\b/i, 'handy'],
  [/\bno big deal\b/i, 'no big deal'],
  [/\bdon['’]t worry\b/i, "don't worry"],
  [/\bstuff\b/i, 'stuff'],
];

/**
 * Sentences that define a lesson by what it does NOT contain: "No new TypeScript today",
 * "New API | none", "No code today". A first-time reader has not been told what a normal day
 * contains, so an absence tells them nothing, and it reads as an apology for the page they just
 * opened. Say what the lesson IS about instead - the at-a-glance card has a row for it either
 * way, so this costs nothing but the framing.
 */
const ABSENCE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bno new (typescript|api|code|syntax|concepts?)\b/i, '"no new ..."'],
  [/\bno code (today|here)\b/i, '"no code today"'],
  [/\|\s*none\s*[\u2014-]/i, 'a table row answering "none"'],
  [/\bnothing to learn\b/i, '"nothing to learn"'],
  [/\brather than (the )?language\b/i, '"rather than language"'],
];

/** Acronyms that are legitimately upper-case, so the shouting check does not flag them. */
const ACRONYMS = new Set([
  'CSS', 'XPATH', 'DOM', 'CI', 'GET', 'POST', 'HTML', 'URL', 'API', 'UI', 'E2E', 'JSON',
  'TS', 'JS', 'HR', 'MCQ', 'AND', 'OR', 'NOT', 'ONLY', 'ALL', 'NO', 'YES',
  'CLI', 'VS', 'IDE', 'HTTP', 'HTTPS', 'SPA', 'CSV', 'PR', 'QA', 'SDET', 'UAT', 'BDD', 'DRY',
]);

export const MAX_WORDS_ERROR = 45;
export const MAX_WORDS_WARN = 32;

/**
 * Markdown reduced to the prose a reader actually parses as sentences. Fenced code goes entirely;
 * an inline span becomes one token, because `page.getByRole("button", { name: "Login" })` is one
 * idea to a reader but eight "words" to a naive splitter.
 */
export function stripCode(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, 'CODE')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // keep the link label, drop the href
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '') // a blockquote marker is punctuation, not a word
    .replace(/\*\*|\*|__/g, '');
}

/** Lines that are markdown table rows - legitimately fragments, so sentence rules skip them. */
const isTableRow = (line: string): boolean => line.trim().startsWith('|');

/**
 * Sentence boundaries, without breaking on the things this course writes constantly:
 * `Day 1.2`, `Node 18+.`, `e.g.`, `i.e.`, `vs.`
 */
export function splitSentences(text: string): string[] {
  const guarded = text
    .replace(/\b(\d+)\.(\d+)/g, '$1\u0000$2')
    .replace(/\b(e\.g|i\.e|vs|etc|Dr|Mr|No)\./gi, (m) => m.replace(/\./g, '\u0001'));

  // Two structural boundaries have to be applied before the full-stop rule, or sentences that
  // are plainly separate get measured as one. A blank line ends a paragraph, and a paragraph
  // ending in a colon would otherwise swallow the one after it. A bullet list is a list of
  // statements: without splitting on the list marker, a six-bullet recap measured as a single
  // 66-word "sentence" and failed a rule that was never about it.
  return guarded
    .split(/\n\s*\n/)
    .flatMap((para) => para.split(/\n(?=\s*(?:[-*+]\s|\d+[.)]\s))/))
    .flatMap((item) => item.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').split(/(?<=[.!?])\s+(?=[A-Z`*\[(])/))
    .map((s) => s.replace(/\u0000/g, '.').replace(/\u0001/g, '.').trim())
    .filter((s) => s.length > 0);
}

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/**
 * Lints one authored string. `where` is echoed into every finding so a failure names the file and
 * the field, not just the offending words.
 */
export function lintProse(text: string, where: string): Finding[] {
  const out: Finding[] = [];
  const clean = stripCode(text);
  const err = (rule: string, detail: string) => out.push({ where, rule, detail, severity: 'error' });
  const warn = (rule: string, detail: string) => out.push({ where, rule, detail, severity: 'warn' });

  // Lexicon and punctuation apply to every line, table cells included: a banned word is banned
  // wherever it appears, and a cell has no business carrying an exclamation mark either.
  for (const [re, name] of BANNED) {
    if (re.test(clean)) err('banned-phrase', `"${name}"`);
  }
  for (const [re, name] of ABSENCE) {
    if (re.test(clean)) err('defines-by-absence', name);
  }
  if (/!/.test(clean.replace(/\bCODE\b/g, ''))) err('exclamation', 'contains "!"');

  const proseLines = clean.split('\n').filter((l) => !isTableRow(l));
  for (const sentence of splitSentences(proseLines.join('\n'))) {
    const n = words(sentence);
    const shown = sentence.length > 90 ? sentence.slice(0, 90) + '…' : sentence;
    if (n > MAX_WORDS_ERROR) err('sentence-length', `${n} words: "${shown}"`);
    else if (n > MAX_WORDS_WARN) warn('sentence-length', `${n} words: "${shown}"`);

    // One dash sets off one aside and reads fine. Two means a clause inside a clause, which is
    // the structural tic this pass exists to remove.
    const dashes = (sentence.match(/—/g) ?? []).length;
    if (dashes >= 2) err('stacked-asides', `${dashes} em dashes: "${shown}"`);

    if ((sentence.match(/\([^)]{12,}\)/g) ?? []).length > 1) {
      warn('parentheticals', `more than one aside: "${shown}"`);
    }
    for (const w of sentence.match(/\b[A-Z]{2,}\b/g) ?? []) {
      if (!ACRONYMS.has(w) && w !== 'CODE') warn('shouting', `"${w}"`);
    }
  }
  return out;
}

/**
 * A checkpoint explanation is prose, not a label, so it should read as a sentence. Catches the
 * fragment that slips in when an explanation is written like a table cell.
 */
export function lintExplanationShape(text: string, where: string): Finding[] {
  const t = stripCode(text).trim();
  if (!t) return [{ where, rule: 'explanation-empty', detail: 'no text', severity: 'error' }];
  const startsWell = /^[A-Z`"'“(]/.test(t) || /^CODE/.test(t);
  const endsWell = /[.?]["')”]?$/.test(t);
  const bad: Finding[] = [];
  if (!startsWell) bad.push({ where, rule: 'explanation-shape', detail: `starts "${t.slice(0, 40)}"`, severity: 'error' });
  if (!endsWell) bad.push({ where, rule: 'explanation-shape', detail: `ends "${t.slice(-40)}"`, severity: 'error' });
  return bad;
}
