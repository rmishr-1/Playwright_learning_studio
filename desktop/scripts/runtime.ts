/**
 * Gathers Node and the browsers the learner's code runs on into desktop/runtime, and pins them:
 *
 *   desktop/runtime/node/            node.exe, its LICENSE, and the version of its npm (npm itself
 *                                    is not shipped)
 *   desktop/runtime/ms-playwright/   Chromium, its headless shell, Firefox, WebKit, ffmpeg and
 *                                    winldd, at the revisions the studio's Playwright pins
 *   desktop/runtime/MANIFEST.sha256  the SHA-256 of every file above
 *
 * Everything comes from its official archive, through the same code a learner's first start uses
 * (src/runtime-install.ts): Node from nodejs.org, Chromium from Chrome for Testing, the others from
 * Playwright's CDN, as `playwright install` would. So the full installer, which carries this folder,
 * and the standard one, whose first start downloads the same archives, end up with the same files.
 *
 *   npm run runtime                 (in desktop/) from the pins in runtime-sources.json; archives
 *                                   already in desktop/runtime-archives/ (gitignored) are reused
 *                                   when they match
 *   npm run runtime -- --fresh      downloads every archive again: do this for a build that leaves Evoke
 *   npm run runtime -- --fresh --pin   after upgrading Playwright or Node: downloads the archives for
 *                                   this checkout's Playwright and the Node running this, and records
 *                                   their hashes in runtime-sources.json and runtime-pins.json, to
 *                                   commit (--pin needs --fresh: a pin is never taken from a cache)
 *
 * node.exe must carry the OpenJS Foundation's valid signature and be the version and file pinned.
 * The browsers are Playwright's own builds, which are not signed: each archive must match its
 * pinned SHA-256, and the folder it unpacks to its pinned hash, so a browser changed anywhere on its
 * way is refused. Packaging checks the manifest and the pins again (verifyManifest), so nothing that
 * changes here after it was gathered goes out unnoticed.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { systemExe } from '../../backend/src/system-exe';
import {
  ensureRuntime,
  fileSha256,
  filesUnder,
  installPiece,
  treeHashSync,
  type Download,
  type Measured,
  type RuntimePiece,
} from '../src/runtime-install';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'runtime');
const MANIFEST = path.join(OUT, 'MANIFEST.sha256');
const PINS = path.join(DESKTOP, 'runtime-pins.json');
export const SOURCES_FILE = path.join(DESKTOP, 'runtime-sources.json');
/** The official archives, kept once downloaded: a second gather, and the tests, need no download. */
export const ARCHIVES = path.join(DESKTOP, 'runtime-archives');

/**
 * Where the runtime may be downloaded from: the official servers, and where they send a download on
 * to (cdn.playwright.dev forwards Chromium to Chrome for Testing and the others to Microsoft's CDN).
 * Built into every standard launcher as its allow-list (src/fetch-session.ts).
 */
export const RUNTIME_HOSTS = [
  'https://nodejs.org/dist/',
  'https://storage.googleapis.com/chrome-for-testing-public/',
  'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/',
  'https://cdn.playwright.dev/',
];
const GOOGLE = 'https://storage.googleapis.com/chrome-for-testing-public/';
const MICROSOFT = 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/';
const PLAYWRIGHT = 'https://cdn.playwright.dev/';

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

type Pins = Record<string, string>;
const readPins = (): Pins => (fs.existsSync(PINS) ? (JSON.parse(fs.readFileSync(PINS, 'utf-8')) as Pins) : {});

/** Throws unless runtime/node holds only NODE_FILES, and is the pinned Node. */
function checkNode(): void {
  const dir = path.join(OUT, 'node');
  const extra = fs.readdirSync(dir).filter((n) => !NODE_FILES.includes(n));
  if (extra.length) throw new Error('desktop/runtime/node holds files that must not ship (' + extra.join(', ') + '). Run `npm run runtime -- --fresh`.');
  const pins = readPins();
  const want = pins['node.exe'];
  if (!want || !pins.node) throw new Error('desktop/runtime-pins.json has no pin for Node. Run `npm run runtime -- --fresh --pin` and commit the file.');
  const exe = path.join(dir, 'node.exe');
  requireNodeSignature(exe);
  const got = execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() + ' ' + sha256(exe);
  if (got !== want || treeHashSync(dir) !== pins.node) {
    throw new Error('desktop/runtime/node is not the pinned Node (' + want.split(' ')[0] + '). Run `npm run runtime -- --fresh`.');
  }
}

