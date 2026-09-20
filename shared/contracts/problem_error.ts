import { z } from 'zod';

/** Mirrors Data/Formats/problem_error_format.json. Clients branch on `code`, never on `detail`. */
export const ErrorCode = z.enum([
  'NOT_AUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'ACCOUNT_EXISTS',
  'WEAK_PASSWORD',
  'RESET_CODE_INVALID',
  'RESET_CODE_EXPIRED',
  'NO_EMAIL_ON_FILE',
  'CERTIFICATE_NOT_EARNED',
  'LEARNER_NAME_REQUIRED',
  'LEARNER_NOT_FOUND',
  'DAY_NOT_FOUND',
  'DAY_LOCKED',
  'WEEK_NOT_UNLOCKED',
  'PART_NOT_FOUND',
  'CONTENT_NOT_IMPORTED',
  'CODE_REQUIRED',
  'RUN_QUEUE_FULL',
  'RUN_TIMEOUT',
  'NAVIGATION_NOT_ALLOWED',
  'SOLUTION_NOT_AUTHORED',
  'TRAINER_CODE_REQUIRED',
  'TRAINER_CODE_INCORRECT',
  'ASSISTANT_UNAVAILABLE',
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
