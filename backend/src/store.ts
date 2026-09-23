/**
 * The only reader and writer of Data/. Content is read-only here; the single progress record is
 * read-modify-write, serialised behind a lock so two tabs updating progress at once cannot lose
 * one another's writes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTENT, PROGRESS_FILE } from './config';
import { CourseDay } from '../../shared/contracts/course_day';
import { CourseIndex } from '../../shared/contracts/course_index';
import { Progress, type DayProgress, type ProgressUpdate } from '../../shared/contracts/progress';
import { dayKey } from '../../shared/contracts/common';

const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ---------------------------------------------------------------- content

let indexCache: CourseIndex | null = null;
let indexStamp = 0;
/** Each day is cached with the mtime it was read at - see courseDay(). */
const dayCache = new Map<string, { day: CourseDay; stamp: number }>();

const indexFile = (): string => path.join(CONTENT, 'course-index.json');

/**
 * An edited course index must be visible without restarting the server, so the cache is keyed
 * on the index's mtime. Without this the server silently serves the previous content and every
 * fix looks like it did not work.
 */
function invalidateIfChanged(): void {
  const stamp = fs.statSync(indexFile()).mtimeMs;
  if (stamp === indexStamp) return;
  indexStamp = stamp;
  indexCache = null;
  dayCache.clear();
}

export function courseIndex(): CourseIndex {
  const file = indexFile();
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error('no course content'), { code: 'CONTENT_MISSING' });
  }
  invalidateIfChanged();
  if (indexCache) return indexCache;
  indexCache = CourseIndex.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  return indexCache;
}

/**
 * Cached against the DAY FILE's own mtime, not just the index's: a day file is often edited
 * without touching course-index.json, and the edit must still show on the next request.
 */
export function courseDay(week: number, day: number): CourseDay | null {
  if (fs.existsSync(indexFile())) invalidateIfChanged();
  const key = dayKey(week, day);
  const file = path.join(CONTENT, 'weeks', 'week-' + week, 'day-' + day + '.json');
  if (!fs.existsSync(file)) return null;
  const stamp = fs.statSync(file).mtimeMs;
  const cached = dayCache.get(key);
  if (cached && cached.stamp === stamp) return cached.day;
  const parsed = CourseDay.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  dayCache.set(key, { day: parsed, stamp });
  return parsed;
}

// ---------------------------------------------------------------- progress

const EMPTY_PROGRESS: Progress = { schema: 'progress/v1', resume: null, progress: {} };

/**
 * There is exactly one record, for whoever is running this clone. A missing file reads as a
 * fresh start rather than an error - the file is created on the first write, never seeded.
 */
export function readProgress(): Progress {
  if (!fs.existsSync(PROGRESS_FILE)) return EMPTY_PROGRESS;
  return Progress.parse(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')));
}

function writeProgressFile(p: Progress): void {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous record intact rather than a
  // truncated file that fails to parse on the next read.
  const tmp = PROGRESS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2) + '\n');
  fs.renameSync(tmp, PROGRESS_FILE);
}

/** One in-flight mutation at a time - there is only the one record to contend over. */
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

/**
 * Records where the learner is and, unless `viewed: false`, that a part was read. A part
 * completes when it is recorded as read; a day completes when every part the day actually HAS
 * has been read - not a hardcoded four, because a day may have fewer parts, with gaps in the
 * part numbers.
 */
export async function recordProgress(update: ProgressUpdate): Promise<Progress> {
  return withLock(() => {
    const current = readProgress();

    const key = dayKey(update.week, update.day);
    const day = courseDay(update.week, update.day);
    const partsInDay = day ? day.parts.length : 4;

    const prior: DayProgress = current.progress[key] ?? {
      parts_viewed: [],
      completed: false,
      attempted_problems: [],
      first_opened_at: nowIso(),
      completed_at: null,
    };

    // `viewed: false` moves the resume point without counting the part as read.
    const viewed =
      update.viewed === false || prior.parts_viewed.includes(update.part)
        ? prior.parts_viewed
        : [...prior.parts_viewed, update.part].sort((a, b) => a - b);

    const attempted =
      update.attempted_problem && !prior.attempted_problems.includes(update.attempted_problem)
        ? [...prior.attempted_problems, update.attempted_problem].sort((a, b) => a - b)
        : prior.attempted_problems;

    // Every part the day HAS must be among those viewed. A count ("viewed.length >= parts") goes
    // wrong when part numbers have gaps: viewing a part the day no longer has would count.
    const completed = day ? day.parts.every((p) => viewed.includes(p.part)) : viewed.length >= partsInDay;

    const next: Progress = {
      ...current,
      resume: { week: update.week, day: update.day, part: update.part },
      progress: {
        ...current.progress,
        [key]: {
          ...prior,
          parts_viewed: viewed,
          attempted_problems: attempted,
          completed,
          completed_at: completed ? (prior.completed_at ?? nowIso()) : null,
        },
      },
    };
    writeProgressFile(next);
    return next;
  });
}

