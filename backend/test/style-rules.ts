/**
 * The mechanical half of docs/PLAYBOOK.md.
 *
 * These rules lint the text this project AUTHORS - the lesson cards, your-turn variations and
 * practice solutions under Data/Content/. They deliberately do NOT lint the lesson bodies, which
 * are generated from notebooks in a training repo this checkout does not have: a rule that fails
 * on text nobody here can edit turns `npm run verify` permanently red, and a check everyone
 * ignores is worse than no check.
 *
 * What they can and cannot prove is written out in docs/PLAYBOOK.md. In short: they catch known-bad
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
  // From the playbook audit: phrases that read as a colleague talking, not as course material.
  [/\bhome turf\b/i, 'home turf'],
  [/\bgymnastics\b/i, 'gymnastics'],
  [/\bwhole trick\b/i, 'whole trick'],
  [/\bfor free\b/i, 'for free'],
  [/\bneighbou?rhood\b/i, 'neighbourhood'],
  [/\bblow(s|ing)? up\b/i, 'blow up'],
  [/\bpoked at\b/i, 'poked at'],
];

/**
 * American spelling, to match Playwright, TypeScript and the APIs themselves (`color`,
 * `initialize`). The course was split, generated text mostly American and authored text mostly
 * British, which a reader notices as carelessness long before they could name it.
 */
const BRITISH: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(organi|recogni|normali|parameteri|memori|summari|emphasi|initiali|customi|minimi|prioriti|optimi|standardi|synchroni|seriali|categori|characteri)s(e|ed|es|ing|ation|ations)\b/i, '-ise (use -ize)'],
  [/\b(behaviour|colour|favourite|honour|labour)s?\b/i, '-our (use -or)'],
  [/\b(centre|metre|litre)s?\b/i, '-re (use -er)'],
  [/\b(catalogue|dialogue)s?\b/i, '-ogue (use -og)'],
  [/\b(cancell|travell|modell|labell)(ed|ing)\b/i, 'double l (use single)'],
];

/**
 * Words that describe how the lesson was made, or the notebook it was made in, rather than the
 * thing it teaches. A learner in a browser has no notebook, no cells and no kernel, and whether
 * an example was "verified live while writing this" is a note for the author, not the reader.
 */
const INSIDER: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnotebooks?\b/i, '"notebook"'],
  [/\bkernel\b/i, '"kernel"'],
  [/\bverified live\b/i, '"verified live"'],
  [/\bwhile writing this\b/i, '"while writing this"'],
  [/\bsource training session\b/i, '"source training session"'],
  [/_shared\//, 'an internal _shared/ path'],
  [/\byesterday\b/i, '"yesterday"'],
  // The notebook numbering: day 5, notebook 2. The page calls that lesson "Fundamentals", and its
  // heading calls it "Week 1 - Day 5 - Fundamentals"; "Day 5.2" appears nowhere a learner looks.
  [/\bDay \d+\.\d+\b/, 'an old "Day N.P" reference (use the tab name; see relabelDayRefs)'],
  // The same numbering as a bare link label, "[2.2](/learn/...)", and a path used as a label.
  [/\[\d+\.\d+\]\(/, 'a bare "[N.P]" link label'],
  [/\[week ?\d+\]\(/, 'a path-like "[week7]" link label'],
];

/**
 * Tools do not have opinions, feelings or intentions. "The runner is happy" and "the class has no
 * opinion" are vivid, but they make a beginner wonder what else the software is deciding. Say
 * what it does. A warning, because "reaches for" and "knows" have legitimate technical senses.
 */
const ANTHROPOMORPHISM: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(is|are) happy\b/i, '"is happy"'],
  [/\bhas no opinion\b|\bhave no opinion\b|\bany opinion\b/i, '"has an opinion"'],
  [/\bcomplain(s|ed|ing)?\b|\bcomplaint\b/i, '"complains"'],
  [/\btells? the truth\b/i, '"tells the truth"'],
  [/\b(is |are )?lying\b|\blies to\b/i, '"lying"'],
  [/\breach(es)? for\b/i, '"reaches for"'],
  [/\bobjected\b/i, '"objected"'],
  [/\bwants to\b/i, '"wants to"'],
];

