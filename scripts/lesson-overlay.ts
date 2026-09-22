/**
 * Merges an authored lesson overlay (Data/Content/lessons/) into an imported day.
 *
 * Why this is its own module rather than a few lines inside import-notebooks.ts: the merge has to
 * run in two places. The importer calls it so a full re-import keeps the authored sections, and
 * `npm run overlay` (scripts/apply-overlay.ts) calls it over the already-imported tree so overlays
 * can be authored and seen without a training-repo checkout - which is the normal case for anyone
 * working on lesson wording rather than on the course itself.
 *
 * Two properties make running it both ways safe:
 *  - it is PURE: it returns a new day and mutates neither argument;
 *  - it is IDEMPOTENT: it strips the blocks it owns before re-inserting them, so applying an
 *    overlay twice (import, then overlay again) yields exactly the day applying it once does.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { placeholderBody, PLACEHOLDER_TITLE, relabelDayRefs, studioise, tabLabel } from './notebook-parse';
import { LessonOverlay, type OverlayPart } from '../shared/contracts/lesson_overlay';
import type { ContentBlock, CourseDay, CoursePart } from '../shared/contracts/course_day';

/** The three types an overlay owns. Anything else in a part came from a notebook and is left alone. */
const OVERLAY_TYPES: ReadonlySet<ContentBlock['type']> = new Set([
  'at-a-glance',
  'checkpoint',
  'recap',
]);

function block(type: ContentBlock['type'], text: string): ContentBlock {
  return { type, text, starter: null, variation: null, checkpoint: null };
}

/**
 * Where the closing sections go. They belong before a trailing "What's next" pointer, so a lesson
 * reads: teach it, check you have it, sum it up, then say where to go. Appending blindly would put
 * the recap after the learner has already been sent to the next day.
 *
 * Six of week 2's twenty parts end with one cell that runs an example's "Expected result" straight
 * into the "What's next" heading, because that is how the notebook cell was written. For those the
 * block is SPLIT at the heading: every character and its order is preserved, only the boundary
 * between two blocks is new, and the cards then land where they read correctly.
 */
function closingInsertionPoint(blocks: ContentBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== 'markdown') break;
    const heading = /^##\s+What's next/im.exec(b.text);
    if (!heading) continue;

    const before = b.text.slice(0, heading.index).trimEnd();
    if (!before) return i; // the block is the pointer and nothing else
    blocks.splice(i, 1, { ...b, text: before }, { ...b, text: b.text.slice(heading.index) });
    return i + 1;
  }
  return blocks.length;
}

/**
 * Where the opening section goes: directly after the lesson's H1, which every imported part opens
 * with. Falls back to the very top for a part that somehow has no heading, rather than guessing.
 */
function openingInsertionPoint(blocks: ContentBlock[]): number {
  const first = blocks[0];
  return first && first.type === 'markdown' && /^#\s/.test(first.text) ? 1 : 0;
}

function applyToPart(part: CoursePart, overlay: OverlayPart): CoursePart {
  // Idempotence: drop what a previous application of this same overlay put in, so the insertion
  // points below are computed against the generated blocks alone.
  const blocks = part.blocks.filter((b) => !OVERLAY_TYPES.has(b.type));

  const closing: ContentBlock[] = [];
  for (const c of overlay.checkpoints ?? []) {
    closing.push({
      type: 'checkpoint',
      text: c.question,
      starter: null,
      variation: null,
      checkpoint: { options: c.options, answer: c.answer, explanation: c.explanation },
    });
  }
  if (overlay.recap) closing.push(block('recap', overlay.recap));
  if (closing.length > 0) blocks.splice(closingInsertionPoint(blocks), 0, ...closing);

  if (overlay.at_a_glance) {
    blocks.splice(openingInsertionPoint(blocks), 0, block('at-a-glance', overlay.at_a_glance));
  }

  return { ...part, blocks };
}

