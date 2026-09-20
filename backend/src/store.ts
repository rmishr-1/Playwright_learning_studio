/**
 * The only reader and writer of Data/. Content is read-only (the importer owns it);
 * learner records are read-modify-write, serialised behind a keyed mutex so two tabs
 * updating progress at once cannot lose one another's writes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTENT, LEARNERS } from './config';
import { CourseDay } from '../../shared/contracts/course_day';
import { CourseIndex } from '../../shared/contracts/course_index';
import { Learner, type DayProgress, type ProgressUpdate, type Role } from '../../shared/contracts/learner';
import { dayKey } from '../../shared/contracts/common';

export type ConceptEntry = { section: string; term: string; link: string; note: string };

const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ---------------------------------------------------------------- content

let indexCache: CourseIndex | null = null;
let indexStamp = 0;
const dayCache = new Map<string, CourseDay>();

const indexFile = (): string => path.join(CONTENT, 'course-index.json');

/**
 * Re-running the importer must be visible without restarting the server, so the cache is keyed
 * on the index's mtime. Without this a re-import silently serves the previous content and every
 * fix looks like it did not work.
 */
function invalidateIfReimported(): void {
  const stamp = fs.statSync(indexFile()).mtimeMs;
  if (stamp === indexStamp) return;
  indexStamp = stamp;
  indexCache = null;
  dayCache.clear();
}

export function courseIndex(): CourseIndex {
  const file = indexFile();
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error('content not imported'), { code: 'CONTENT_NOT_IMPORTED' });
  }
  invalidateIfReimported();
  if (indexCache) return indexCache;
  indexCache = CourseIndex.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  return indexCache;
}

export function courseDay(week: number, day: number): CourseDay | null {
  if (fs.existsSync(indexFile())) invalidateIfReimported();
  const key = dayKey(week, day);
  const cached = dayCache.get(key);
  if (cached) return cached;
  const file = path.join(CONTENT, 'weeks', 'week-' + week, 'day-' + day + '.json');
  if (!fs.existsSync(file)) return null;
  const parsed = CourseDay.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  dayCache.set(key, parsed);
  return parsed;
}

export function concepts(): ConceptEntry[] {
  const file = path.join(CONTENT, 'concepts.json');
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf-8')) as { entries: ConceptEntry[] }).entries;
}

// ---------------------------------------------------------------- learners

/**
 * A display name becomes a stable id, which is also the account's username. Two people cannot
 * share a record any more - registration refuses an id that already exists, and signing in
 * needs the password.
 */
export function learnerId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'learner';
}

const learnerFile = (id: string): string => path.join(LEARNERS, id + '.json');

export function readLearner(id: string): Learner | null {
  const file = learnerFile(id);
  if (!fs.existsSync(file)) return null;
  // Records written before logins existed have no role, password or certificate. The contract
  // defaults fill them in on read, so nothing downstream has to guard for undefined - and an
  // unclaimed account (password null) is claimable on first sign-in.
  return Learner.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

function writeLearner(l: Learner): void {
  fs.mkdirSync(LEARNERS, { recursive: true });
  const file = learnerFile(l.learner_id);
  // Write-then-rename: a crash mid-write leaves the previous record intact rather than a
  // truncated file that fails to parse on the next read.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** One in-flight mutation per learner. */
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(id: string, fn: () => T): Promise<T> {
  const prior = locks.get(id) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  locks.set(id, prior.then(() => gate));
  await prior;
  try {
    return fn();
  } finally {
    release();
    if (locks.get(id) === gate) locks.delete(id);
  }
}

/** Registration. Everyone starts as a learner; only an admin changes that, from People. */
export async function createAccount(
  displayName: string,
  email: string,
  password: { salt: string; hash: string },
): Promise<Learner | { exists: true }> {
  const id = learnerId(displayName);
  return withLock(id, () => {
    if (readLearner(id)) return { exists: true as const };
    const created: Learner = {
      schema: 'learner/v1',
      learner_id: id,
      display_name: displayName.trim(),
      email: email.trim().toLowerCase(),
      password_reset: null,
      role: 'learner',
      password,
      certificate: null,
      enrolled_at: nowIso(),
      last_seen_at: nowIso(),
      resume: null,
      progress: {},
    };
    writeLearner(created);
    return created;
  });
}

/** Marks a successful sign-in. */
export async function touchLearner(id: string): Promise<void> {
  await withLock(id, () => {
    const learner = readLearner(id);
    if (learner) writeLearner({ ...learner, last_seen_at: nowIso() });
  });
}

/**
 * Sets the password on an UNCLAIMED account - one migrated from before logins existed, whose
 * stored password is null. The first person to sign in with that name takes it.
 */
export async function claimAccount(
  id: string,
  password: { salt: string; hash: string },
): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner || learner.password) return null;
    const claimed: Learner = { ...learner, password, last_seen_at: nowIso() };
    writeLearner(claimed);
    return claimed;
  });
}

/** Admin only. Lets accounts created before emails existed use Forgot password. */
export async function setEmail(id: string, email: string): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return null;
    const updated: Learner = { ...learner, email: email.trim().toLowerCase() };
    writeLearner(updated);
    return updated;
  });
}

