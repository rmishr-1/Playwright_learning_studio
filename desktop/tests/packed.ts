/**
 * Lays out desktop/build/app the way the installer installs it, for the tests to drive:
 *
 *   build/test-app/QA Practice Training Studio.exe     Electron, with the release's fuses
 *   build/test-app/resources/app.asar                  the app, packed
 *   build/test-app/resources/node, ms-playwright       desktop/runtime, linked
 *
 * The one difference from a release: the fuse that lets a debugger attach is left on, because
 * that is how Playwright drives the app. Everything that depends on being packed (app.asar,
 * app.isPackaged, resourcesPath, the other fuses) behaves as installed. A window that only fails
 * inside app.asar, as the setup window once did, fails here too.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as asar from '@electron/asar';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';

const DESKTOP = path.resolve(__dirname, '..');

/**
 * Electron's own program, for the tests (a package ships its own copy, downloaded and checked in
 * scripts/package.ts). Electron no longer downloads it when installed, so `npm ci` leaves none: its
 * installer fetches it here, checked against the checksums in the electron package, with nothing in
 * the environment able to point it at another copy or another checksum.
 */
function electronDist(): string {
  const dist = path.join(DESKTOP, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(path.join(dist, 'electron.exe'))) {
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!/electron|force_no_cache/i.test(k)) env[k] = v;
    console.log('Downloading Electron for the tests (checked against its checksums)...');
    execFileSync(process.execPath, [path.join(DESKTOP, 'node_modules', 'electron', 'install.js')], { stdio: 'inherit', env });
  }
  return dist;
}

export async function packedApp(): Promise<string> {
  const dir = path.join(DESKTOP, 'build', 'test-app');
  const resources = path.join(dir, 'resources');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.cpSync(electronDist(), dir, { recursive: true });
  const exe = path.join(dir, 'QA Practice Training Studio.exe');
  fs.renameSync(path.join(dir, 'electron.exe'), exe);
  fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
  await asar.createPackageWithOptions(path.join(DESKTOP, 'build', 'app'), path.join(resources, 'app.asar'), {
    unpack: '**/node_modules/**',
  });
  for (const name of ['node', 'ms-playwright']) {
    fs.symlinkSync(path.join(DESKTOP, 'runtime', name), path.join(resources, name), 'junction');
  }
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  return exe;
}
