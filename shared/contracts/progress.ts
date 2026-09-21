import { z } from 'zod';
import { DayNumber, PartNumber, ProblemNumber, Timestamp, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/progress_format.json.
 *
 * There are no accounts. Each clone of this repo is run by one person, so "who is using it" is
 * not a question the app needs to answer - there is exactly one progress record on disk, at
 * Data/Progress/progress.json, and every request reads and writes that same record. This used
 * to be a per-learner file behind a login; the login, the roles and the accounts are gone, and
 * this is what is left once the identity layer is stripped out.
 */

export const ResumePoint = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
});

export const DayProgress = z.object({
  parts_viewed: z.array(PartNumber),
  completed: z.boolean(),
  attempted_problems: z.array(ProblemNumber),
  first_opened_at: Timestamp,
  completed_at: Timestamp.nullable(),
});

export const Progress = z.object({
  schema: z.literal('progress/v1'),
  resume: ResumePoint.nullable(),
  /** Keyed 'w<week>d<day>'. */
  progress: z.record(z.string(), DayProgress),
});

/**
 * POST /api/progress - records a part view, and optionally a practice attempt. There is no
 * learner id anywhere in this request: there is only the one record.
 */
export const ProgressUpdate = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  attempted_problem: ProblemNumber.nullable().optional(),
});

export type ResumePoint = z.infer<typeof ResumePoint>;
export type DayProgress = z.infer<typeof DayProgress>;
export type Progress = z.infer<typeof Progress>;
export type ProgressUpdate = z.infer<typeof ProgressUpdate>;