/** Stores the reset challenge. Only the DIGEST of the code is kept, never the code. */
export async function startPasswordReset(
  id: string,
  challenge: { salt: string; hash: string; expires_at: string },
): Promise<void> {
  await withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return;
    writeLearner({ ...learner, password_reset: { ...challenge, attempts: 0 } });
  });
}

/** A wrong guess. Returns how many have been made, so the caller can discard a burned code. */
export async function recordResetAttempt(id: string): Promise<number> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner?.password_reset) return 0;
    const attempts = learner.password_reset.attempts + 1;
    writeLearner({ ...learner, password_reset: { ...learner.password_reset, attempts } });
    return attempts;
  });
}

/** Clears an in-flight challenge - on success, on expiry, or when it has been guessed at. */
export async function clearPasswordReset(id: string): Promise<void> {
  await withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return;
    writeLearner({ ...learner, password_reset: null });
  });
}

/** Sets a new password and discards the challenge in the same write. */
export async function replacePassword(
  id: string,
  password: { salt: string; hash: string },
): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return null;
    const updated: Learner = { ...learner, password, password_reset: null };
    writeLearner(updated);
    return updated;
  });
}

/** Admin only. The caller checks the last-admin rule before calling. */
export async function setRole(id: string, role: Role): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return null;
    const updated: Learner = { ...learner, role };
    writeLearner(updated);
    return updated;
  });
}

/**
 * Records that a part was viewed. A part completes on view; a day completes when every part
 * the day actually HAS has been viewed - not a hardcoded four, because Week 1 Day 1 has three.
 */
export async function recordProgress(id: string, update: ProgressUpdate): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return null;

    const key = dayKey(update.week, update.day);
    const day = courseDay(update.week, update.day);
    const partsInDay = day ? day.parts.length : 4;

    const prior: DayProgress = learner.progress[key] ?? {
      parts_viewed: [],
      completed: false,
      attempted_problems: [],
      first_opened_at: nowIso(),
      completed_at: null,
    };

    const viewed = prior.parts_viewed.includes(update.part)
      ? prior.parts_viewed
      : [...prior.parts_viewed, update.part].sort((a, b) => a - b);

    const attempted =
      update.attempted_problem && !prior.attempted_problems.includes(update.attempted_problem)
        ? [...prior.attempted_problems, update.attempted_problem].sort((a, b) => a - b)
        : prior.attempted_problems;

    const completed = viewed.length >= partsInDay;

    const next: Learner = {
      ...learner,
      last_seen_at: nowIso(),
      resume: { week: update.week, day: update.day, part: update.part },
      progress: {
        ...learner.progress,
        [key]: {
          ...prior,
          parts_viewed: viewed,
          attempted_problems: attempted,
          completed,
          completed_at: completed ? (prior.completed_at ?? nowIso()) : null,
        },
      },
    };
    writeLearner(next);
    return next;
  });
}

/**
 * Sequential progression: a week opens only once every day of the previous week is complete.
 * Week 1 is always open. This is enforced here rather than only in the sidebar, because a
 * learner can otherwise type /learn/w2/d1/p1 straight into the address bar and walk past it.
 *
 * Returns the week that still has to be finished, or null when `week` is open.
 */
export function blockingWeek(learner: Learner | null, week: number): number | null {
  if (week <= 1) return null;
  if (!learner) return week - 1;
  const index = courseIndex();
  for (let w = 1; w < week; w++) {
    const days = index.weeks.find((x) => x.week === w)?.days ?? [];
    // A week with no days cannot gate anything - skip rather than deadlock the course.
    if (days.length === 0) continue;
    const complete = days.every((d) => learner.progress[dayKey(w, d.day)]?.completed);
    if (!complete) return w;
  }
  return null;
}

/**
 * Records the issue date the first time the certificate is earned, so the date on it is stable
 * and does not move if the learner reopens a day afterwards.
 */
export async function stampCertificate(id: string): Promise<Learner | null> {
  return withLock(id, () => {
    const learner = readLearner(id);
    if (!learner) return null;
    if (learner.certificate) return learner;
    const total = Object.values(learner.progress).filter((p) => p.completed).length;
    const stamped: Learner = {
      ...learner,
      certificate: { issued_at: nowIso(), days_at_issue: total },
    };
    writeLearner(stamped);
    return stamped;
  });
}

/**
 * Removes an account and everything it knows. Irreversible - there is no soft delete and no
 * archive, so every guard on this lives in the route that calls it.
 */
export async function deleteAccount(id: string): Promise<boolean> {
  return withLock(id, () => {
    const file = learnerFile(id);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  });
}

/** Every account, for the dashboard and the People screen. */
export function allLearners(): Learner[] {
  if (!fs.existsSync(LEARNERS)) return [];
  return fs
    .readdirSync(LEARNERS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return Learner.parse(JSON.parse(fs.readFileSync(path.join(LEARNERS, f), 'utf-8')));
      } catch {
        // A hand-edited or half-written record must not take the whole trainer page down.
        return null;
      }
    })
    .filter((l): l is Learner => l !== null);
}
