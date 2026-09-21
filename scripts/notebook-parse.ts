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
export function studioise(md: string): string {
  let out = md;

  // "> **Mode: explore.** Kernel must say **Deno** (top-right). These cells drive the
  //  Playwright library directly - run a cell, see what happened."
  // These callouts WRAP across two blockquote lines, so the whole quote run has to go.
  // Replacing only the first line leaves a dangling "> Playwright library directly ...".
  out = out.replace(
    /^>[^\n]*\*\*Mode: explore\.\*\*[^\n]*(?:\n>[^\n]*)*/gm,
    '> **Mode: explore.** Write code in the editor and press Run — it drives a real browser and ' +
      'shows you what happened.',
  );
  out = out.replace(
    /^>[^\n]*\*\*Mode: test-runner\.\*\*[^\n]*(?:\n>[^\n]*)*/gm,
    '> **Mode: test-runner.** This part is about running specs with the Playwright test runner. ' +
      'The studio editor runs library code, so follow these along in your own checkout.',
  );
  // Any surviving mention of the Jupyter kernel.
  out = out.replace(/Kernel must say \*\*Deno\*\*(?: \(top-right\))?\.?\s*/g, '');
  out = out.replace(/\bthe Deno kernel is happy to run either\b/g, 'the runner is happy with either');

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
          '> **Every Run starts fresh.** The studio executes your code in a new process each ' +
            'time, so nothing is left over between runs.',
        ];
      })
      .join('\n');
  }

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
 * A _4 notebook is: intro markdown, then three (heading, statement, stub) triples,
 * then a closing markdown. Everything outside the problems stays as ordinary blocks so
 * the intro's "no answer key" framing and the closing question are not lost.
 */
export function parsePractice(
  nb: RawNotebook,
  week: number,
): { blocks: ContentBlock[]; problems: PracticeProblem[] } {
  const blocks: ContentBlock[] = [];
  const problems: PracticeProblem[] = [];
  let current: { number: number; difficulty: Difficulty | null; statement: string[] } | null = null;

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
    blocks.push({ type: 'problem-ref', text: String(current.number) });
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
        blocks.push({ type: 'markdown', text: rewriteLinks(text, week) });
      }
    } else if (cell.cell_type === 'code') {
      if (current) flush(text.trim());
      else blocks.push({ type: isYourTurn(text) ? 'your-turn' : 'example', text });
    }
  }
  flush('');
  return { blocks, problems };
}

/** A teaching part (_1, _2, _3): ordered markdown / example / your-turn blocks. */
export function parseTeaching(nb: RawNotebook, week: number): ContentBlock[] {
  return nb.cells
    .filter((c) => c.cell_type === 'markdown' || c.cell_type === 'code')
    .map((c) => {
      const text = cellText(c);
      if (c.cell_type === 'markdown') {
        return { type: 'markdown' as const, text: rewriteLinks(text, week) };
      }
      return { type: isYourTurn(text) ? ('your-turn' as const) : ('example' as const), text };
    });
}

/** Tab labels. A bare "Part 2 / Part 3" tells the learner nothing, so use the part's own title. */
export function tabLabel(part: PartNumber, title: string): string {
  if (part === 1) return 'TypeScript';
  if (part === 4) return 'Practice';
  const head = title.split(':')[0].replace(/`/g, '').trim();
  return head.length <= 30 ? head : `${head.slice(0, 29).trimEnd()}\u2026`;
}
