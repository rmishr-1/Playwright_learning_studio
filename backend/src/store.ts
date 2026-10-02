/**
 * The only reader and writer of Data/. Content is read-only here (content.ts says where it comes
 * from); the single progress record is
 * read-modify-write, serialised behind a lock so two tabs updating progress at once cannot lose
 * one another's writes. Whenever the course changes, the record is first reconciled with it
 * (reconcile.ts): records follow their days, changed days are tagged, attempts stay with their
 * exercises.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROGRESS_FILE } from './config';
import { contentStamp, readContent } from './content';
import { CourseDay, type CoursePart, type PracticeProblem } from '../../shared/contracts/course_day';
import { CourseIndex } from '../../shared/contracts/course_index';
import { CoursePlan } from '../../shared/contracts/course_plan';
import { Progress, type DayProgress, type ProgressUpdate } from '../../shared/contracts/progress';
import { dayIdentity, dayKey, exerciseIdentity } from '../../shared/contracts/common';
import { dayRevision, problemRevision, token } from '../../shared/revision';
import { reconcile, type ContentSnapshot, type SnapshotDay } from './reconcile';

const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ---------------------------------------------------------------- content

let indexCache: CourseIndex | null = null;
let indexStamp = 0;
/** Each day is cached with the mtime it was read at - see courseDay(). */
const dayCache = new Map<string, { day: CourseDay; stamp: number }>();

const INDEX = 'course-index.json';
const PLAN = 'course-plan.json';

/**
 * An edited course index must be visible without restarting the server, so the cache is keyed
 * on the index's mtime. Without this the server silently serves the previous content and every
 * fix looks like it did not work.
 */
function invalidateIfChanged(stamp: number): void {
  if (stamp === indexStamp) return;
  indexStamp = stamp;
  indexCache = null;
  dayCache.clear();
}

export function courseIndex(): CourseIndex {
  const stamp = contentStamp(INDEX);
  if (stamp === null) {
    throw Object.assign(new Error('no course content'), { code: 'CONTENT_MISSING' });
  }
  invalidateIfChanged(stamp);
  if (indexCache) return indexCache;
  indexCache = CourseIndex.parse(JSON.parse(readContent(INDEX) ?? ''));
  return indexCache;
}

/**
 * Cached against the DAY FILE's own mtime, not just the index's: a day file is often edited
 * without touching course-index.json, and the edit must still show on the next request.
 */
export function courseDay(week: number, day: number): CourseDay | null {
  const indexStampNow = contentStamp(INDEX);
  if (indexStampNow !== null) invalidateIfChanged(indexStampNow);
  const key = dayKey(week, day);
  const rel = 'weeks/week-' + week + '/day-' + day + '.json';
  const stamp = contentStamp(rel);
  if (stamp === null) return null;
  const cached = dayCache.get(key);
  if (cached && cached.stamp === stamp) return cached.day;
  const parsed = CourseDay.parse(JSON.parse(readContent(rel) ?? ''));
  dayCache.set(key, { day: parsed, stamp });
  return parsed;
}

/** The title the index gives a day, for a day whose own file is not there (a locked day is not in the pack). */
export function indexDayTitle(week: number, day: number): string | null {
  try {
    return courseIndex().weeks.find((w) => w.week === week)?.days.find((d) => d.day === day)?.title ?? null;
  } catch {
    return null;
  }
}

/** Whether a day is locked: by itself, or because its whole week is. A course that cannot be read keeps it locked. */
export function isLocked(week: number, day: number): boolean {
  try {
    if (courseDay(week, day)?.locked) return true;
    const w = courseIndex().weeks.find((x) => x.week === week);
    return w?.locked === true || w?.days.find((d) => d.day === day)?.locked === true;
  } catch {
    return true;
  }
}

/**
 * The days that are locked, by their number through the course (IndexDay.number), which is how
 * the workspaces' folders are named (day1 to day10), so a locked day's starting files stay out of
 * the workspaces too. null when the course cannot be read: then nothing is seeded.
 */
export function lockedDayNumbers(): Set<number> | null {
  const locked = new Set<number>();
  try {
    for (const w of courseIndex().weeks) {
      for (const d of w.days) {
        if (w.locked || d.locked || courseDay(w.week, d.day)?.locked) locked.add(d.number);
      }
    }
  } catch {
    return null;
  }
  return locked;
}

// ---------------------------------------------------------------- the course plan

let planCache: { plan: CoursePlan | null; stamp: number | null } | null = null;

/**
 * The course plan (course-plan.json): the description, each week's module and focus. null when the
 * content has none, or one that does not validate - the course index works without it.
 */
