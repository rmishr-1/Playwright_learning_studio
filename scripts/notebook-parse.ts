/**
 * Pure parsing helpers for the notebook importer. Kept separate from import-notebooks.ts
 * so the proof script can exercise them without touching the filesystem.
 */
import type { ContentBlock, PracticeProblem } from '../shared/contracts/course_day';
import type { Difficulty, PartNumber, ProblemNumber } from '../shared/contracts/common';

export type RawCell = { cell_type: string; source: string[] | string };
export type RawNotebook = { cells: RawCell[] };

export const cellText = (c: RawCell): string =>
  (Array.isArray(c.source) ? c.source.join('') : c.source ?? '').replace(/\r\n/g, '\n');

/**
 * The course writes its day titles as "# Week 2, Day 1.2 - From recorder to real code".
 * The dash is an em/en dash in most notebooks and a hyphen in a few, so accept all three.
 */
const TITLE_RE = /^#\s*Week\s+(\d+),\s*Day\s+(\d+)\.(\d+)\s*[\u2014\u2013-]\s*(.+?)\s*$/m;

export function parseTitle(nb: RawNotebook): string | null {
  for (const cell of nb.cells) {
    if (cell.cell_type !== 'markdown') continue;
    const m = TITLE_RE.exec(cellText(cell));
    if (m) return m[4].trim();
  }
  return null;
}

/**
 * A code cell that is nothing but comments is a "Your turn" stub, not an example.
 * The course uses these to make the learner retype an example from memory.
 */
export function isYourTurn(code: string): boolean {
  const meaningful = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));
  return meaningful.length === 0;
}

/**
 * Notebook cross-links become in-app navigation. Three shapes appear in the course:
 *   ../week1/day5_1.ipynb   cross-week
 *   day1_2.ipynb            same week
 *   ../_shared/CONCEPTS.md  the concepts ledger
 * A link left as a .ipynb path is a dead link in the browser, so this must catch all of them.
 */
export function rewriteLinks(md: string, currentWeek: number): string {
  return studioise(
    md
    .replace(/\]\(\.\.\/week(\d+)\/day(\d+)_(\d+)\.ipynb\)/g, '](/learn/w$1/d$2/p$3)')
    .replace(/\]\(\.?\/?day(\d+)_(\d+)\.ipynb\)/g, `](/learn/w${currentWeek}/d$1/p$2)`)
    .replace(/\]\((?:\.\.\/)*_shared\/CONCEPTS\.md\)/g, '](/concepts)')
      .replace(/\]\((?:\.\.\/)*week(\d+)\/generated\/[^)]*\)/g, '](/learn/w$1)'),
  );
}

/** Any .ipynb link the rewrite missed — the proof script fails the build on these. */
export function findUnresolvedLinks(md: string): string[] {
  return [...md.matchAll(/\]\(([^)]*\.ipynb[^)]*)\)/g)].map((m) => m[1]);
}

/**
 * The prose was written for someone sitting in Jupyter. On the web, instructions like
 * "Kernel must say Deno (top-right)" are not merely stale - they tell the learner to do
 * something impossible. This rewrites the environment-specific bits, and nothing else:
 * the teaching is left exactly as the author wrote it.
 */
/**
 * Wording this project emitted before the language pass, mapped to what it says now. Applied by
 * studioise(), which runs both at import and over the already-generated tree via
 * `npm run overlay` - so a copy change reaches learners without a re-import.
 */
const LEGACY_COPY: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /> \*\*Every Run starts fresh\.\*\* The studio executes your code in a new process each time, so nothing is left over between runs\./g,
    '> **Every run starts fresh.** Each time you press Run, your code starts from a clean ' +
      'slate. Nothing from a previous run is still in memory.',
  ],
  [/\bthe runner is happy with either\b/g, 'either form will run'],
  // Compound labels the course author wrote by hand. Replaced whole, because swapping only the
  // "Mode:" part of them would leave "**Try it here + run-it-yourself.**".
  [
    /\*\*Mode: explore \+ run-it-yourself\.\*\*/g,
    '**Partly here, partly in your own project.**',
  ],
  [
    /\*\*Mode: test-runner, own config\.\*\*/g,
    '**Follow this one in your own project, which needs its own config.**',
  ],
  // The remaining variants read "**Mode: explore**, with one real spec at the end." - the label is
  // boilerplate, the clause after it is the author's note about THIS lesson. Swap the label only.
  [/\*\*Mode: explore\*\*/g, '**Try it here**'],
  [/\*\*Mode: test-runner\*\*/g, '**Follow this one in your own project**'],
  [/\*\*Mode: mixed\.\*\*/g, '**Partly here, partly in your own project.**'],
  // "Deno" is the notebook kernel the course was authored against. It is an implementation
  // detail of the old environment and means nothing to a learner reading this in a browser.
  [/\s*\(Deno\)/g, ''],
];

