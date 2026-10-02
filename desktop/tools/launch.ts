/**
 * Opens the Studio Tools window: builds it, stages it, and starts Electron detached.
 *
 * It runs from a staged copy in %LOCALAPPDATA%\EvokeStudioTools, not from desktop/node_modules,
 * because the jobs it runs (build-app, new-customer, publish-app) do `npm ci` there, which removes
 * Electron's binaries and node-pty out from under a window running from them. (Electron's install
 * script is not in allowScripts, so npm ci leaves no electron/dist; tests/packed.ts downloads it
 * on demand the same way this does.) Electron is copied once per version; the window itself and
 * node-pty at every launch.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { buildTools } from './build';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const STAGE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'EvokeStudioTools');

/** Electron's program, downloaded by its own installer when npm ci left none (checked against its checksums). */
function electronDist(): string {
  const dist = path.join(DESKTOP, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(path.join(dist, 'electron.exe'))) {
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!/electron|force_no_cache/i.test(k)) env[k] = v;
    console.log('Downloading Electron for the Studio Tools window (checked against its checksums)...');
    execFileSync(process.execPath, [path.join(DESKTOP, 'node_modules', 'electron', 'install.js')], { stdio: 'inherit', env });
  }
  return dist;
}

function stageElectron(version: string): string {
  const target = path.join(STAGE, 'electron-' + version);
  if (!fs.existsSync(path.join(target, '.complete'))) {
    const dist = electronDist();
    console.log('Copying Electron ' + version + ' to ' + target + ' (once per version, about 370 MB)...');
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(dist, target, { recursive: true });
    fs.writeFileSync(path.join(target, '.complete'), version + '\n');
  }
  for (const name of fs.readdirSync(STAGE)) {
    if (name.startsWith('electron-') && name !== 'electron-' + version) fs.rmSync(path.join(STAGE, name), { recursive: true, force: true });
  }
  return target;
}

function stageApp(dist: string, electron: string): string {
  const app = path.join(STAGE, 'app');
  const fresh = path.join(STAGE, 'app.new');
  const old = path.join(STAGE, 'app.old');
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.rmSync(old, { recursive: true, force: true });
  fs.cpSync(dist, fresh, { recursive: true });
  for (const pkg of ['node-pty', 'node-addon-api']) {
    const from = path.join(DESKTOP, 'node_modules', pkg);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(fresh, 'node_modules', pkg), { recursive: true });
  }
  fs.writeFileSync(path.join(fresh, 'config.json'), JSON.stringify({ root: ROOT, desktop: DESKTOP, electron, builtAt: new Date().toISOString() }, null, 2) + '\n');
  try {
    if (fs.existsSync(app)) fs.renameSync(app, old);
    fs.renameSync(fresh, app);
    fs.rmSync(old, { recursive: true, force: true });
  } catch {
    // A window is open and holds pty.node: it keeps running from the copy it has.
    if (fs.existsSync(old) && !fs.existsSync(app)) fs.renameSync(old, app);
    fs.rmSync(fresh, { recursive: true, force: true });
    console.log('Studio Tools is already open; close it and run this again to pick up a rebuilt window.');
  }
  return app;
}

async function main(): Promise<void> {
  const version = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf-8')) as { version: string }).version;
  const dist = await buildTools();
  fs.mkdirSync(STAGE, { recursive: true });
  const electron = stageElectron(version);
  const app = stageApp(dist, electron);
  // --stage-only: build and stage, print where, and start nothing (the tests drive the window themselves).
  if (process.argv.includes('--stage-only')) {
    console.log(JSON.stringify({ electron: path.join(electron, 'electron.exe'), app }));
    return;
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.join(electron, 'electron.exe'), [app], { cwd: DESKTOP, detached: true, stdio: 'ignore', env, windowsHide: false });
  child.on('error', (e) => {
    console.error('The Studio Tools window could not start: ' + e.message);
    process.exitCode = 1;
  });
  child.unref();
  console.log('Studio Tools is open.');
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
