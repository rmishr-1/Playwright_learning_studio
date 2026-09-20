import { z } from 'zod';

/** ISO-8601 UTC with a trailing Z — invariant 6 in the format registry. */
export const Timestamp = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
  'must be ISO-8601 UTC ending in Z',
);

export const WeekNumber = z.number().int().min(1).max(8);
export const DayNumber = z.number().int().min(1).max(5);
export const PartNumber = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
/**
 * Not 1-3. Weeks 1-4 and 8 give three practice problems a day, but weeks 5-7 run
 * 7-8 numbered exercises instead. Anything that assumes three is wrong.
 */
export const ProblemNumber = z.number().int().min(1).max(20);

/**
 * The course labels most practice problems Beginner/Intermediate/Advanced, but a few
 * theory days label the third one 'Reflection' (and one says 'Reflection, no code',
 * which the importer normalises to 'Reflection').
 */
export const Difficulty = z.enum(['Beginner', 'Intermediate', 'Advanced', 'Reflection']);

/** 'w2d1' — the progress key, and the id used in URLs. */
export const dayKey = (week: number, day: number) => `w${week}d${day}`;

export type Timestamp = z.infer<typeof Timestamp>;
export type PartNumber = z.infer<typeof PartNumber>;
export type ProblemNumber = z.infer<typeof ProblemNumber>;
export type Difficulty = z.infer<typeof Difficulty>;
