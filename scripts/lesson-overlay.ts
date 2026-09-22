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
import { studioise, tabLabel } from './notebook-parse';
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
 * Weeks whose page headings follow the "Week N, Day D, <Tab>" rule. Week 1 only, deliberately:
 * that is the scope that was asked for, and week 2 still reads "Week 2, Day 1.2 - ...". Add a
 * week here to bring it in; nothing else needs to change.
 */
const ROLE_HEADING_WEEKS: ReadonlySet<number> = new Set([1]);

/** `# Week 1, Day 5.2 - Your first real test`. The dot is what distinguishes it from the rewritten
 *  form ("Day 5,"), which is what makes rewriting idempotent. */
const DAY_HEADING = /^#\s+Week\s+(\d+),\s+Day\s+(\d+)\.(\d+)\s*[—-]\s*(.*)$/;

/**
 * Headings that announce the absence of content rather than naming a concept. These lose their
 * text entirely and keep only the standard prefix; everything else keeps what it says. Note that
 * Week 1 Day 5.1 - "Arrow functions, `async`, and reading `import`" - is a real primer on a
 * TypeScript tab, so matching on the TAB would have thrown that heading away.
 */
const PLACEHOLDER_HEADING: readonly RegExp[] = [
  /typescript check-?in/i,
  /nothing new today/i,
  /no new concepts?\b/i,
  /nothing to primer/i,
];

function rewriteHeading(text: string, tab: string): string | null {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => DAY_HEADING.test(l));
  if (i === -1) return null;

  const [, week, dayNumber, , rest] = DAY_HEADING.exec(lines[i])!;
  let content = rest.trim();
  if (PLACEHOLDER_HEADING.some((p) => p.test(content))) {
    content = '';
  } else if (tab === 'Practice') {
    // "Practice: Codegen and locators" under a tab already called Practice says it twice. Dropping
    // the prefix promotes what followed the colon to the start of a clause, where the course's own
    // lower-case ("Practice: environment setup") would now read as a typo - so capitalise it.
    const stripped = content.replace(/^practice\s*[:—-]\s*/i, '');
    if (stripped !== content) content = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  const prefix = '# Week ' + week + ', Day ' + dayNumber + ', ' + tab;
  lines[i] = content ? prefix + ' — ' + content : prefix;
  return lines.join('\n');
}

/**
 * Standardises each part's page heading on "Week N, Day D, <Tab>", keeping whatever the heading
 * said about the lesson itself after an em dash.
 *
 * Like applyDerivedLabels(), this is a RULE rather than authored text, so it lives here and runs
 * on every `npm run overlay` - a heading edited into the generated JSON by hand would not survive
 * the next import. It is idempotent because a rewritten heading no longer carries the "Day D.P"
 * form the pattern matches.
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
          const rewritten = rewriteHeading(b.text, tab);
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
