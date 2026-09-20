/**
 * Passwords and sessions.
 *
 * Two deliberate choices, both from invariant 5 in the format registry:
 *
 *  - The token carries the user id and an expiry, and NOT the role. Every request re-reads the
 *    account, so demoting a trainer takes effect on their next request instead of whenever their
 *    token happens to expire.
 *  - The acting user always comes from the cookie. A learner_id in a request body is a claim,
 *    not a fact, and is never trusted.
 *
 * No new dependency: scrypt and HMAC are both in node:crypto.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { config, DATA } from './config';
import { readLearner } from './store';
import type { Learner, Role } from '../../shared/contracts/learner';

export const COOKIE = 'studio_session';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a working day

/**
 * The signing secret. An env var wins; otherwise one is generated into Data/Config and reused,
 * so restarting the server does not sign everyone out. That file is gitignored.
 */
function sessionSecret(): string {
  const fromEnv = process.env.STUDIO_SESSION_SECRET;
  if (fromEnv) return fromEnv;
  const file = path.join(DATA, 'Config', 'session.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}
const SECRET = sessionSecret();

// ---------------------------------------------------------------- passwords

export type PasswordDigest = { salt: string; hash: string };

export function hashPassword(password: string): PasswordDigest {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, digest: PasswordDigest): boolean {
  const attempt = crypto.scryptSync(password, digest.salt, 64);
  const stored = Buffer.from(digest.hash, 'hex');
  // Lengths must match before timingSafeEqual, which throws rather than returning false.
  if (attempt.length !== stored.length) return false;
  return crypto.timingSafeEqual(attempt, stored);
}

// ---------------------------------------------------------------- tokens

const sign = (payload: string): string =>
  crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

export function mintToken(learnerId: string): string {
  const payload = learnerId + '.' + (Date.now() + MAX_AGE_MS);
  return payload + '.' + sign(payload);
}

/** Returns the learner id, or null when the token is absent, tampered with, or expired. */
export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf('.');
  if (cut === -1) return null;
  const payload = token.slice(0, cut);
  const signature = token.slice(cut + 1);

  const expected = sign(payload);
  // Compare as buffers of equal length, so a wrong-length signature cannot throw.
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const dot = payload.lastIndexOf('.');
  if (dot === -1) return null;
  const expiry = Number(payload.slice(dot + 1));
  if (!Number.isFinite(expiry) || Date.now() > expiry) return null;
  return payload.slice(0, dot);
}

/** Minimal cookie read - the only cookie this app sets, so a parser dependency is not warranted. */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, learnerId: string): void {
  const secure = process.env.STUDIO_HTTPS === '1' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    COOKIE +
      '=' +
      encodeURIComponent(mintToken(learnerId)) +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
      Math.floor(MAX_AGE_MS / 1000) +
      secure,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// ---------------------------------------------------------------- roles

const RANK: Record<Role, number> = { learner: 0, trainer: 1, admin: 2 };

/**
 * The effective role. An id listed in studio.config.json `admins` is an admin whatever the
 * record says - the escape hatch that stops a bad demotion locking everyone out of People.
 */
export function effectiveRole(learner: Learner): Role {
  if (config.admins.includes(learner.learner_id)) return 'admin';
  return learner.role;
}

export const atLeast = (learner: Learner, role: Role): boolean =>
  RANK[effectiveRole(learner)] >= RANK[role];

// ---------------------------------------------------------------- middleware

/** The signed-in account, attached by requireAuth. */
declare module 'express-serve-static-core' {
  interface Request {
    learner?: Learner;
  }
}

function deny(res: Response, status: number, code: string, detail: string): void {
  res.status(status).type('application/problem+json').json({
    type: 'about:blank',
    title: code,
    status,
    code,
    detail,
  });
}

/** Reads the cookie and loads the account fresh, so role changes apply immediately. */
export function currentLearner(req: Request): Learner | null {
  const id = readToken(cookieValue(req.headers.cookie, COOKIE));
  if (!id) return null;
  return readLearner(id);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const learner = currentLearner(req);
  if (!learner) {
    deny(res, 401, 'NOT_AUTHENTICATED', 'Sign in to continue.');
    return;
  }
  req.learner = learner;
  next();
}

/** Use AFTER requireAuth. Checks the role server-side; a hidden menu item is not a permission. */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const learner = req.learner;
    if (!learner) {
      deny(res, 401, 'NOT_AUTHENTICATED', 'Sign in to continue.');
      return;
    }
    if (!atLeast(learner, role)) {
      deny(res, 403, 'FORBIDDEN', 'This page is for ' + role + 's.');
      return;
    }
    next();
  };
}
