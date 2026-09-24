/**
 * Gathers what the app ships so it runs with no Node and no internet on the learner's computer:
 *
 *   desktop/runtime/node/          node.exe, from the Node this script runs on (24.x), and the
 *                                  version of its npm (npm itself is not shipped)
 *   desktop/runtime/ms-playwright/ Chromium, Firefox and WebKit at the revisions the studio's
 *                                  Playwright pins, from this computer's browser cache, or
 *                                  downloaded by `playwright install` when they are not there
 *   desktop/runtime/MANIFEST.sha256   the SHA-256 of every file above
 *
 *   npm run runtime                (in desktop/)
 *   npm run runtime -- --fresh     downloads the browsers again rather than copying the cache: do
 *                                  this for a build that leaves Evoke
 *
 * node.exe must carry the OpenJS Foundation's valid signature. The browsers are Playwright's own
 * builds, which are not signed; --fresh takes them straight from Playwright. Packaging checks the
 * manifest (verifyManifest), so nothing that changes here after it was gathered goes out unnoticed.
 *
 * Both folders are ignored by Git. It is safe to run again: what is already there is kept.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { systemExe } from '../../backend/src/child-env';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'runtime');
const MANIFEST = path.join(OUT, 'MANIFEST.sha256');

/** Windows' verdict on a program's signature, and who signed it. */
function signature(file: string): { status: string; signer: string } {
  const script =
    '$s = Get-AuthenticodeSignature -LiteralPath $env:STUDIO_SIGNED_FILE; ' +
    "Write-Output ($s.Status.ToString() + '|' + $s.SignerCertificate.Subject)";
  const out = execFileSync(systemExe(path.join('WindowsPowerShell', 'v1.0', 'powershell.exe')), ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf-8',
    windowsHide: true,
    env: { ...process.env, STUDIO_SIGNED_FILE: file },
  }).trim();
  const [status, signer] = out.split('|');
  return { status, signer: signer ?? '' };
}

function requireNodeSignature(file: string): void {
  const s = signature(file);
  if (s.status !== 'Valid' || !/CN=OpenJS Foundation/.test(s.signer)) {
    throw new Error(file + ' does not carry the OpenJS Foundation\'s valid signature (' + s.status + ', ' + s.signer + '). It will not be shipped.');
  }
}

function node(): void {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24) {
    throw new Error('Run this with Node 24 (found ' + process.version + '): the app ships the Node that runs it.');
  }
  const dir = path.join(OUT, 'node');
  const exe = path.join(dir, 'node.exe');
  const home = path.dirname(process.execPath);
  requireNodeSignature(process.execPath);
  // No command runs npm itself, so only its version ships, for `npm --version`.
  const npm = (JSON.parse(fs.readFileSync(path.join(home, 'node_modules', 'npm', 'package.json'), 'utf-8')) as { version: string }).version;
  const have = fs.existsSync(exe) ? execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() : null;
  if (have === process.version && !fs.existsSync(path.join(dir, 'node_modules'))) {
    requireNodeSignature(exe);
    fs.writeFileSync(path.join(dir, 'npm-version.txt'), npm + '\n');
    console.log('node      ' + have + ', npm ' + npm + ', signed by the OpenJS Foundation (already there)');
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(process.execPath, exe);
  requireNodeSignature(exe);
  fs.writeFileSync(path.join(dir, 'npm-version.txt'), npm + '\n');
  for (const f of ['LICENSE']) {
    if (fs.existsSync(path.join(home, f))) fs.copyFileSync(path.join(home, f), path.join(dir, f));
  }
  console.log('node      ' + process.version + ' (' + major + '.' + minor + '), npm ' + npm + ', signed by the OpenJS Foundation, copied from ' + home);
}

function browsers(fresh: boolean): void {
  const dir = path.join(OUT, 'ms-playwright');
  const list = (
    JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'playwright-core', 'browsers.json'), 'utf-8')) as {
      browsers: { name: string; revision: string; installByDefault: boolean }[];
    }
  ).browsers;
  // The browsers Playwright installs by default, and winldd, the Windows helper it installs with
  // them: each at the one revision the studio's Playwright pins.
  const wanted = list
    .filter((b) => b.installByDefault || b.name === 'winldd')
    .map((b) => b.name.replace(/-/g, '_') + '-' + b.revision);
  if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // Anything else here (an older revision) does not ship.
  for (const name of fs.readdirSync(dir)) {
    if (!wanted.includes(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  const missing: string[] = [];
  for (const name of wanted) {
    const target = path.join(dir, name);
    if (fs.existsSync(path.join(target, 'INSTALLATION_COMPLETE'))) {
      console.log('browser   ' + name + ' (already there)');
      continue;
    }
    const source = path.join(cache, name);
    if (!fresh && fs.existsSync(path.join(source, 'INSTALLATION_COMPLETE'))) {
      fs.cpSync(source, target, { recursive: true });
      console.log('browser   ' + name + ' copied from ' + cache);
    } else {
      missing.push(name);
    }
  }
  if (missing.length) {
    console.log('browser   downloading ' + missing.join(', ') + ' from Playwright');
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium', 'firefox', 'webkit'], {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
    });
  }
}

function files(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

function hashes(): string {
  return files(OUT)
    .filter((f) => f !== 'MANIFEST.sha256')
    .sort()
    .map((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, ...f.split('/')))).digest('hex') + '  ' + f)
    .join('\n') + '\n';
}

/** Throws when anything in desktop/runtime has changed since the manifest was written. */
export function verifyManifest(): void {
  if (!fs.existsSync(MANIFEST)) throw new Error('desktop/runtime has no manifest. Run `npm run runtime` first.');
  const want = fs.readFileSync(MANIFEST, 'utf-8');
  const got = hashes();
  if (got !== want) {
    const w = new Set(want.split('\n'));
    const changed = got.split('\n').filter((l) => l && !w.has(l)).map((l) => l.slice(66)).slice(0, 5);
    throw new Error('desktop/runtime has changed since it was gathered (' + (changed.join(', ') || 'files removed') + '). Run `npm run runtime -- --fresh`.');
  }
  requireNodeSignature(path.join(OUT, 'node', 'node.exe'));
}

if (require.main === module) {
  node();
  browsers(process.argv.includes('--fresh'));
  fs.writeFileSync(MANIFEST, hashes());
  console.log('manifest  ' + MANIFEST);
}