/**
 * Still carrying a "Mode:" label: week 4's "read-and-compare", week 6's "read-and-do" and
 * "Mode: Deno". Those weeks are locked and unreleased, and their prose is expected to be
 * revised before they open, so they are deliberately left rather than churned now.
 * docs/PLAYBOOK.md records them as work for whoever opens those weeks.
 */

/**
 * Copy that studioise() is supposed to have upgraded already. Used by import-proof to prove the
 * shipped days carry no superseded wording: the rewrites live in scripts, which only run on
 * import or `npm run overlay`, so without this check a day file can silently keep old text that
 * nobody sees again until a learner does.
 */
export function findSupersededCopy(md: string): string[] {
  const out: string[] = [];
  for (const [was] of LEGACY_COPY) {
    const m = md.match(new RegExp(was.source, was.flags.replace('g', '') + 'g'));
    if (m) out.push(m[0].slice(0, 60).replace(/\s+/g, ' '));
  }
  if (/\bMode:\s*(?:explore|test-runner|mixed)\b/.test(md)) out.push('a "Mode:" label');
  return out;
}

/**
 * The entire body of the synthesised TypeScript part on week 1 days 1-4: a heading, and nothing
 * else. The authored at-a-glance card that sits directly beneath it already names what is new
 * today, when the language lessons start and where to go next, so generated prose saying the same
 * thing in sentences was redundant on the first screen of the course.
 *
 * This is the SINGLE source of truth for that body. It is called by placeholderPart() on import
 * and by applyGeneratedPlaceholder() on every `npm run overlay`, so the shipped text cannot drift
 * from it. That replaces the LEGACY_COPY pattern for this one part: an old->new entry per
 * rewording only upgrades text it recognises and the chain has to be revised in step, whereas
 * rewriting the block wholesale is self-healing whatever a checkout currently holds.
 *
 * The heading is emitted in the raw notebook form on purpose. applyHeadingFormat() normalises it
 * to "# Week N - Day D - TypeScript" straight afterwards, so one rule stays in charge of headings.
 */
/**
 * Banners that open a lesson by naming what it does NOT contain: "No new TypeScript today",
 * "No new API here", "No code today". They read as an apology for the page a learner has just
 * opened, and a first-time reader has not yet been told what a normal day contains, so the
 * absence means nothing to them. Each is replaced by the half of it that says something - where
 * the course has got to, and what this lesson does - or dropped where the at-a-glance card
 * directly beneath already carries that.
 *
 * These are notebook-derived, so they cannot be fixed at source from this checkout. They are
 * matched whole, blockquote run and all, because replacing only the first line would leave the
 * continuation lines dangling as a quote with no opening.
 */