/** Throws unless every browser folder matches its pin. */
function checkPins(dir: string, names: string[]): void {
  const pins = readPins();
  for (const name of names) {
    const want = pins[name];
    if (!want) throw new Error('desktop/runtime-pins.json has no hash for ' + name + '. After upgrading Playwright, run `npm run runtime -- --fresh --pin` and commit the file.');
    if (treeHashSync(path.join(dir, name)) !== want) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      throw new Error(name + ' does not match its hash in desktop/runtime-pins.json, and was removed. Run `npm run runtime -- --fresh`.');
    }
  }
}

// ---------------------------------------------------------------- what to download

/**
 * The pieces this checkout's Playwright and the Node running this need, at their official
 * addresses, not yet measured: the URLs are the ones `playwright install` uses (playwright-core's
 * DOWNLOAD_PATHS and PLAYWRIGHT_CDN_MIRRORS), final address first.
 */
function officialPieces(): RuntimePiece[] {
  const list = (
    JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'playwright-core', 'browsers.json'), 'utf-8')) as {
      browsers: { name: string; revision: string; browserVersion?: string; installByDefault: boolean }[];
    }
  ).browsers.filter((b) => b.installByDefault || b.name === 'winldd');
  const unknown = { size: 0, sha256: '', tree: '', unpacked: 0 };
  const browsers = list.map((b): RuntimePiece => {
    const name = b.name.replace(/-/g, '_') + '-' + b.revision;
    if (b.name === 'chromium' || b.name === 'chromium-headless-shell') {
      if (!b.browserVersion) throw new Error(b.name + ' has no browserVersion in browsers.json.');
      const file = b.name === 'chromium' ? 'chrome-win64.zip' : 'chrome-headless-shell-win64.zip';
      const sub = b.browserVersion + '/win64/' + file;
      return {
        name,
        kind: 'browser',
        urls: [GOOGLE + sub, PLAYWRIGHT + 'builds/cft/' + sub],
        exe: b.name === 'chromium' ? 'chrome-win64/chrome.exe' : 'chrome-headless-shell-win64/chrome-headless-shell.exe',
        ...unknown,
      };
    }
    const exe: Record<string, string> = { firefox: 'firefox/firefox.exe', webkit: 'Playwright.exe', ffmpeg: 'ffmpeg-win64.exe', winldd: 'PrintDeps.exe' };
    if (!exe[b.name]) throw new Error('The studio does not know how to download ' + b.name + ' (Playwright was upgraded?). Add it to scripts/runtime.ts.');
    const sub = 'builds/' + b.name + '/' + b.revision + '/' + b.name + '-win64.zip';
    return { name, kind: 'browser', urls: [MICROSOFT + sub, PLAYWRIGHT + sub, PLAYWRIGHT + 'dbazure/download/playwright/' + sub], exe: exe[b.name], ...unknown };
  });
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 24) throw new Error('Run this with Node 24 (found ' + process.version + '): the app ships the Node that pins it.');
  const top = 'node-' + process.version + '-win-x64';
  const node: RuntimePiece = { name: 'node', kind: 'node', urls: ['https://nodejs.org/dist/' + process.version + '/' + top + '.zip'], exe: 'node.exe', archiveRoot: top, ...unknown };
  return [node, ...browsers];
}

export type RuntimeSources = { allow: string[]; pieces: RuntimePiece[] };

