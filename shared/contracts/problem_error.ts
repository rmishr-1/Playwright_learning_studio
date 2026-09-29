import { z } from 'zod';

/** Mirrors Data/Formats/problem_error_format.json. Clients branch on `code`, never on `detail`. */
export const ErrorCode = z.enum([
  'DAY_NOT_FOUND',
  'DAY_LOCKED',
  'PART_NOT_FOUND',
  'CONTENT_MISSING',
  'CODE_REQUIRED',
  'RUN_QUEUE_FULL',
  'RUN_TIMEOUT',
  'NAVIGATION_NOT_ALLOWED',
  'SOLUTION_NOT_AUTHORED',
  'EXERCISE_NOT_FOUND',
  'TRAINER_CODE_REQUIRED',
  'TRAINER_CODE_INCORRECT',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
]);

export const ProblemError = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  code: ErrorCode,
  detail: z.string(),
});

export type ErrorCode = z.infer<typeof ErrorCode>;
export type ProblemError = z.infer<typeof ProblemError>;
