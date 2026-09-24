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
 *   npm run runtime -- --fresh --pin   after upgrading Playwright or Node: downloads the browsers,
 *                                  and records their hashes, and the Node version and its hash, in
 *                                  desktop/runtime-pins.json, to commit (--pin needs --fresh: a
 *                                  pin is never taken from this computer's cache)
 *
 * node.exe must carry the OpenJS Foundation's valid signature, be the version and file pinned in
 * runtime-pins.json, and have nothing beside it but its licence and npm's version number (Windows
 * loads a DLL from beside a program before its own). The browsers are Playwright's own
 * builds, which are not signed: each must match the hash of its whole folder that
 * runtime-pins.json records, so a browser changed in this computer's cache, or on its way from the
 * internet, is refused. Packaging checks the manifest and the pins again (verifyManifest), so
 * nothing that changes here after it was gathered goes out unnoticed.
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
const PINS = path.join(DESKTOP, 'runtime-pins.json');

/** Windows' verdict on a program's signature, and who signed it. */
export function signature(file: string): { status: string; signer: string } {
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
  if (s.status !== 'Valid' || !/^CN="?OpenJS Foundation"?,/.test(s.signer)) {
    throw new Error(file + ' does not carry the OpenJS Foundation\'s valid signature (' + s.status + ', ' + s.signer + '). It will not be shipped.');
  }
}

/** All that runtime/node may hold. */
const NODE_FILES = ['node.exe', 'npm-version.txt', 'LICENSE'];

const sha256 = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Throws unless runtime/node holds only NODE_FILES, and its node.exe is the pinned one. */
function checkNode(): void {
  const dir = path.join(OUT, 'node');
  const extra = fs.readdirSync(dir).filter((n) => !NODE_FILES.includes(n));
  if (extra.length) throw new Error('desktop/runtime/node holds files that must not ship (' + extra.join(', ') + '). Run `npm run runtime -- --fresh`.');
  const want = readPins()['node.exe'];
  if (!want) throw new Error('desktop/runtime-pins.json has no pin for node.exe. Run `npm run runtime -- --fresh --pin` and commit the file.');
  const exe = path.join(dir, 'node.exe');
  requireNodeSignature(exe);
  const got = execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() + ' ' + sha256(exe);
  if (got !== want) throw new Error('desktop/runtime/node/node.exe is not the pinned Node (' + want.split(' ')[0] + '). Run `npm run runtime -- --fresh` with that Node, or pin a new one.');
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
  // A node.exe already there runs only once its signature is proven.
  let have: string | null = null;
  if (fs.existsSync(exe)) {
    try {
      requireNodeSignature(exe);
      have = execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim();
    } catch {
      have = null;
    }
  }
  const extra = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => !NODE_FILES.includes(n)) : [];
  if (have === process.version && extra.length === 0) {
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

/** The hash of a whole folder: every file's path and SHA-256. */
function treeHash(dir: string): string {
  return crypto
    .createHash('sha256')
    .update(
      files(dir)
        .sort()
        .map((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, ...f.split('/')))).digest('hex') + '  ' + f)
        .join('\n'),
    )
    .digest('hex');
}

type Pins = Record<string, string>;
const readPins = (): Pins => (fs.existsSync(PINS) ? (JSON.parse(fs.readFileSync(PINS, 'utf-8')) as Pins) : {});

/** Throws unless every browser folder matches its pin. */
function checkPins(dir: string, names: string[]): void {
  const pins = readPins();
  for (const name of names) {
    const want = pins[name];
    if (!want) throw new Error('desktop/runtime-pins.json has no hash for ' + name + '. After upgrading Playwright, run `npm run runtime -- --fresh --pin` and commit the file.');
    if (treeHash(path.join(dir, name)) !== want) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      throw new Error(name + ' does not match its hash in desktop/runtime-pins.json, and was removed. Run `npm run runtime -- --fresh`.');
    }
  }
}

/**
 * The environment `playwright install` downloads with: no other download host, and no switch that
 * would weaken the checking of its HTTPS certificate.
 */
function downloadEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(PLAYWRIGHT_|NODE_TLS_|NODE_EXTRA_CA_CERTS$|NODE_OPTIONS$|SSL_CERT_|DEBUG$)/i.test(k)) continue;
    env[k] = v;
  }
  env.PLAYWRIGHT_BROWSERS_PATH = dir;
  return env;
}

function browsers(fresh: boolean, pin: boolean): string[] {
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
      env: downloadEnv(dir),
    });
    // What the installer adds beside the browsers (its .links folder) does not ship.
    for (const name of fs.readdirSync(dir)) {
      if (!wanted.includes(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
  if (pin) {
    const exe = path.join(OUT, 'node', 'node.exe');
    const pins = {
      'node.exe': execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() + ' ' + sha256(exe),
      ...Object.fromEntries(wanted.map((n) => [n, treeHash(path.join(dir, n))])),
    };
    fs.writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n');
    console.log('pins      ' + PINS + ' (commit it)');
  }
  checkPins(dir, wanted);
  return wanted;
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
  checkNode();
  const dir = path.join(OUT, 'ms-playwright');
  checkPins(dir, fs.readdirSync(dir));
}

if (require.main === module) {
  const fresh = process.argv.includes('--fresh');
  const pin = process.argv.includes('--pin');
  if (pin && !fresh) {
    console.error('--pin records what it downloads, never what is in this computer\'s cache: use --fresh --pin.');
    process.exit(1);
  }
  node();
  browsers(fresh, pin);
  checkNode();
  fs.writeFileSync(MANIFEST, hashes());
  console.log('manifest  ' + MANIFEST);
}
