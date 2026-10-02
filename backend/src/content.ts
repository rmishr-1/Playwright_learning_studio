/**
 * The course content, read from one of two places:
 *
 *   - Data/Content/, the plain files `npm run build:content` writes (development)
 *   - memory: the desktop app downloads the course at every start, decrypts it, and hands it over
 *     here (useContent); it is never written to the learner's disk, and is gone when the app closes
 *
 * In the app (STUDIO_CONTENT_SOURCE=memory) there is no fallback to files: before the course has
 * been handed over, every read fails, rather than finding a Data\Content folder beside the program.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTENT } from './config';

const MEMORY = process.env.STUDIO_CONTENT_SOURCE === 'memory';

let course: ReadonlyMap<string, string> | null = null;
let servingMark: string | null = null;
/** Changes with every course handed over, so no cache keeps a file from an earlier one. */
let generation = 1;

/**
 * The course this run serves, and the licence ID every day is watermarked with as it is served
 * (routes.ts). Called by the desktop app once it has downloaded and opened the course.
 */
export function useContent(opts: { files: ReadonlyMap<string, string>; mark: string | null }): void {
  course = opts.files;
  servingMark = opts.mark;
  generation++;
}

/** The licence ID the served lessons are marked with, when the app runs under a licence. */
export const serveMark = (): string | null => servingMark;

function inMemory(): ReadonlyMap<string, string> | null {
  if (course) return course;
  if (MEMORY) throw new Error('The course has not been downloaded.');
  return null;
}

/** A content file's text, by its path under Data/Content/ ('weeks/week-1/day-1.json'). null when there is none. */
export function readContent(rel: string): string | null {
  const files = inMemory();
  if (files) return files.get(rel) ?? null;
  const file = path.join(CONTENT, ...rel.split('/'));
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

/**
 * When a content file last changed, so a cache can tell an edited file from the one it holds.
 * null when there is no such file. A course in memory never changes, but a new one may be handed
 * over, which makes every cached file stale.
 */
export function contentStamp(rel: string): number | null {
  const files = inMemory();
  if (files) return files.has(rel) ? generation : null;
  const file = path.join(CONTENT, ...rel.split('/'));
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : null;
}