const ABSENCE_BANNERS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /> \*\*No code today\.\*\* This is an orientation day — theory and one "go look at this" step\.\s*\n> Cells start appearing from \[Day 2\]\(\/learn\/w1\/d2\/p2\) onward, once there's an environment to\s*\n> run them in\./g,
    "> **An orientation day.** Theory, plus one \"go and look at this\" step. The hands-on work\n" +
      "> starts at [Day 2](/learn/w1/d2/p2), once there is an environment to run it in.",
  ],
  [
    /> \*\*No new TypeScript today\.\*\* This is npm\/CLI\/editor setup, not language syntax — nothing\s*\n> to primer, so there's no Day 2\.1\. \[Day 1\.2\]\(\/learn\/w1\/d1\/p2\) covered the why; this is the\s*\n> how\./g,
    '> **Setup, not syntax.** [Day 1](/learn/w1/d1/p2) covered why teams automate. This is the how.',
  ],
  [
    /> No new API here — "advanced" for a setup day means organizing what Day 2\.2 gave you\s*\n> sensibly, not new Playwright calls\./g,
    '> **Organising what you already have.** "Advanced" on a setup day means arranging the\n' +
      '> scaffold from [Day 2](/learn/w1/d2/p2) so a team can navigate it.',
  ],
  [
    /> \*\*No new TypeScript today\*\* — the CLI commands below are shell commands, not language\s*\n> syntax, so there's no Day 3\.1\. \[Day 2\]\(\/learn\/w1\/d2\/p2\) got your environment ready; this is\s*\n> where you actually use it\./g,
    '> **Shell commands, not language syntax.** [Day 2](/learn/w1/d2/p2) got your environment\n' +
      '> ready. This is where you actually use it.',
  ],
  [
    /> \*\*No new TypeScript today\*\* — locator strings and file naming aren't new language syntax,\s*\n> so there's no Day 4\.1\. \[Day 2\]\(\/learn\/w1\/d2\/p2\) and \[Day 3\]\(\/learn\/w1\/d3\/p2\) got you set up\s*\n> and running; today is about \*finding\* what to put inside a test\./g,
    '> **Finding what goes inside a test.** [Day 2](/learn/w1/d2/p2) and [Day 3](/learn/w1/d3/p2)\n' +
      '> got you set up and running. Today is about locating the controls to act on.',
  ],
  [
    /> \*\*No new API here either\*\* — this slot is normally "the same API, inside a framework", but\s*\n> there's no framework yet\. Today it's the same locators from Day 4\.2, used to prove a rule\s*\n> about \*discovery\* rather than to teach a new call\./g,
    '> **The same locators, a different point.** Today uses the locators from\n' +
      '> [Fundamentals](/learn/w1/d4/p2) to prove a rule about *discovery*: which files the runner\n' +
      '> will even look at.',
  ],
  [
    /> \*\*No new API here on purpose\.\*\* `getByPlaceholder`, `getByRole`, `fill`, `click` — all\s*\n> already used in Day 5\.2\. The only new thing is the structure around them\. The repo has no\s*\n> `framework\/` folder yet \(that comes later\), so this class is written \*\*inline in the spec\s*\n> file below\*\* — a shape you're seeing, not a file the repo ships yet\./g,
    '> **The same calls, a new shape.** `getByPlaceholder`, `getByRole`, `fill` and `click` all\n' +
      '> come from [Fundamentals](/learn/w1/d5/p2); the structure around them is what is new. The\n' +
      '> class is written **inline in the spec file below**, as a shape to recognise rather than a\n' +
      '> file the repo ships.',
  ],
  // Three the same reflex, in running prose rather than a banner.
  [
    /No code cell for this one — open a real browser tab and look around\./g,
    'Open a real browser tab and look around.',
  ],
  [
    /No Day 1\.3 — there's no code yet to reorganize into a framework shape\. Straight to\s*\n\[Day 1\.4 — Practice\]\(\/learn\/w1\/d1\/p4\) for some reflection problems, then \[Day 2\]\(\/learn\/w1\/d2\/p2\)\s*\ngets your environment running\./g,
    'Go to [Practice](/learn/w1/d1/p4) for some reflection problems, then\n' +
      '[Day 2](/learn/w1/d2/p2) gets your environment running.',
  ],
  [
    /No code today, and no app to test against yet — so these are reflection and research\s*\nproblems instead of programming ones\. Same three tiers as every practice day, adapted to\s*\nwhat you actually have available right now\./g,
    'Three reflection and research problems, in the same three tiers as every practice day.',
  ],
];

export function placeholderBody(week: number, day: number): string {
  return '# Week ' + week + ', Day ' + day + '.1 \u2014 TypeScript for this lesson\n';
}

/** The `title` that goes with it. Never rendered - the tab bar uses `tab_label` - but it is data
 *  a re-import would otherwise leave reading "TypeScript check-in: nothing new today". */
export const PLACEHOLDER_TITLE = 'TypeScript for this lesson';