/** Pure: returns a new day, mutating neither argument. */
export function applyOverlay(day: CourseDay, overlay: LessonOverlay): CourseDay {
  return {
    ...day,
    parts: day.parts.map((part) => {
      const forPart = overlay.parts[String(part.part) as '1' | '2' | '3' | '4'];
      return forPart ? applyToPart(part, forPart) : part;
    }) as CourseDay['parts'],
  };
}

/**
 * Merges the your-turn variations side-car. Lives here beside applyOverlay() so the importer and
 * `npm run overlay` share ONE implementation - when the two had a copy each, the standalone path
 * silently left every your-turn on its generic "retype from memory" text.
 *
 * your-turn blocks are not numbered in the source the way practice problems are, so they are
 * addressed positionally: 'p<part>_yt<n>' is the Nth your-turn in THAT part, in document order.
 */
export function applyVariations(day: CourseDay, variations: Record<string, string>): CourseDay {
  return {
    ...day,
    parts: day.parts.map((part) => {
      let n = 0;
      return {
        ...part,
        blocks: part.blocks.map((b) => {
          if (b.type !== 'your-turn') return b;
          n++;
          const prompt = variations['p' + part.part + '_yt' + n];
          return { ...b, variation: prompt ? { prompt } : null };
        }),
      };
    }) as CourseDay['parts'],
  };
}

/**
 * Re-derives the fields the importer COMPUTES rather than reads from a notebook - today just the
 * tab label. Changing such a rule otherwise reaches only the days someone re-imports afterwards,
 * and re-importing needs the 147-notebook training repo, so in practice the rule and the
 * committed tree drift apart silently. Running this wherever `npm run overlay` runs keeps them
 * converged from the one definition in tabLabel().
 */
export function applyDerivedLabels(day: CourseDay): CourseDay {
  return {
    ...day,
    parts: day.parts.map((p) => ({ ...p, tab_label: tabLabel(p.part) })) as CourseDay['parts'],
  };
}

/**
 * Weeks whose page headings follow the "Week N - Day D - <Tab>" rule. Weeks 1 and 2, which is
 * every week that is open. Add a week here to bring it in; nothing else needs to change.
 */
export const ROLE_HEADING_WEEKS: ReadonlySet<number> = new Set([1, 2]);

/**
 * The two shapes a heading can arrive in, both rewritten to the same output.
 *
 * DAY_HEADING is the raw notebook form, `# Week 2, Day 1.2 - From recorder to real code`: the
 * DOT is what marks it. REWRITTEN_HEADING is the interim comma form this project emitted before
 * the separator became " - ", `# Week 1, Day 1, Fundamentals - Why automation`. Week 1's
 * committed tree is entirely in that second form, and the first pattern does not match it - so
 * without this migration those headings would keep their commas forever, because a re-import
 * (which is what would otherwise regenerate them) needs a training repo this checkout lacks.
 *
 * IDEMPOTENCE, which is what makes this safe to run on every `npm run overlay`: both patterns
 * require a structural COMMA after "Week N", and the output has none. So neither pattern can
 * match its own result. Note this anchors on the comma rather than on a dash, which is why a
 * subject containing a hyphen ("Codegen - run this yourself") cannot confuse it.
 */
const DAY_HEADING = /^#\s+Week\s+(\d+),\s+Day\s+(\d+)\.(\d+)\s*[—–-]\s*(.*)$/;
const REWRITTEN_HEADING =
  /^#\s+Week\s+(\d+),\s+Day\s+(\d+),\s+(?:TypeScript|Fundamentals|Implementation|Practice)(?:\s*[—-]\s*(.*))?$/;

/**
 * Headings that announce the absence of content rather than naming a concept. These lose their
 * text entirely and keep only the standard prefix; everything else keeps what it says. Note that
 * Week 1 Day 5.1 - "Arrow functions, `async`, and reading `import`" - is a real primer on a
 * TypeScript tab, so matching on the TAB would have thrown that heading away. The same protection
 * covers week 2's two real primers, on days 2 and 3.
 */
const PLACEHOLDER_HEADING: readonly RegExp[] = [
  /typescript check-?in/i,
  /nothing new today/i,
  /no new concepts?\b/i,
  /nothing to primer/i,
];

