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