export function studioise(md: string): string {
  let out = md;

  // "> **Mode: explore.** Kernel must say **Deno** (top-right). These cells drive the
  //  Playwright library directly - run a cell, see what happened."
  // These callouts WRAP across two blockquote lines, so the whole quote run has to go.
  // Replacing only the first line leaves a dangling "> Playwright library directly ...".
  out = out.replace(
    /^>[^\n]*\*\*Mode: explore\.\*\*[^\n]*(?:\n>[^\n]*)*/gm,
    '> **Try it here.** Write code in the editor on the right and press Run. Your code drives a ' +
      'real browser, and the results appear beside it.',
  );
  out = out.replace(
    /^>[^\n]*\*\*Mode: test-runner\.\*\*[^\n]*(?:\n>[^\n]*)*/gm,
    '> **Follow this one in your own project.** These examples are run by the Playwright test ' +
      'runner, which the editor here does not provide. Copy them into your own checkout to run them.',
  );
  // Any surviving mention of the Jupyter kernel.
  // [ \t]* rather than \s*: the old \s* also ate the newlines after the phrase, which glued the
  // NEXT line - a `## ` heading, in W2D4P2 - onto the end of this banner, where it rendered as
  // literal "## ..." text inside a quote.
  out = out.replace(/Kernel must say \*\*Deno\*\*(?: \(top-right\))?\.?[ \t]*/g, '');
  // Repairs text that the old pattern already damaged: a heading glued onto the end of a
  // blockquote sentence goes back onto its own line. Idempotent - once split, it cannot match.
  out = out.replace(/^(>[^\n]*[.:])[ \t]+(#{2,6} [^\n]*)$/gm, '$1\n\n$2');
  out = out.replace(/\bthe Deno kernel is happy to run either\b/g, 'either form will run');

  // The "restart the kernel when a const is already declared" callouts. In the studio every
  // Run is a fresh process, so the advice is not just impossible - the problem cannot occur.
  // These span one or two blockquote lines, so drop by line and leave one note behind.
  if (/Kernel must say Deno|Kernel\s*(?:\*\*)?\s*(?:→|->)\s*(?:\*\*)?\s*Restart/.test(out)) {
    let noted = false;
    out = out
      .split('\n')
      .flatMap((line) => {
        const isKernelLine =
          /Kernel must say Deno/.test(line) ||
          /Kernel\s*(?:\*\*)?\s*(?:→|->)\s*(?:\*\*)?\s*Restart/.test(line);
        if (!isKernelLine) return [line];
        if (noted) return [];
        noted = true;
        return [
          '> **Every run starts fresh.** Each time you press Run, your code starts from a clean ' +
            'slate. Nothing from a previous run is still in memory.',
        ];
      })
      .join('\n');
  }

  // Copy this project itself emitted in an earlier pass, upgraded to the current wording.
  // The two callouts above are already caught by their own patterns, because those match on
  // text the replacement removes. These two are not, so without this the old phrasing would
  // survive in every day file until someone re-imported from the notebooks - which needs the
  // training repo. See docs/PLAYBOOK.md.
  for (const [was, now] of LEGACY_COPY) out = out.replace(was, now);
  for (const [was, now] of ABSENCE_BANNERS) out = out.replace(was, now);

  // Link LABELS still reading like file paths: [week3/day2_1.ipynb](/learn/w3/d2/p1).
  // The href was rewritten; without this the learner still sees a filename.
  out = out.replace(
    /\[([^\]]*?)week(\d+)\/day(\d+)_(\d+)\.ipynb([^\]]*?)\]/g,
    (_m, pre: string, w: string, d: string, p: string, post: string) =>
      '[' + pre + 'Week ' + w + ', Day ' + d + '.' + p + post + ']',
  );

  // "this notebook" reads wrong on a web page. Only touch the bare word, never a path or a
  // code span - hence the backtick and slash guards.
  out = out.replace(/(?<![`/\w])notebooks(?![`/\w])/g, 'lessons');
  out = out.replace(/(?<![`/\w])notebook(?![`/\w])/g, 'lesson');

  return out;
}

/** Notebook-only wording the studio must not show. The proof script fails on any of these. */
export function findNotebookisms(md: string): string[] {
  const found: string[] = [];
  if (/Kernel must say/i.test(md)) found.push('Kernel must say');
  if (/\.ipynb/.test(md)) found.push('.ipynb');
  if (/(?<![`/\w])notebook(?![`/\w])/i.test(md)) found.push('notebook');
  // Leftovers from a partially-rewritten callout still read as Jupyter instructions.
  if (/run a cell|cells drive the/i.test(md)) found.push('run a cell');
  return found;
}

