import { z } from 'zod';

/** ISO-8601 UTC with a trailing Z — invariant 6 in the format registry. */
export const Timestamp = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
  'must be ISO-8601 UTC ending in Z',
);

export const WeekNumber = z.number().int().min(1).max(8);
export const DayNumber = z.number().int().min(1).max(5);
export const PartNumber = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
/** A day may have any number of practice problems up to 20. Nothing may assume three. */
export const ProblemNumber = z.number().int().min(1).max(20);

export const Difficulty = z.enum(['Easy', 'Medium', 'Hard', 'Challenge']);

/** 'w2d1' — the progress key, and the id used in URLs. */
export const dayKey = (week: number, day: number) => `w${week}d${day}`;

export type Timestamp = z.infer<typeof Timestamp>;
export type PartNumber = z.infer<typeof PartNumber>;
export type ProblemNumber = z.infer<typeof ProblemNumber>;
export type Difficulty = z.infer<typeof Difficulty>;