/** runtime-sources.json, checked: every piece fully pinned, every URL on the allow-list. */
export function readRuntimeSources(): RuntimeSources {
  if (!fs.existsSync(SOURCES_FILE)) throw new Error('desktop/runtime-sources.json is missing. Run `npm run runtime -- --fresh --pin` and commit it.');
  const raw = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf-8')) as Partial<RuntimeSources>;
  const allow = raw.allow ?? [];
  const pieces = raw.pieces ?? [];
  if (!allow.length || allow.some((a) => !/^https:\/\/[a-z0-9.-]+\/([\w.-]+\/)*$/.test(a))) throw new Error('runtime-sources.json: "allow" must list https:// address prefixes.');
  for (const p of pieces) {
    const ok =
      typeof p.name === 'string' && /^(node|[a-z0-9_]+-\d+)$/.test(p.name) && (p.kind === 'node' || p.kind === 'browser') &&
      Array.isArray(p.urls) && p.urls.length > 0 && p.urls.every((u) => allow.some((a) => u.startsWith(a))) &&
      Number.isInteger(p.size) && p.size > 0 && /^[0-9a-f]{64}$/.test(p.sha256) && /^[0-9a-f]{64}$/.test(p.tree) &&
      Number.isInteger(p.unpacked) && p.unpacked > 0 && typeof p.exe === 'string' && !p.exe.includes('..') &&
      (p.kind === 'browser' || /^node-v\d+\.\d+\.\d+-win-x64$/.test(p.archiveRoot ?? ''));
    if (!ok) throw new Error('runtime-sources.json: the entry for ' + String(p.name) + ' is not complete. Run `npm run runtime -- --fresh --pin`.');
  }
  if (!pieces.some((p) => p.kind === 'node')) throw new Error('runtime-sources.json has no Node.');
  return { allow, pieces };
}

/**
 * The pinned pieces, checked against this checkout: the browsers its Playwright needs and the pins
 * the full build is checked with. A Playwright upgrade without a new pin stops here.
 */
export function checkedRuntimeSources(): RuntimeSources {
  const sources = readRuntimeSources();
  const pins = readPins();
  const wanted = officialPieces().map((p) => p.name).sort().join();
  const have = sources.pieces.map((p) => p.name).sort().join();
  if (wanted !== have) {
    throw new Error('runtime-sources.json is for other browser versions (' + have + ') than this Playwright needs (' + wanted + '). Run `npm run runtime -- --fresh --pin`.');
  }
  for (const p of sources.pieces) {
    if (pins[p.name] !== p.tree) throw new Error('runtime-sources.json and runtime-pins.json disagree about ' + p.name + '. Run `npm run runtime -- --fresh --pin`.');
  }
  return sources;
}

// ---------------------------------------------------------------- downloading, on the build machine

/** Counts the bytes going through. */
function counter(onBytes: (bytes: number) => void): Transform {
  let n = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      n += chunk.length;
      onBytes(n);
      done(null, chunk);
    },
  });
}

/**
 * Downloads with Node's own fetch, from the piece's URLs in turn, only from the allow-list (a
 * redirect elsewhere is refused), keeping each archive in `cache` for the next gather and the tests.
 * With `fresh`, a kept archive is never used.
 */
export function buildMachineDownload(cache: string | null, fresh: boolean, allow = RUNTIME_HOSTS): Download {
  return async (piece, file, onBytes) => {
    const kept = cache ? path.join(cache, piece.name + '.zip') : null;
    if (kept && !fresh && piece.sha256 && fs.existsSync(kept) && fs.statSync(kept).size === piece.size && (await fileSha256(kept)) === piece.sha256) {
      fs.copyFileSync(kept, file);
      onBytes(piece.size);
      return;
    }
    let last: unknown = null;
    for (const url of piece.urls) {
      try {
        if (!allow.some((a) => url.startsWith(a))) throw new Error(url + ' is not an official address for the runtime.');
        const res = await fetch(url, { redirect: 'follow' });
        if (res.url && !allow.some((a) => res.url.startsWith(a))) throw new Error(url + ' sent the download on to ' + res.url + ', which is not on the allow-list.');
        if (!res.ok || !res.body) throw new Error(url + ' answered ' + res.status + '.');
        await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), counter(onBytes), fs.createWriteStream(file));
        if (kept) {
          fs.mkdirSync(path.dirname(kept), { recursive: true });
          fs.copyFileSync(file, kept);
        }
        return;
      } catch (e) {
        last = e;
        fs.rmSync(file, { force: true });
      }
    }
    throw last instanceof Error ? last : new Error('Could not download ' + piece.name + '.');
  };
}