/**
 * Two heading shapes appear across the course, and both must be caught or a whole week's
 * practice silently imports as zero problems:
 *   "## Problem 2 - Intermediate"   weeks 1-4 and 8
 *   "### 2. A third tag"            weeks 5-7, numbered but unlabelled
 * The trailing [^\n]* on the labelled form absorbs "Reflection, no code".
 */
const PROBLEM_LABELLED_RE =
  /^##\s*Problem\s*(\d+)\s*[\u2014\u2013-]\s*(Beginner|Intermediate|Advanced|Reflection)[^\n]*$/im;
const PROBLEM_NUMBERED_RE = /^###\s*(\d+)\.\s+(.+?)\s*$/im;

/** Returns the problem a heading opens, or null when the cell is ordinary markdown. */
function matchProblemHeading(
  text: string,
): { number: number; difficulty: Difficulty | null; rest: string } | null {
  const labelled = PROBLEM_LABELLED_RE.exec(text);
  if (labelled) {
    return {
      number: Number(labelled[1]),
      difficulty: labelled[2] as Difficulty,
      rest: text.replace(PROBLEM_LABELLED_RE, '').trim(),
    };
  }
  const numbered = PROBLEM_NUMBERED_RE.exec(text);
  if (numbered) {
    // Keep the title - it is the only description these problems carry.
    return {
      number: Number(numbered[1]),
      difficulty: null,
      rest: text.replace(PROBLEM_NUMBERED_RE, '**' + numbered[2] + '**').trim(),
    };
  }
  return null;
}

/**
 * The setup lines out of an example: harness import stripped (explore mode needs none), then
 * everything through the first `page.goto(...)` - launch(), any base-URL constant the goto
 * needs, and the navigation itself. Deliberately stops there rather than guessing how much of
 * what follows is "setup" versus the concept the example is actually teaching, so a your-turn
 * or practice stub built from it gets you TO the page, never partway through solving the
 * exercise for you. A multi-step setup (e.g. a login the example does before its own real work)
 * is only partially captured this way - a known, accepted limit, not a bug: partial setup still
 * beats none.
 */
