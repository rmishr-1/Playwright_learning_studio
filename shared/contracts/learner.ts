import { z } from 'zod';
import { DayNumber, PartNumber, ProblemNumber, Timestamp, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/learner_format.json.
 * Accounts are authenticated: a scrypt password digest plus a signed session cookie. This file
 * is the authority on who someone is and what they may reach (invariant 5).
 */

/** Each role is a superset of the one before it. */
export const Role = z.enum(['learner', 'trainer', 'admin']);

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

/** Never serialised outward - invariant 5. Server-side only. */
export const PasswordDigest = z.object({
  salt: z.string().min(1),
  hash: z.string().min(1),
});

/**
 * An in-flight password reset. The code itself is never stored - only a salted scrypt digest,
 * the same treatment as the password, so a leaked record cannot be used to reset anyone.
 */
export const PasswordReset = z.object({
  salt: z.string().min(1),
  hash: z.string().min(1),
  expires_at: Timestamp,
  attempts: z.number().int().min(0),
});

export const Certificate = z.object({
  issued_at: Timestamp,
  days_at_issue: z.number().int().positive(),
});

export const Learner = z.object({
  schema: z.literal('learner/v1'),
  learner_id: z.string().min(1),
  display_name: z.string().min(1),
  /** Where a reset code is sent. null on accounts created before emails existed. */
  email: z.string().email().nullable().default(null),
  password_reset: PasswordReset.nullable().default(null),
  role: Role.default('learner'),
  /** null = unclaimed: migrated from before logins existed, first sign-in sets it. */
  password: PasswordDigest.nullable().default(null),
  certificate: Certificate.nullable().default(null),
  enrolled_at: Timestamp,
  last_seen_at: Timestamp,
  resume: ResumePoint.nullable(),
  /** Keyed 'w<week>d<day>'. */
  progress: z.record(z.string(), DayProgress),
});

/**
 * What the client is allowed to know about an account - everything except the password.
 * Used for /auth/me, the People roster and the dashboard.
 */
export const PublicLearner = Learner.omit({ password: true, password_reset: true });

/**
 * POST /api/learner/progress - records a part view, and optionally a practice attempt.
 * There is deliberately NO learner_id here: the acting user comes from the session cookie,
 * because an id in a body is a claim rather than a fact (invariant 5).
 */
export const ProgressUpdate = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  attempted_problem: ProblemNumber.nullable().optional(),
});

export type ResumePoint = z.infer<typeof ResumePoint>;
export type DayProgress = z.infer<typeof DayProgress>;
export type Learner = z.infer<typeof Learner>;
export type PublicLearner = z.infer<typeof PublicLearner>;
export type Role = z.infer<typeof Role>;
export type Certificate = z.infer<typeof Certificate>;
export type PasswordReset = z.infer<typeof PasswordReset>;
export type ProgressUpdate = z.infer<typeof ProgressUpdate>;
