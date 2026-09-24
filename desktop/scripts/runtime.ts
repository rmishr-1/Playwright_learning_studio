/**
 * Gathers what the app ships so it runs with no Node and no internet on the learner's computer:
 *
 *   desktop/runtime/node/          node.exe, from the Node this script runs on (24.x), and the
 *                                  version of its npm (npm itself is not shipped)
 *   desktop/runtime/ms-playwright/ Chromium, Firefox and WebKit at the revisions the studio's
 *                                  Playwright expects, from this computer's browser cache, or
 *                                  downloaded by `playwright install` when they are not there
 *
 *   npm run runtime            (in desktop/)
 *
 * Both folders are ignored by Git. It is safe to run again: what is already there is kept.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'runtime');

function node(): void {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24) {
    throw new Error('Run this with Node 24 (found ' + process.version + '): the app ships the Node that runs it.');
  }
  const dir = path.join(OUT, 'node');
  const exe = path.join(dir, 'node.exe');
  const home = path.dirname(process.execPath);
  // No command runs npm itself, so only its version ships, for `npm --version`.
  const npm = (JSON.parse(fs.readFileSync(path.join(home, 'node_modules', 'npm', 'package.json'), 'utf-8')) as { version: string }).version;
  const have = fs.existsSync(exe) ? execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() : null;
  if (have === process.version && !fs.existsSync(path.join(dir, 'node_modules'))) {
    fs.writeFileSync(path.join(dir, 'npm-version.txt'), npm + '\n');
    console.log('node      ' + have + ', npm ' + npm + ' (already there)');
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(process.execPath, exe);
  fs.writeFileSync(path.join(dir, 'npm-version.txt'), npm + '\n');
  for (const f of ['LICENSE']) {
    if (fs.existsSync(path.join(home, f))) fs.copyFileSync(path.join(home, f), path.join(dir, f));
  }
  console.log('node      ' + process.version + ' (' + major + '.' + minor + '), npm ' + npm + ', copied from ' + home);
}

function browsers(): void {
  const dir = path.join(OUT, 'ms-playwright');
  fs.mkdirSync(dir, { recursive: true });
  const list = (
    JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'playwright-core', 'browsers.json'), 'utf-8')) as {
      browsers: { name: string; revision: string; installByDefault: boolean }[];
    }
  ).browsers;
  // winldd is a Windows helper Playwright installs with the browsers.
  const wanted = list
    .filter((b) => b.installByDefault)
    .map((b) => b.name.replace(/-/g, '_') + '-' + b.revision);
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (fs.existsSync(cache)) {
    for (const name of fs.readdirSync(cache).filter((n) => n.startsWith('winldd-'))) wanted.push(name);
  }
  const missing: string[] = [];
  for (const name of wanted) {
    const target = path.join(dir, name);
    if (fs.existsSync(path.join(target, 'INSTALLATION_COMPLETE'))) {
      console.log('browser   ' + name + ' (already there)');
      continue;
    }
    const source = path.join(cache, name);
    if (fs.existsSync(path.join(source, 'INSTALLATION_COMPLETE'))) {
      fs.cpSync(source, target, { recursive: true });
      console.log('browser   ' + name + ' copied from ' + cache);
    } else {
      missing.push(name);
    }
  }
  if (missing.length) {
    console.log('browser   downloading ' + missing.join(', '));
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium', 'firefox', 'webkit'], {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
    });
  }
}

node();
browsers();
