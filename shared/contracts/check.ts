import { z } from 'zod';
import { DayNumber, PartNumber, ProblemNumber, WeekNumber } from './common';
import { Workspace } from './course_day';

/** Mirrors Data/Formats/check_format.json. "Check my answer" on a code exercise. */

export const CheckRequest = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  /** The exercise's number within the part. The server looks up its check in the course. */
  problem: ProblemNumber,
  /** The learner's answer: the editor's code, saved as the exercise's file before the check runs. */
  code: z.string().max(64_000),
  workspace: Workspace,
});

export const CheckResult = z.object({
  /** 'passed' and 'failed' are the verdict; 'busy' means a Terminal command was already running. */
  status: z.enum(['passed', 'failed', 'busy']),
  /** One sentence saying what was checked and what happened. */
  message: z.string(),
  /** stdoutEquals only: the output the exercise expects, and the output the code printed. */
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  /** The end of what the command printed, for a failed check whose output is not a comparison. */
  output: z.string().nullable(),
});

export type CheckRequest = z.infer<typeof CheckRequest>;
export type CheckResult = z.infer<typeof CheckResult>;