/**
 * `generated` is true for the placeholder part the importer synthesises on week 1 days 1-4. Its
 * heading is matched on the part's KIND rather than on its words, because matching words couples
 * this file to whatever placeholderPart() currently writes - and that coupling had already broken
 * once: the function was reworded, stopped matching, and a re-import would have produced
 * "Week 1 - Day 1 - TypeScript - TypeScript for this lesson".
 */
function rewriteHeading(text: string, tab: string, generated: boolean): string | null {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => DAY_HEADING.test(l) || REWRITTEN_HEADING.test(l));
  if (i === -1) return null;

  // Either form yields the same three things: the week, the day, and whatever the heading said
  // about the lesson. The raw form carries a part number as well, which is dropped - the tab
  // name says which part this is, and saying it twice is what the rule exists to stop.
  const raw = DAY_HEADING.exec(lines[i]);
  const [week, dayNumber, rest] = raw
    ? [raw[1], raw[2], raw[4]]
    : (([, w, d, r]) => [w, d, r ?? ''])(REWRITTEN_HEADING.exec(lines[i])!);

  let content = rest.trim();
  if (generated || PLACEHOLDER_HEADING.some((p) => p.test(content))) {
    content = '';
  } else {
    // "Practice: Codegen and locators" under a tab already called Practice says it twice, and so
    // does "TypeScript - TypeScript for building a unique value". Strip a leading repeat of the
    // tab's own name, however the course joined it on. Dropping the prefix promotes what followed
    // to the start of a clause, where the course's own lower-case ("Practice: environment setup")
    // would now read as a typo - so capitalise it.
    const stutter = new RegExp('^' + tab + '\\s*(?:[:—-]\\s*|for\\s+)', 'i');
    const stripped = content.replace(stutter, '');
    if (stripped !== content) content = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  const prefix = '# Week ' + week + ' - Day ' + dayNumber + ' - ' + tab;
  lines[i] = content ? prefix + ' - ' + content : prefix;
  return lines.join('\n');
}

/**
 * Tabs removed from the course because they carry no content of their own. The standing rule is in
 * docs/PLAYBOOK.md: a tab that lacks content, or whose lesson needs none, is removed rather than
 * filled with prose explaining why it is empty, and the day opens on its next tab.
 *
 * Part NUMBERS are not renumbered when a tab goes. The number is what derives the tab's role
 * (tabLabel: 1 is always TypeScript, 2 always Fundamentals) and it is in every lesson URL, so
 * shifting Fundamentals from 2 to 1 would relabel it "TypeScript" and break every link to it.
 * Nothing a learner sees shows the number, so removing the tab is enough: the remaining tabs close
 * up and the day's H1 already reads "Week 1 - Day 1 - Fundamentals".
 *
 * Keyed "w<week>d<day>p<part>". Add a key here to remove another tab.
 */
export const REMOVED_PARTS: ReadonlySet<string> = new Set(['w1d1p1', 'w1d2p1', 'w1d3p1', 'w1d4p1']);

export function applyRemovedParts(day: CourseDay): CourseDay {
  const kept = day.parts.filter((p) => !REMOVED_PARTS.has('w' + day.week + 'd' + day.day + 'p' + p.part));
  return kept.length === day.parts.length ? day : { ...day, parts: kept as CourseDay['parts'] };
}

/**
 * Re-applies the synthesised body of the generated TypeScript part on week 1 days 1-4.
 *
 * This part has no notebook behind it, so unlike every other block on the site its text is owned
 * outright by this repository - which means the overlay can simply rewrite it from
 * placeholderBody() rather than patching the old wording forward. It is idempotent because it
 * writes a constant, and self-healing for the same reason: it does not need to recognise what a
 * checkout currently holds in order to replace it. That is what retired the pair of LEGACY_COPY
 * entries this part used to need, one per rewording.
 *
 * Runs BEFORE applyHeadingFormat, which then normalises the raw heading it writes.
 */
