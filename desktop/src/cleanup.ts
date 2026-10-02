/**
 * Takes the course off the learner's disk again: at quit, and at every start (for what a crash, a
 * power cut or a killed process left). Owned by the launcher, not the downloaded studio, so it runs
 * even when a start fails offline and the studio never opens.
 *
 * The course itself and the studio's code only ever live in memory. What reaches the disk while the
 * studio runs, and goes here:
 *
 *   - the Terminal's starting files the learner has not changed (shared/workspace-seeds.ts: one the
 *     learner changed is their work and stays), and the test runner's report and results
 *   - this app's Run scratch folders in the temporary folder (only this variant's: their names
 *     carry its own prefix, so another variant's running Run is never touched)
 *
 * Progress, the learner's own files and the licence stay.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { removeUntouchedSeeds } from '../../shared/workspace-seeds';

export function removeCourseLeftovers(userDir: string, runPrefix: string): number {
  let removed = 0;
  const workspaces = path.join(userDir, 'Workspace');
  try {
    for (const e of fs.readdirSync(workspaces, { withFileTypes: true })) {
      if (e.isDirectory() && !e.isSymbolicLink()) removed += removeUntouchedSeeds(path.join(workspaces, e.name));
    }
  } catch {
    // No workspace yet.
  }
  if (/^studio-run-[0-9a-f]{8}-$/.test(runPrefix)) {
    try {
      for (const name of fs.readdirSync(os.tmpdir())) {
        if (!name.startsWith(runPrefix)) continue;
        try {
          fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          removed++;
        } catch {
          // Held open by a browser still closing: the next clean-up takes it.
        }
      }
    } catch {
      // The temporary folder cannot be listed: nothing to do.
    }
  }
  return removed;
}
