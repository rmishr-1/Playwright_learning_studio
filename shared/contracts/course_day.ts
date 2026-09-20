import { z } from 'zod';
import { Difficulty, DayNumber, PartNumber, ProblemNumber, WeekNumber } from './common';

/** Mirrors Data/Formats/course_day_format.json. GENERATED content — the notebooks are master. */

/**
 * 'problem-ref' marks the position of a practice problem in the document flow. Without it,
 * every non-problem paragraph was rendered before every problem - which put the practice
 * notebook's closing "When you are done" note ABOVE Problem 1.
 */
export const BlockType = z.enum(['markdown', 'example', 'your-turn', 'problem-ref']);

export const ContentBlock = z.object({
  type: BlockType,
  /**
   * Markdown source for a markdown block, TypeScript source for example / your-turn,
   * and the problem number as a string for problem-ref.
   */
  text: z.string(),
});

export const PartKind = z.enum([
  'prerequisite',
  'concept',
  'practice',
  'generated-prerequisite',
]);

export const PracticeProblem = z.object({
  number: ProblemNumber,
  /** null where the source notebook numbers its problems without labelling difficulty. */
  difficulty: Difficulty.nullable(),
  statement: z.string(),
  stub: z.string(),
  /** null until authored — the reveal button is then absent, not broken (invariant 2). */
  /** Markdown. Code answers carry their own fence; reflection answers are prose. */
  solution: z.string().nullable(),
});

export const CoursePart = z.object({
  part: PartNumber,
  kind: PartKind,
  title: z.string(),
  tab_label: z.string(),
  source_notebook: z.string().nullable(),
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
  /**
   * Ordered, 1-4. Most days have all four, but the course does not guarantee it:
   * Week 1 Day 1 has no _3 notebook at all. Nothing downstream may assume four.
   */
  parts: z.array(CoursePart).min(1).max(4),
});

export type ContentBlock = z.infer<typeof ContentBlock>;
export type PracticeProblem = z.infer<typeof PracticeProblem>;
export type CoursePart = z.infer<typeof CoursePart>;
export type CourseDay = z.infer<typeof CourseDay>;
