/**
 * The record of the starting files the studio put into a Terminal workspace (.studio/seeded.json),
 * and the clean-up that takes them out again when the studio closes. Node only.
 *
 * Shared by the backend (backend/src/terminal/workspace.ts writes the files and the record) and the
 * desktop launcher (desktop/src/cleanup.ts), which removes them at quit and at the next start, so
 * that no course text stays on the learner's disk between sessions - even when the next launch is
 * offline and has no backend to do it. A starting file is course content; the record says which
 * files are the studio's and what they held. One that still matches is untouched and is removed; one
 * the learner changed is theirs and is kept. The record itself is kept, so the next command writes
 * the removed files again (prepareWorkspace() writes every starting file that is missing).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROJECT_FILE } from './contracts/course_day';

export const SEED_RECORD = path.join('.studio', 'seeded.json');

export const fingerprint = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

/** A path inside the workspace folder, from one the record gives, or null when it is not a project file. */
export function insideWorkspace(dir: string, rel: string): string | null {
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!PROJECT_FILE.test(clean) || clean.split('/').includes('..')) return null;
  return path.join(dir, ...clean.split('/'));
}

/**
 * The record, by path, of each starting file's fingerprint. The learner's code can write here, so one
 * that cannot be read is treated as none (null), and an entry that is not a string is left out.
 */
export function readSeedRecord(dir: string): Record<string, string> | null {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(dir, SEED_RECORD), 'utf-8')) as unknown;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    return Object.fromEntries(Object.entries(record as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return null;
  }
}

/** Whether a workspace file is a starting file the learner has not changed. */
export function isUntouchedSeed(dir: string, rel: string, text: string): boolean {
  const record = readSeedRecord(dir);
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  return record !== null && record[clean] === fingerprint(text);
}

/** Folders the test runner writes, which hold the course's test names, output and page text. */
const RUN_OUTPUT = ['playwright-report', 'test-results'];

/**
 * Removes the untouched starting files from one workspace folder, the test runner's output, and any
 * folder left empty. Each file on its own: one that cannot be removed (open in another program) is
 * left, and the rest still go. Returns how many files were removed.
 */
export function removeUntouchedSeeds(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const record = readSeedRecord(dir) ?? {};
  const emptied = new Set<string>();
  for (const [rel, print] of Object.entries(record)) {
    const file = insideWorkspace(dir, rel);
    if (!file) continue;
    try {
      if (fingerprint(fs.readFileSync(file, 'utf-8')) !== print) continue;
      fs.rmSync(file, { force: true });
      removed++;
      emptied.add(path.dirname(file));
    } catch {
      // Missing already, or held open: nothing to do.
    }
  }
  for (const name of RUN_OUTPUT) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      // Held open by a report still showing: left for the next clean-up.
    }
  }
  // Folders the starting files left empty, up to (not including) the workspace itself.
  const root = path.resolve(dir);
  for (const start of emptied) {
    let at = path.resolve(start);
    while (at.startsWith(root + path.sep)) {
      try {
        if (fs.readdirSync(at).length > 0) break;
        fs.rmdirSync(at);
      } catch {
        break;
      }
      at = path.dirname(at);
    }
  }
  return removed;
}