export function coursePlan(): CoursePlan | null {
  const stamp = contentStamp(PLAN);
  if (planCache && planCache.stamp === stamp) return planCache.plan;
  let plan: CoursePlan | null = null;
  try {
    const text = stamp === null ? null : readContent(PLAN);
    plan = text === null ? null : CoursePlan.parse(JSON.parse(text));
  } catch (e) {
    console.error('[studio] the course plan is not valid, so it is left out: ' + (e as Error).message.slice(0, 300));
  }
  planCache = { plan, stamp };
  return plan;
}

// ---------------------------------------------------------------- progress

const EMPTY_PROGRESS: Progress = { schema: 'progress/v1', resume: null, progress: {} };

/**
 * There is exactly one record, for whoever is running this clone. A missing file reads as a
 * fresh start rather than an error. It is first written by the first reconcile (below), which
 * records what the course is so that later changes can be shown.
 */
export function readProgress(): Progress {
  if (!fs.existsSync(PROGRESS_FILE)) return EMPTY_PROGRESS;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    setAside();
    return EMPTY_PROGRESS;
  }
  // A record a newer studio wrote, in a format this one does not know, is never set aside as
  // damaged: the learner would lose it. The request fails instead, until the newer studio is back.
  const schema = (raw as { schema?: unknown } | null)?.schema;
  if (typeof schema === 'string' && schema !== 'progress/v1' && /^progress\/v\d+$/.test(schema)) {
    throw Object.assign(new Error('The progress record was written by a newer version of the studio.'), { code: 'PROGRESS_NEWER' });
  }
  const parsed = Progress.safeParse(raw);
  if (parsed.success) return parsed.data;
  // A damaged record is kept aside, never overwritten, and the learner starts again rather than
  // getting an error on every page. A file that could not be read (held by another program for a
  // moment) is left alone, and the request fails instead.
  setAside();
  return EMPTY_PROGRESS;
}

function setAside(): void {
  try {
    fs.renameSync(PROGRESS_FILE, PROGRESS_FILE.replace(/\.json$/, '.damaged-' + Date.now() + '.json'));
  } catch {
    // Left where it is; read as a fresh start all the same.
  }
}

function writeProgressFile(p: Progress): void {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous record intact rather than a
  // truncated file that fails to parse on the next read.
  const tmp = PROGRESS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2) + '\n');
  fs.renameSync(tmp, PROGRESS_FILE);
}

/** One in-flight mutation at a time - there is only the one record to contend over. Not re-entrant. */
let lock: Promise<unknown> = Promise.resolve();

