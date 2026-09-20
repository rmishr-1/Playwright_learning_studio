import { z } from 'zod';
import { Role } from './learner';
import { ResumePoint } from './learner';

/**
 * Mirrors Data/Formats/session_format.json.
 *
 * The session token is an HMAC-signed string in an httpOnly cookie. It never appears in a
 * response body, and it deliberately does NOT carry the role: every request re-reads the
 * account, so a demotion applies on the next request rather than when the token expires.
 */

/** Short enough to be typed, long enough not to be guessed in a cohort of colleagues. */
export const Password = z.string().min(8, 'Use at least 8 characters').max(200);

export const RegisterRequest = z.object({
  name: z.string().min(1).max(120),
  /** Required for new accounts, so Forgot password has somewhere to send a code. */
  email: z.string().email('Enter a valid email address').max(200),
  password: Password,
});

/**
 * Step one of a reset. The response is identical whether or not the account exists - saying
 * otherwise would turn this into a way to find out who is registered.
 */
export const ForgotRequest = z.object({
  name: z.string().min(1).max(120),
});

/** Step two. Six digits, verified against the stored digest. */
export const ResetRequest = z.object({
  name: z.string().min(1).max(120),
  code: z.string().regex(/^\d{6}$/, 'The code is six digits'),
  password: Password,
});

export const SetEmailRequest = z.object({
  email: z.string().email().max(200),
});

export const LoginRequest = z.object({
  name: z.string().min(1).max(120),
  /** An unclaimed account (migrated, password null) SETS this on first sign-in. */
  password: z.string().min(1).max(200),
});

export const SetRoleRequest = z.object({
  role: Role,
});

/**
 * GET /api/auth/me. The client renders its navigation from these booleans; the server enforces
 * the same rules independently, because a hidden menu item is not a permission.
 */
export const Me = z.object({
  learner_id: z.string().min(1),
  display_name: z.string().min(1),
  role: Role,
  may_see_dashboard: z.boolean(),
  may_manage_people: z.boolean(),
  resume: ResumePoint.nullable(),
});

export type RegisterRequest = z.infer<typeof RegisterRequest>;
export type ForgotRequest = z.infer<typeof ForgotRequest>;
export type ResetRequest = z.infer<typeof ResetRequest>;
export type SetEmailRequest = z.infer<typeof SetEmailRequest>;
export type LoginRequest = z.infer<typeof LoginRequest>;
export type SetRoleRequest = z.infer<typeof SetRoleRequest>;
export type Me = z.infer<typeof Me>;