export function applyGeneratedPlaceholder(day: CourseDay): CourseDay {
  return {
    ...day,
    parts: day.parts.map((part) => {
      if (part.kind !== 'generated-prerequisite') return part;
      return {
        ...part,
        title: PLACEHOLDER_TITLE,
        blocks: part.blocks.map((b, i) =>
          i === 0 && b.type === 'markdown' ? { ...b, text: placeholderBody(day.week, day.day) } : b,
        ),
      };
    }) as CourseDay['parts'],
  };
}

/**
 * Standardises each part's page heading on "Week N - Day D - <Tab>", keeping whatever the heading
 * said about the lesson itself after a further " - ".
 *
 * Only the STRUCTURAL separators are hyphens. A comma inside the subject is ordinary prose and is
 * left exactly as written ("Why automation, why Playwright"), and `##`/`###` subheadings are never
 * touched at all - the pattern requires a single `#` followed by whitespace.
 *
 * Like applyDerivedLabels(), this is a RULE rather than authored text, so it lives here and runs
 * on every `npm run overlay` - a heading edited into the generated JSON by hand would not survive
 * the next import. See the note on the patterns above for why it is idempotent.
 */
export function applyHeadingFormat(day: CourseDay): CourseDay {
  if (!ROLE_HEADING_WEEKS.has(day.week)) return day;
  return {
    ...day,
    parts: day.parts.map((part) => {
      const tab = tabLabel(part.part);
      return {
        ...part,
        blocks: part.blocks.map((b) => {
          if (b.type !== 'markdown') return b;
          const rewritten = rewriteHeading(b.text, tab, part.kind === 'generated-prerequisite');
          return rewritten === null ? b : { ...b, text: rewritten };
        }),
      };
    }) as CourseDay['parts'],
  };
}

/**
 * Re-runs studioise() over the generated prose. It normally runs at import, so a change to the
 * studio's own wording would otherwise reach only whoever can re-import from the 147 notebooks.
 * studioise() is idempotent - each replacement removes the text its own pattern matches - so
 * running it again here is safe, and it upgrades copy this project emitted in an earlier pass.
 */
export function applyStudioCopy(day: CourseDay): CourseDay {
  return {
    ...day,
    parts: day.parts.map((part) => ({
      ...part,
      blocks: part.blocks.map((b) =>
        b.type === 'markdown' ? { ...b, text: studioise(b.text) } : b,
      ),
    })) as CourseDay['parts'],
  };
}

/**
 * Authored replacements for a whole lesson body, one markdown file per part:
 * Data/Content/rewrites/w<week>d<day>p<part>.md. The file is split into blocks at each `## `
 * heading, and those blocks replace every generated markdown block of the part.
 *
 * This exists because lesson bodies come from notebooks that are not in this checkout, so a
 * rewrite written into the day file would be lost at the next import. A body rewritten for a
 * complete beginner is authored text like the cards, and is linted and drift-checked like them.
 *
 * The cards are not part of the file. applyOverlay() still places the at-a-glance directly after
 * the H1, and the checkpoints and recap before `## What's next`, so the file only needs to open
 * with the H1 and end with a What's next section.
 */
export type RewriteBlock =
  | { type: 'markdown' | 'problem-ref'; text: string }
  | { type: 'your-turn'; text: string; prompt: string };
export type ProblemRewrite = { statement: string; stub: string };
export type PartRewrite = { blocks: RewriteBlock[]; problems: Record<string, ProblemRewrite>; authorsCode: boolean };

export function loadRewrites(contentDir: string, week: number, day: number): Map<number, PartRewrite> {
  const out = new Map<number, PartRewrite>();
  const dir = path.join(contentDir, 'rewrites');
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = /^w(\d+)d(\d+)p(\d)\.md$/.exec(f);
    if (!m || +m[1] !== week || +m[2] !== day) continue;
    // Optional sibling: w<W>d<D>p<P>.problems.json, authored statements and editor templates for
    // the part's practice problems, which are generated from the notebooks like the body.
    const sibling = path.join(dir, f.replace(/\.md$/, '.problems.json'));
    const md = fs.readFileSync(path.join(dir, f), 'utf-8');
    out.set(+m[3], {
      blocks: splitRewrite(md),
      authorsCode: rewriteAuthorsCode(md),
      problems: fs.existsSync(sibling) ? (JSON.parse(fs.readFileSync(sibling, 'utf-8')) as Record<string, ProblemRewrite>) : {},
    });
  }
  return out;
}