async function withLock<T>(fn: () => T): Promise<T> {
  const prior = lock;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  lock = prior.then(() => gate);
  await prior;
  try {
    return fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------- reconcile

/** The content stamp the record was last reconciled against: once per launch in the app, per rebuild in development. */
let reconciledFor: number | null = null;

/** What the course is now, for reconcile(): every day in the index, open or not. null when it cannot be read. */
export function contentSnapshot(): ContentSnapshot | null {
  let index: CourseIndex;
  try {
    index = courseIndex();
  } catch {
    return null;
  }
  const days: SnapshotDay[] = [];
  for (const w of index.weeks) {
    for (const d of w.days) {
      let built: CourseDay | null = null;
      try {
        built = courseDay(w.week, d.day);
      } catch {
        built = null;
      }
      const open = built !== null && !w.locked && !d.locked && !built.locked;
      days.push({
        id: dayIdentity(d),
        week: w.week,
        day: d.day,
        open,
        revision: d.revision ?? (built ? dayRevision(built) : null),
        workspace: built?.workspace ?? 'project',
        exercises: built
          ? built.parts.flatMap((part) =>
              part.problems.map((p) => ({
                id: exerciseIdentity(built!.number, p),
                number: p.number,
                file: p.file,
                revision: p.revision ?? problemRevision(p),
              })),
            )
          : null,
      });
    }
  }
  const fingerprint = token(days.map((d) => d.id + '@' + d.week + '/' + d.day + '=' + (d.open ? d.revision : '-')).sort());
  return { fingerprint, days };
}

/** Reconciles the record with the course if the course changed since. The lock must be held. */
function reconcileLocked(): void {
  const stamp = contentStamp(INDEX);
  if (stamp === null || stamp === reconciledFor) return;
  const snap = contentSnapshot();
  // A course that cannot be read leaves the record exactly as it is, and is tried again next time.
  if (!snap) return;
  const current = readProgress();
  const next = reconcile(current, snap);
  if (next !== current) writeProgressFile(next);
  reconciledFor = stamp;
}

/** Brings the record up to date with the course; cheap when nothing changed. */
export async function ensureReconciled(): Promise<void> {
  const stamp = contentStamp(INDEX);
  if (stamp === null || stamp === reconciledFor) return;
  await withLock(() => reconcileLocked());
}

/** The record as the page sees it: reconciled, without what only the backend needs. */
export async function progressForClient(): Promise<Progress> {
  await ensureReconciled();
  return withoutInternals(readProgress());
}

export function withoutInternals(p: Progress): Progress {
  const { content_seen: _internal, ...rest } = p;
  return rest as Progress;
}

/** An exercise of a day, by identity or, for a request from an older page, by number. */
export function findProblem(day: CourseDay, ref: { id?: string | null; number?: number | null }): { part: CoursePart; problem: PracticeProblem } | null {
  for (const part of day.parts) {
    for (const problem of part.problems) {
      if (ref.id ? exerciseIdentity(day.number, problem) === ref.id : problem.number === ref.number) return { part, problem };
    }
  }
  return null;
}

/**
 * Records where the learner is and, unless `viewed: false`, that a part was read (or, with
 * `reset_day`, clears the whole day's progress). A part
 * completes when it is recorded as read; a day completes when every part the day actually HAS
 * has been read - not a hardcoded four, because a day may have fewer parts, with gaps in the
 * part numbers.
 *
 * Arriving on a day (any update that is not an attempt and not a reset) takes the "New" / "Updated"
 * tag off its card. An attempt is recorded by the exercise's identity, with its revision, so a later
 * change to the exercise can be pointed out.
 */
export async function recordProgress(update: ProgressUpdate): Promise<Progress> {
  return withLock(() => {
    reconcileLocked();
    const current = readProgress();

    const key = dayKey(update.week, update.day);
    const day = courseDay(update.week, update.day);
    const partsInDay = day ? day.parts.length : 4;
    const dayId = day ? dayIdentity(day) : undefined;

    const prior: DayProgress = current.progress[key] ?? {
      parts_viewed: [],
      completed: false,
      attempted_problems: [],
      first_opened_at: nowIso(),
      completed_at: null,
    };

    // `viewed: false` moves the resume point without counting the part as read; `reset_day` clears
    // every part read and every exercise attempted.
    const viewed = update.reset_day
      ? []
      : update.viewed === false || prior.parts_viewed.includes(update.part)
        ? prior.parts_viewed
        : [...prior.parts_viewed, update.part].sort((a, b) => a - b);

    const found = day && (update.attempted_exercise || update.attempted_problem)
      ? findProblem(day, { id: update.attempted_exercise, number: update.attempted_problem })
      : null;
    const attemptedNumber = found?.problem.number ?? update.attempted_problem ?? null;
    const attempted = update.reset_day
      ? []
      : attemptedNumber && !prior.attempted_problems.includes(attemptedNumber)
        ? [...prior.attempted_problems, attemptedNumber].sort((a, b) => a - b)
        : prior.attempted_problems;

    // Every part the day HAS must be among those viewed. A count ("viewed.length >= parts") goes
    // wrong when part numbers have gaps: viewing a part the day no longer has would count.
    const completed = day ? day.parts.every((p) => viewed.includes(p.part)) : viewed.length >= partsInDay;

    const attempts = { ...(current.attempts ?? {}) };
    if (update.reset_day && day) {
      for (const p of day.parts.flatMap((x) => x.problems)) delete attempts[exerciseIdentity(day.number, p)];
    } else if (found && day) {
      attempts[exerciseIdentity(day.number, found.problem)] = { revision: found.problem.revision ?? problemRevision(found.problem), at: nowIso() };
    }

    const tags = { ...(current.day_tags ?? {}) };
    const arrival = !update.reset_day && !update.attempted_exercise && !update.attempted_problem;
    if (arrival && dayId) delete tags[dayId];

    const next: Progress = {
      ...current,
      // Clearing a done mark is not going anywhere: the resume point stays.
      resume: update.reset_day
        ? current.resume
        : { week: update.week, day: update.day, part: update.part, ...(dayId ? { day_id: dayId } : {}) },
      progress: {
        ...current.progress,
        [key]: {
          ...prior,
          parts_viewed: viewed,
          attempted_problems: attempted,
          completed,
          completed_at: completed ? (prior.completed_at ?? nowIso()) : null,
          ...(dayId ? { day_id: dayId } : {}),
        },
      },
      day_tags: tags,
      attempts,
    };
    writeProgressFile(next);
    return withoutInternals(next);
  });
}