/** Prints a piece's progress every tenth of the way. */
function logger(): (piece: RuntimePiece, bytes: number) => void {
  const shown = new Map<string, number>();
  return (piece, bytes) => {
    const size = piece.size || 1;
    const tenth = piece.size ? Math.floor((bytes / size) * 10) : Math.floor(bytes / (20 * 1024 * 1024));
    if (shown.get(piece.name) === tenth) return;
    shown.set(piece.name, tenth);
    console.log('          ' + piece.name + ': ' + Math.round(bytes / 1024 / 1024) + (piece.size ? ' of ' + Math.round(piece.size / 1024 / 1024) : '') + ' MB');
  };
}

// ---------------------------------------------------------------- the manifest

function hashes(): string {
  return filesUnder(OUT)
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

// ---------------------------------------------------------------- gathering

async function gather(fresh: boolean, pin: boolean): Promise<void> {
  const log = logger();
  if (fresh) {
    for (const name of ['node', 'ms-playwright', '.studio', 'MANIFEST.sha256']) fs.rmSync(path.join(OUT, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  fs.mkdirSync(OUT, { recursive: true });
  const download = buildMachineDownload(ARCHIVES, fresh);

  if (pin) {
    const pieces = officialPieces();
    const measured = new Map<string, Measured>();
    for (const piece of pieces) {
      console.log((piece.kind === 'node' ? 'node      ' : 'browser   ') + piece.name + ' from ' + piece.urls[0]);
      measured.set(piece.name, await installPiece(OUT, piece, download, { pin: true, onBytes: (b) => log(piece, b) }));
    }
    // What was pinned before and is not now goes.
    const browsers = path.join(OUT, 'ms-playwright');
    for (const name of fs.readdirSync(browsers)) if (!pieces.some((p) => p.name === name)) fs.rmSync(path.join(browsers, name), { recursive: true, force: true });
    const exe = path.join(OUT, 'node', 'node.exe');
    requireNodeSignature(exe);
    const pinned = pieces.map((p) => ({ ...p, ...measured.get(p.name)! }));
    const sources = {
      _comment:
        'Where a standard installer\'s first start downloads Node and the browsers from, and what each must be (scripts/runtime.ts, src/runtime-install.ts). Written by `npm run runtime -- --fresh --pin`; commit it with runtime-pins.json.',
      allow: RUNTIME_HOSTS,
      pieces: pinned,
    };
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2) + '\n');
    const pins: Pins = {
      'node.exe': execFileSync(exe, ['--version'], { encoding: 'utf-8' }).trim() + ' ' + sha256(exe),
      ...Object.fromEntries(pinned.map((p) => [p.name, p.tree])),
    };
    fs.writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n');
    console.log('pins      ' + PINS + ' and ' + SOURCES_FILE + ' (commit them)');
  } else {
    const { pieces } = checkedRuntimeSources();
    const result = await ensureRuntime(OUT, pieces, download, { onProgress: (p) => p.phase === 'download' && log(p.piece, p.bytes) });
    for (const p of pieces) console.log((p.kind === 'node' ? 'node      ' : 'browser   ') + p.name + (result.installed.includes(p.name) ? ' (installed, checked)' : ' (already there)'));
  }

  fs.rmSync(path.join(OUT, '.studio', 'partial'), { recursive: true, force: true });
  checkNode();
  const dir = path.join(OUT, 'ms-playwright');
  checkPins(dir, fs.readdirSync(dir));
  fs.writeFileSync(MANIFEST, hashes());
  console.log('manifest  ' + MANIFEST);
}

if (require.main === module) {
  const fresh = process.argv.includes('--fresh');
  const pin = process.argv.includes('--pin');
  if (pin && !fresh) {
    console.error('--pin records what it downloads, never what is in a cache: use --fresh --pin.');
    process.exit(1);
  }
  gather(fresh, pin).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