export function extractBoilerplate(exampleText: string): string | null {
  // Refuse anything not runnable in the explore-mode harness itself - the same signals
  // Markdown.tsx's isExecutable() checks for the Run button. Without this, a `writeProjectFile`
  // example's `page.goto(...)` INSIDE its own nested spec string (text, not executable code
  // here) gets mistaken for real setup, handing the learner a broken starter built around
  // functions the harness never provides.
  if (/\bDeno\b/.test(exampleText)) return null;
  if (/\b(writeProjectFile|runSpec)\s*\(/.test(exampleText)) return null;
  if (/\b(test|expect)\s*\(/.test(exampleText)) return null;

  const withoutHarnessImports = exampleText
    .split('\n')
    .filter(
      (l) =>
        !/^\s*import\s+\{[^}]*\}\s+from\s+["'](?:\.\.\/)*_shared\/deno-helpers(?:\.ts)?["'];?\s*$/.test(
          l,
        ),
    )
    .join('\n')
    .replace(/^\n+/, '');

  const lines = withoutHarnessImports.split('\n');
  const gotoIndex = lines.findIndex((l) => /\bawait\s+page\.goto\(/.test(l));
  if (gotoIndex === -1) return null;
  return lines
    .slice(0, gotoIndex + 1)
    .join('\n')
    .trim();
}

/**
 * Searches a run of examples MOST-RECENT-FIRST for the nearest one that yields real boilerplate.
 * Not simply the last example: a part's final example is very often the "write this out as a
 * real project file and run it with the CLI" pattern (see extractBoilerplate's own guards) - the
 * teaching point right before it usually is not. Falling back to an earlier example beats
 * leaving a your-turn or a practice problem with no starter just because the day happened to end
 * on one the harness cannot run.
 */
export function nearestBoilerplate(examples: string[]): string | null {
  for (let i = examples.length - 1; i >= 0; i--) {
    const boilerplate = extractBoilerplate(examples[i]);
    if (boilerplate) return boilerplate;
  }
  return null;
}

/**
 * A _4 notebook is: intro markdown, then three (heading, statement, stub) triples,
 * then a closing markdown. Everything outside the problems stays as ordinary blocks so
 * the intro's "no answer key" framing and the closing question are not lost.
 */
export function parsePractice(
  nb: RawNotebook,
  week: number,
): { blocks: ContentBlock[]; problems: PracticeProblem[]; examples: string[] } {
  const blocks: ContentBlock[] = [];
  const problems: PracticeProblem[] = [];
  let current: { number: number; difficulty: Difficulty | null; statement: string[] } | null = null;
  // Every example cell seen so far, in document order, so a your-turn right after one (rare in a
  // practice notebook, but it happens) draws on the nearest RUNNABLE one via nearestBoilerplate()
  // rather than just whichever happened to come last. Handed back whole to the importer, which
  // uses it as the practice PROBLEMS' own boilerplate source when this part carries examples.
  const examples: string[] = [];

  const flush = (stub: string) => {
    if (!current) return;
    problems.push({
      number: current.number as ProblemNumber,
      difficulty: current.difficulty,
      statement: rewriteLinks(current.statement.join('\n\n').trim(), week),
      stub,
      solution: null,
    });
    // Record WHERE the problem sat. Without this marker the renderer put every paragraph
    // before every problem, so the closing "When you are done" note landed above Problem 1.
    blocks.push({ type: 'problem-ref', text: String(current.number), starter: null, variation: null, checkpoint: null });
    current = null;
  };

  for (const cell of nb.cells) {
    const text = cellText(cell);
    if (cell.cell_type === 'markdown') {
      const m = matchProblemHeading(text);
      if (m) {
        // A heading with no stub between it and the next heading still yields a problem.
        flush('');
        current = { number: m.number, difficulty: m.difficulty, statement: [m.rest] };
      } else if (current) {
        current.statement.push(text);
      } else {
        blocks.push({ type: 'markdown', text: rewriteLinks(text, week), starter: null, variation: null, checkpoint: null });
      }
    } else if (cell.cell_type === 'code') {
      if (current) {
        flush(text.trim());
      } else if (isYourTurn(text)) {
        blocks.push({ type: 'your-turn', text, starter: nearestBoilerplate(examples), variation: null, checkpoint: null });
      } else {
        blocks.push({ type: 'example', text, starter: null, variation: null, checkpoint: null });
        examples.push(text);
      }
    }
  }
  flush('');
  return { blocks, problems, examples };
}

/** A teaching part (_1, _2, _3): ordered markdown / example / your-turn blocks. */
export function parseTeaching(
  nb: RawNotebook,
  week: number,
): { blocks: ContentBlock[]; examples: string[] } {
  const blocks: ContentBlock[] = [];
  const examples: string[] = [];

  for (const c of nb.cells) {
    if (c.cell_type !== 'markdown' && c.cell_type !== 'code') continue;
    const text = cellText(c);
    if (c.cell_type === 'markdown') {
      blocks.push({ type: 'markdown', text: rewriteLinks(text, week), starter: null, variation: null, checkpoint: null });
      continue;
    }
    if (isYourTurn(text)) {
      // Usually echoes the example directly above it, but that one is sometimes a
      // writeProjectFile/CLI cell the harness cannot run - nearestBoilerplate() walks
      // backward past it to the nearest one that is.
      blocks.push({ type: 'your-turn', text, starter: nearestBoilerplate(examples), variation: null, checkpoint: null });
    } else {
      blocks.push({ type: 'example', text, starter: null, variation: null, checkpoint: null });
      examples.push(text);
    }
  }
  return { blocks, examples };
}

/**
 * Tab labels name the part's ROLE in the day, not its subject.
 *
 * Parts 1 and 4 always did ("TypeScript", "Practice"); 2 and 3 used to carry a truncated copy of
 * their own title, which the day's H1 already states two lines below the tab. That left the tab
 * bar restating the heading in labels clipped mid-word - "The same assertions, wrapped...",
 * "A first look inside playwrigh..." - and made every day's tabs a different width and shape.
 * Naming the role instead gives one rhythm to learn: what the language needs, the technique, how
 * a real project writes it, then your turn.
 */
export function tabLabel(part: PartNumber): string {
  switch (part) {
    case 1:
      return 'TypeScript';
    case 2:
      return 'Fundamentals';
    case 3:
      return 'Implementation';
    case 4:
      return 'Practice';
  }
}