/** Filler and intensifiers that add emphasis without adding meaning. Advisory. */
const FILLER: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bjust\b/i, 'just'],
  [/\bactually\b/i, 'actually'],
  [/\bgenuinely\b/i, 'genuinely'],
  [/\bfor real\b/i, 'for real'],
  [/\bbasically\b/i, 'basically'],
  [/\bsimply\b/i, 'simply'],
  [/\bwhole point\b/i, 'whole point'],
  [/\bobviously\b/i, 'obviously'],
];

const CONTRACTION = /\b\w+(?:n['’]t|['’](?:ll|re|ve|d|s|m))\b/gi;
/** "Sparingly": more than one contraction per this many words in a single string warns. */
export const CONTRACTION_WORDS_PER = 40;

/**
 * Every error-severity rule this module can emit. import-proof prints a PASS line for each, so a
 * clean run still shows what was checked. It is NOT the enforcement list: import-proof fails on
 * any error finding whether or not its rule appears here.
 */
export const ERROR_RULES: readonly string[] = [
  'banned-phrase',
  'defines-by-absence',
  'british-spelling',
  'insider-term',
  'exclamation',
  'sentence-length',
  'stacked-asides',
  'explanation-shape',
  'explanation-empty',
  'card-label',
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
  'TS', 'JS', 'HR', 'MCQ', 'AND', 'OR', 'NO', 'YES',
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
  for (const [re, name] of BRITISH) {
    const m = clean.match(re);
    if (m) err('british-spelling', `"${m[0]}" - ${name}`);
  }
  for (const [re, name] of INSIDER) {
    if (re.test(clean)) err('insider-term', name);
  }
  for (const [re, name] of ANTHROPOMORPHISM) {
    if (re.test(clean)) warn('anthropomorphism', name);
  }
  const fillers = FILLER.filter(([re]) => re.test(clean)).map(([, name]) => name);
  if (fillers.length) warn('filler', fillers.map((f) => `"${f}"`).join(', '));
  const contractions = clean.match(CONTRACTION) ?? [];
  const allowed = Math.max(1, Math.floor(words(clean) / CONTRACTION_WORDS_PER));
  if (contractions.length > allowed) {
    warn('contractions', `${contractions.length} in ${words(clean)} words (${contractions.slice(0, 4).join(', ')})`);
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
      if (!ACRONYMS.has(w) && w !== 'CODE') warn('emphasis-caps', `"${w}"`);
    }
  }
  return out;
}

/**
 * The at-a-glance card's row labels, in the order a card lists them. The course owner chose a
 * fixed, formal set: 53 different labels had grown across 36 cards ("Today's shape", "The idea
 * worth keeping", "Non-negotiable"), and a label invented per card reads as informal however good
 * the text beside it is. A row needing a label outside this set is a sign the row belongs elsewhere.
 */
export const CARD_LABELS: readonly string[] = [
  'Focus', 'Goals', 'Prerequisites', 'Tools', 'Environment', 'Scope', 'Key takeaway', 'Next',
];

export function lintCardLabels(md: string, where: string): Finding[] {
  const out: Finding[] = [];
  const labels = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map((m) => m[1]);
  for (const l of labels) {
    if (!CARD_LABELS.includes(l)) out.push({ where, rule: 'card-label', detail: `"${l}" is not one of: ${CARD_LABELS.join(', ')}`, severity: 'error' });
  }
  const known = labels.filter((l) => CARD_LABELS.includes(l));
  if (new Set(known).size !== known.length) out.push({ where, rule: 'card-label', detail: 'a label appears twice: merge the rows', severity: 'error' });
  const order = known.map((l) => CARD_LABELS.indexOf(l));
  if (order.some((n, i) => i > 0 && n < order[i - 1])) out.push({ where, rule: 'card-label', detail: 'rows are out of order: ' + known.join(', '), severity: 'error' });
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
