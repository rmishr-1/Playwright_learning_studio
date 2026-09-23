import { z } from 'zod';
import { Difficulty, DayNumber, PartNumber, ProblemNumber, WeekNumber } from './common';

/** Mirrors Data/Formats/course_day_format.json. One day of the course, written by hand. */

/**
 * 'problem-ref' marks the position of a practice problem in the document flow, so that text
 * written after the problems (a closing note, for example) renders after them rather than above
 * Problem 1.
 *
 * 'at-a-glance' opens a lesson, and 'checkpoint' and 'recap' close it. They render as cards
 * rather than prose.
 */
export const BlockType = z.enum([
  'markdown',
  'example',
  'your-turn',
  'problem-ref',
  'at-a-glance',
  'checkpoint',
  'recap',
]);

/**
 * One multiple-choice retrieval check. Formative, never scored: the learner picks, sees at once
 * whether they were right, and reads why. Nothing is recorded, so a wrong answer costs nothing
 * but the reading - which is the point of putting it mid-lesson rather than in an exam.
 */
export const Checkpoint = z
  .object({
    options: z.array(z.string()).min(2).max(5),
    /** Index into options. */
    answer: z.number().int().min(0),
    /** Shown after answering, right or wrong - the reason, not just the verdict. */
    explanation: z.string(),
  })
  .refine((c) => c.answer < c.options.length, {
    message: 'answer must be an index into options',
    path: ['answer'],
  });

export const ContentBlock = z.object({
  type: BlockType,
  /**
   * Markdown source for a markdown block, TypeScript source for example / your-turn,
   * the problem number as a string for problem-ref, and markdown again for at-a-glance,
   * checkpoint and recap - the question itself, for a checkpoint.
   */
  text: z.string(),
  /**
   * A 'your-turn' block's runnable starting point, loaded by "Try it" so that the editor never
   * receives a comment-only stub. null for every other block type.
   */
  starter: z.string().nullable().default(null),
  /** A 'your-turn' block's prompt: what the learner is asked to write. null for other blocks. */
  variation: z.object({ prompt: z.string() }).nullable().default(null),
  /** A 'checkpoint' block's options, answer and explanation. null for every other block type. */
  checkpoint: Checkpoint.nullable().default(null),
});

export const PartKind = z.enum(['prerequisite', 'concept', 'practice']);

export const PracticeProblem = z.object({
  number: ProblemNumber,
  /** null for a problem that carries no difficulty label. */
  difficulty: Difficulty.nullable(),
  statement: z.string(),
  stub: z.string(),
  /**
   * Markdown, revealed on a deliberate click. Code answers carry their own fence. null until
   * written - the reveal button is then absent, not broken.
   */
  solution: z.string().nullable(),
});

export const CoursePart = z.object({
  part: PartNumber,
  kind: PartKind,
  title: z.string(),
  tab_label: z.string(),
  has_runnable_code: z.boolean(),
  blocks: z.array(ContentBlock),
  problems: z.array(PracticeProblem),
});

export const CourseDay = z.object({
  schema: z.literal('course-day/v1'),
  week: WeekNumber,
  day: DayNumber,
  title: z.string(),
  locked: z.boolean(),
  /** Ordered, 1-4. A day need not have all four, and nothing downstream may assume it does. */
  parts: z.array(CoursePart).min(1).max(4),
});

export type Checkpoint = z.infer<typeof Checkpoint>;
export type ContentBlock = z.infer<typeof ContentBlock>;
export type PracticeProblem = z.infer<typeof PracticeProblem>;
export type CoursePart = z.infer<typeof CoursePart>;
export type CourseDay = z.infer<typeof CourseDay>;
