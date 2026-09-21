import { z } from 'zod';
import { DayNumber, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/lesson_overlay_format.json. AUTHORED, not generated - it lives in
 * Data/Content/lessons/ for the same reason solutions/ and variations/ do: the notebooks are the
 * master for teaching content, so anything hand-written has to sit outside the generated tree or
 * the next `npm run import` erases it.
 *
 * An overlay is purely ADDITIVE. It supplies the three sections that give every lesson the same
 * shape - an opening "at a glance", closing retrieval checkpoints, and a recap - and it has no
 * way to remove or rewrite a generated block. A notebook is still the only place teaching content
 * can be changed, which keeps one source of truth for what the course actually says.
 */

/**
 * A checkpoint as authored. Differs from the rendered `Checkpoint` in course_day only by
 * carrying its own question: in a day file the question is the block's `text`.
 */
export const AuthoredCheckpoint = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string()).min(2).max(5),
    /** Index into options. */
    answer: z.number().int().min(0),
    explanation: z.string().min(1),
  })
  .refine((c) => c.answer < c.options.length, {
    message: 'answer must be an index into options',
    path: ['answer'],
  });

export const OverlayPart = z.object({
  /** Opens the lesson: what it is for, and what the learner will have done by the end. */
  at_a_glance: z.string().optional(),
  /**
   * Retrieval practice, placed before the recap. Every option has to be defensible from the
   * lesson's own text - a checkpoint that tests something the day never taught is a bug.
   */
  checkpoints: z.array(AuthoredCheckpoint).optional(),
  /** Closes the lesson: the few things worth carrying forward. */
  recap: z.string().optional(),
});

export const LessonOverlay = z.object({
  schema: z.literal('lesson-overlay/v1'),
  week: WeekNumber,
  day: DayNumber,
  /**
   * Keyed by part number as a string - a part with no entry is left exactly as imported.
   * Strict on purpose: these files are hand-written, and a mistyped key ('5', 'part2') that
   * zod quietly stripped would read as "the overlay did nothing" with no error to explain why.
   */
  parts: z
    .object({
      '1': OverlayPart.optional(),
      '2': OverlayPart.optional(),
      '3': OverlayPart.optional(),
      '4': OverlayPart.optional(),
    })
    .strict(),
});

export type AuthoredCheckpoint = z.infer<typeof AuthoredCheckpoint>;
export type OverlayPart = z.infer<typeof OverlayPart>;
export type LessonOverlay = z.infer<typeof LessonOverlay>;
