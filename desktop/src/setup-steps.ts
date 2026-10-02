/**
 * The one-time setup an app release asks for (its manifest's `setup`, release-format.ts), run by the
 * launcher before the studio starts, each step once per computer and user:
 *
 *   bundle    a setup function the bundle itself has (StudioBundleV1.setup), such as moving the
 *             learner's data to a new layout
 *   package   an npm package the learner's code needs, which the launcher did not ship: its tarball
 *             comes inside the app release, is checked against its npm integrity, and is unpacked
 *             (untar.ts, no install script) into <user data>/Workspace/node_modules, where the
 *             learner's tests find it and a Run may use it (backend/src/runner.ts)
 *
 * A step that fails stops the start, and the launch window offers Retry: it runs again next time,
 * until it succeeds. What has run is recorded in <user data>\release-state\setup-done.json.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SetupStep } from './release-format';
import type { StudioBundleV1, StudioSetupHostV1 } from '../../shared/studio-host';
import { unpackNpmTarball } from './untar';

const doneFile = (stateDir: string): string => path.join(stateDir, 'setup-done.json');

function readDone(stateDir: string): Record<string, string> {
  try {
    const done = JSON.parse(fs.readFileSync(doneFile(stateDir), 'utf-8')) as unknown;
    return done && typeof done === 'object' && !Array.isArray(done) ? (done as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function markDone(stateDir: string, id: string): void {
  const done = { ...readDone(stateDir), [id]: new Date().toISOString() };
  fs.mkdirSync(stateDir, { recursive: true });
  const temp = doneFile(stateDir) + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(done, null, 2));
  fs.renameSync(temp, doneFile(stateDir));
}

export class SetupError extends Error {}

/**
 * Runs the steps not run yet. `files` is the app release's container; `workspaces` the folder the
 * Terminal's workspaces are in.
 */
export async function runSetupSteps(
  steps: SetupStep[],
  bundle: StudioBundleV1,
  host: StudioSetupHostV1,
  stateDir: string,
  files: ReadonlyMap<string, Buffer>,
  workspaces: string,
): Promise<void> {
  const done = readDone(stateDir);
  for (const step of steps) {
    // A package removed from the disk since is put back, whatever the record says.
    if (done[step.id] && (step.kind !== 'package' || fs.existsSync(path.join(workspaces, 'node_modules', ...step.name.split('/'), 'package.json')))) continue;
    host.progress('Setting up: ' + step.id);
    try {
      if (step.kind === 'bundle') {
        const fn = bundle.setup[step.id];
        if (typeof fn !== 'function') throw new Error('this version of the studio has no step "' + step.id + '"');
        await fn(host);
      } else {
        const tgz = files.get(step.path);
        if (!tgz) throw new Error('the release has no ' + step.path);
        const integrity = 'sha512-' + crypto.createHash('sha512').update(tgz).digest('base64');
        if (integrity !== step.integrity) throw new Error(step.name + ' ' + step.version + ' does not match its integrity');
        const target = path.join(workspaces, 'node_modules', ...step.name.split('/'));
        unpackNpmTarball(tgz, target);
        const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf-8')) as { name?: string; version?: string };
        if (pkg.name !== step.name || pkg.version !== step.version) throw new Error('the package is not ' + step.name + ' ' + step.version);
      }
    } catch (e) {
      throw new SetupError('Setting up "' + step.id + '" did not finish: ' + (e as Error).message);
    }
    markDone(stateDir, step.id);
  }
}