/**
 * One markdown block per `## ` section, with the H1 and its opening paragraphs as the first block.
 *
 * - A line reading exactly `<!-- problem N -->` becomes a problem-ref block at that position.
 * - `<!-- your-turn -->` ... `<!-- /your-turn -->` becomes a your-turn block. Inside it, the text
 *   before the fenced code is the prompt the learner reads (shown as plain text), and the fenced
 *   code is what "Try it" loads into the editor.
 * - A line reading exactly `<!-- code: authored -->` marks a rewrite that replaces a lesson's
 *   generated code examples with its own. It produces no block.
 */
export function splitRewrite(md: string): RewriteBlock[] {
  const out: RewriteBlock[] = [];
  const text = md.replace(/\r\n/g, '\n').replace(/^<!-- code: authored -->$/m, '');
  // Pull the your-turn sections out first, so a `## ` inside one cannot split it.
  const pieces = text.split(/(<!-- your-turn -->[\s\S]*?<!-- \/your-turn -->)/);
  for (const piece of pieces) {
    const yt = /^<!-- your-turn -->([\s\S]*?)<!-- \/your-turn -->$/.exec(piece.trim());
    if (yt) {
      const fence = /```\w*\n([\s\S]*?)\n```/.exec(yt[1]);
      if (!fence) throw new Error('A your-turn section needs a fenced code block: ' + yt[1].trim().slice(0, 60));
      out.push({ type: 'your-turn', prompt: yt[1].slice(0, fence.index).trim(), text: fence[1] });
      continue;
    }
    for (const chunk of piece.split(/\n(?=## )/)) {
      for (const part of chunk.split(/^(<!-- problem \d+ -->)$/m)) {
        const ref = /^<!-- problem (\d+) -->$/.exec(part.trim());
        if (ref) out.push({ type: 'problem-ref', text: ref[1] });
        else if (part.trim()) out.push({ type: 'markdown', text: part.trim() });
      }
    }
  }
  return out;
}

/** True when a rewrite file declares that it replaces the lesson's generated code examples. */
export function rewriteAuthorsCode(md: string): boolean {
  return /^<!-- code: authored -->$/m.test(md.replace(/\r\n/g, '\n'));
}

/** Block types a whole-body rewrite would silently delete if it replaced the part wholesale. */
const GENERATED_CODE = new Set(['example', 'your-turn']);

export function applyRewrites(day: CourseDay, rewrites: Map<number, PartRewrite>): CourseDay {
  if (day.locked || rewrites.size === 0) return day;
  const at = (part: number) => 'w' + day.week + 'd' + day.day + 'p' + part;
  return {
    ...day,
    parts: day.parts.map((part) => {
      const rw = rewrites.get(part.part);
      if (!rw) return part;
      // A rewrite replaces the whole body, code included. For a lesson that HAS generated code
      // examples or your-turn prompts, that must be a deliberate choice, declared in the file with
      // `<!-- code: authored -->`, so that no example is ever dropped by accident.
      const code = part.blocks.find((b) => GENERATED_CODE.has(b.type));
      if (code && !rw.authorsCode) {
        throw new Error(
          at(part.part) + ' has a generated "' + code.type + '" block. A rewrite of it must author its own ' +
            'code and say so with <!-- code: authored -->, or the examples would be deleted silently.',
        );
      }
      // Every problem the part has must be placed exactly once, or it would vanish or repeat.
      const placed = rw.blocks.filter((b) => b.type === 'problem-ref').map((b) => b.text).sort().join(',');
      const needed = part.problems.map((q) => String(q.number)).sort().join(',');
      if (placed !== needed) {
        throw new Error(at(part.part) + ' rewrite places problems [' + placed + '] but the part has [' + needed + '].');
      }
      const BODY = new Set(['markdown', 'problem-ref', 'example', 'your-turn']);
      const cards = part.blocks.filter((b) => !BODY.has(b.type));
      const body = rw.blocks.map((b) => ({
        type: b.type,
        text: b.text,
        starter: null,
        variation: b.type === 'your-turn' ? { prompt: b.prompt } : null,
        checkpoint: null,
      }));
      const problems = part.problems.map((q) => {
        const o = rw.problems[String(q.number)];
        return o ? { ...q, statement: o.statement, stub: o.stub } : q;
      });
      return { ...part, blocks: [...body, ...cards], problems };
    }) as CourseDay['parts'],
  };
}

/** Authored solutions live outside the generated tree so a re-import cannot erase them. */
export function loadSolutions(contentDir: string, week: number, day: number): Record<string, string> {
  const file = path.join(contentDir, 'solutions', 'w' + week + 'd' + day + '.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>;
}

/**
 * Re-merges authored practice solutions into the day file.
 *
 * Solutions used to be merged ONLY at import, and `npm run overlay` had no step for them. So an
 * edit to Data/Content/solutions/ never reached the page: 11 of the 30 shipped week 1-2 solutions
 * were stale, carrying fixes that had been made, reviewed and committed in the source and never
 * shown to a learner. This is the same side-car pattern the cards and variations already use.
 */
export function applySolutions(day: CourseDay, solutions: Record<string, string>): CourseDay {
  // Open weeks only: work on the course is scoped to weeks 1 and 2, and a locked week's generated
  // files are left exactly as imported.
  if (day.locked || Object.keys(solutions).length === 0) return day;
  return {
    ...day,
    parts: day.parts.map((part) => ({
      ...part,
      problems: part.problems.map((q) => ({ ...q, solution: solutions[String(q.number)] ?? q.solution })),
    })) as CourseDay['parts'],
  };
}

/**
 * Rewrites old "Day 5.2" references in the generated text: markdown blocks and practice problem
 * statements. Authored cards, variations and solutions are fixed at source instead, because the
 * overlay must ship them byte-for-byte as written. See relabelDayRefs() for the label format.
 */
export function applyDayRefs(day: CourseDay): CourseDay {
  // Open weeks only, as for applySolutions. Keyed off `locked` rather than a week number, so a
  // week is brought in by opening it, not by editing this file.
  if (day.locked) return day;
  const fix = (t: string) => relabelDayRefs(t, day.week, day.day);
  return {
    ...day,
    parts: day.parts.map((part) => ({
      ...part,
      blocks: part.blocks.map((b) => (b.type === 'markdown' ? { ...b, text: fix(b.text) } : b)),
      problems: part.problems.map((q) => ({ ...q, statement: fix(q.statement) })),
    })) as CourseDay['parts'],
  };
}

export function loadVariations(contentDir: string, week: number, day: number): Record<string, string> {
  const file = path.join(contentDir, 'variations', 'w' + week + 'd' + day + '.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>;
}

/**
 * Reads and VALIDATES the overlay for a day, or null when none is authored. Parsing here rather
 * than at the call sites means a malformed overlay fails at the one place that loads it, with
 * zod's own path in the message, instead of surfacing later as a missing card.
 */
export function loadOverlay(contentDir: string, week: number, day: number): LessonOverlay | null {
  const file = path.join(contentDir, 'lessons', 'w' + week + 'd' + day + '.json');
  if (!fs.existsSync(file)) return null;
  const parsed = LessonOverlay.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  if (!parsed.success) {
    throw new Error(
      'Invalid lesson overlay ' + path.basename(file) + ': ' +
        parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; '),
    );
  }
  const o = parsed.data;
  // A file whose contents disagree with its own name would silently overlay the wrong day.
  if (o.week !== week || o.day !== day) {
    throw new Error(
      'Lesson overlay ' + path.basename(file) + ' declares w' + o.week + 'd' + o.day +
        ' but is named for w' + week + 'd' + day,
    );
  }
  return o;
}
