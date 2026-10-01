/**
 * Node and the browsers the learner's code runs on ("the runtime"), installed from their official
 * archives: Node from nodejs.org, the browsers from where Playwright's own `playwright install` gets
 * them (Chrome for Testing for Chromium, Playwright's CDN for the others). Node only, no Electron:
 * the launcher (main.ts), the build machine (scripts/runtime.ts) and the tests use it as it is, so
 * a copy downloaded on a learner's first start and the copy a full installer carries are made by the
 * same code, and are the same files.
 *
 *   <root>/node/                     node.exe, LICENSE, npm-version.txt
 *   <root>/ms-playwright/<name>/     each browser, as Playwright lays it out (PLAYWRIGHT_BROWSERS_PATH)
 *   <root>/.studio/<name>.verified   written once a piece has been checked
 *   <root>/.studio/partial/          downloads and extractions under way (cleared at every start)
 *
 * Where a piece comes from is not what makes it trusted: its hashes are. Every launcher has built
 * into it, for each piece, the archive's size and SHA-256 and the hash of the folder it unpacks to
 * (scripts/runtime.ts pins them, runtime-sources.json). A piece is installed only in this order:
 * download, check the archive's hash (before anything is unpacked), unpack it with Windows' own
 * tar.exe, check the folder's hash, move it into place, mark it. A piece that fails a check is
 * deleted; nothing half-made is ever used.
 */
import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { systemExe } from '../../backend/src/system-exe';

export type RuntimePiece = {
  /** The folder it fills: 'node', or the browser's folder under ms-playwright ('chromium-1243'). */
  name: string;
  kind: 'node' | 'browser';
  /** Where its archive is downloaded from, tried in order. */
  urls: string[];
  /** The archive's size in bytes, and its SHA-256. */
  size: number;
  sha256: string;
  /** The hash of the folder it unpacks to (treeHash). */
  tree: string;
  /** The folder's size once unpacked, in bytes: for the check that the disk has room. */
  unpacked: number;
  /** A file every complete copy has, relative to its folder: what each start looks for. */
  exe: string;
  /** Node only: the archive's top folder (node-v24.21.0-win-x64), whose node.exe and LICENSE are taken. */
  archiveRoot?: string;
};

/** Why a piece could not be installed. Network errors come from the download function as they are. */
export class RuntimeError extends Error {
  constructor(
    readonly code: 'space' | 'checksum' | 'extract',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Downloads a piece's archive into `file`, calling onBytes with the bytes received so far. It may
 * try the piece's URLs in turn; whatever it writes is checked afterwards.
 */
export type Download = (piece: RuntimePiece, file: string, onBytes: (bytes: number) => void) => Promise<void>;

export type Progress = {
  piece: RuntimePiece;
  phase: 'download' | 'unpack';
  /** Bytes of this piece downloaded so far. */
  bytes: number;
  /** Bytes downloaded so far, of all the pieces being installed, and their total. */
  done: number;
  total: number;
};

/** Playwright's own markers: a browser folder without them is one Playwright would install again. */
const BROWSER_MARKERS = ['INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED'];
const STATE = '.studio';

export const pieceDir = (root: string, piece: Pick<RuntimePiece, 'name' | 'kind'>): string =>
  piece.kind === 'node' ? path.join(root, 'node') : path.join(root, 'ms-playwright', piece.name);
const markerFile = (root: string, name: string): string => path.join(root, STATE, name + '.verified');
const partialDir = (root: string): string => path.join(root, STATE, 'partial');

// ---------------------------------------------------------------- hashes

/** Every file under a folder, relative, with forward slashes. */
export function filesUnder(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

/** Lines in the order of their files' sorted paths: the order runtime-pins.json has always used. */
const treeOf = (lines: string[]): string => crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
const line = (hash: string, rel: string): string => hash + '  ' + rel;

/** The hash of a whole folder: every file's path and SHA-256. Synchronous, for the build machine. */
export function treeHashSync(dir: string): string {
  const files = filesUnder(dir).sort();
  return treeOf(files.map((f) => line(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, ...f.split('/')))).digest('hex'), f)));
}

/** The SHA-256 of a file, read as a stream: a large file never blocks the launcher's window. */
export function fileSha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** treeHashSync's hash, read as streams. */
export async function treeHash(dir: string): Promise<string> {
  const files = filesUnder(dir).sort();
  const lines: string[] = [];
  for (const f of files) lines.push(line(await fileSha256(path.join(dir, ...f.split('/'))), f));
  return treeOf(lines);
}

/** The bytes a folder holds. */
export const folderSize = (dir: string): number => filesUnder(dir).reduce((sum, f) => sum + fs.statSync(path.join(dir, ...f.split('/'))).size, 0);

// ---------------------------------------------------------------- unpacking

/** Windows' own tar.exe (bsdtar), which reads zip archives too, and refuses paths that climb out. */
function tar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(systemExe('tar.exe'), args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new RuntimeError('extract', 'The downloaded archive could not be extracted: ' + (String(stderr).trim().split('\n')[0] || error.message)));
      else resolve();
    });
  });
}

/** Unpacks a piece's archive into `work` (made fresh), laid out as the piece's folder. */
export async function unpackPiece(piece: RuntimePiece, archive: string, work: string): Promise<void> {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(work, { recursive: true });
  if (piece.kind === 'browser') {
    await tar(['-xf', archive, '-C', work]);
    for (const marker of BROWSER_MARKERS) fs.writeFileSync(path.join(work, marker), '');
    return;
  }
  // Node: its program and licence, and only the version of its npm (npm itself is not shipped: no
  // command the studio runs needs it, and `npm --version` answers from this file).
  const top = piece.archiveRoot;
  if (!top || !/^node-v\d+\.\d+\.\d+-win-x64$/.test(top)) throw new RuntimeError('extract', 'The Node.js archive does not have the expected name.');
  const tmp = work + '.zip-contents';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await tar(['-xf', archive, '-C', tmp, top + '/node.exe', top + '/LICENSE', top + '/node_modules/npm/package.json']);
    const npm = (JSON.parse(fs.readFileSync(path.join(tmp, top, 'node_modules', 'npm', 'package.json'), 'utf-8')) as { version?: string }).version;
    if (!npm || !/^\d+\.\d+\.\d+$/.test(npm)) throw new RuntimeError('extract', 'The Node.js archive does not contain the expected npm version.');
    fs.renameSync(path.join(tmp, top, 'node.exe'), path.join(work, 'node.exe'));
    fs.renameSync(path.join(tmp, top, 'LICENSE'), path.join(work, 'LICENSE'));
    fs.writeFileSync(path.join(work, 'npm-version.txt'), npm + '\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

// ---------------------------------------------------------------- installing

/** Whether a piece is in place and was checked: the quick look each start takes. */
export function isInstalled(root: string, piece: RuntimePiece): boolean {
  try {
    const marker = JSON.parse(fs.readFileSync(markerFile(root, piece.name), 'utf-8')) as { tree?: string };
    return marker.tree === piece.tree && fs.existsSync(path.join(pieceDir(root, piece), ...piece.exe.split('/')));
  } catch {
    return false;
  }
}

/** What a piece turned out to be: what scripts/runtime.ts pins when it records a new one. */
export type Measured = { sha256: string; size: number; tree: string; unpacked: number };

/**
 * Downloads, checks, unpacks, checks again and puts one piece in place. With `pin`, the piece's
 * hashes are not known yet (the build machine is recording them): they are measured instead of
 * checked, and returned.
 */
export async function installPiece(
  root: string,
  piece: RuntimePiece,
  download: Download,
  opts: { onBytes?: (bytes: number) => void; onUnpack?: () => void; pin?: boolean } = {},
): Promise<Measured> {
  const partial = partialDir(root);
  fs.mkdirSync(partial, { recursive: true });
  const archive = path.join(partial, piece.name + '.zip');
  const work = path.join(partial, piece.name);
  try {
    fs.rmSync(archive, { force: true });
    await download(piece, archive, opts.onBytes ?? (() => {}));
    const size = fs.statSync(archive).size;
    const sha256 = await fileSha256(archive);
    if (!opts.pin && (size !== piece.size || sha256 !== piece.sha256)) {
      throw new RuntimeError('checksum', 'The file downloaded for ' + piece.name + ' does not match the official release this application was built with.');
    }
    opts.onUnpack?.();
    await unpackPiece(piece, archive, work);
    fs.rmSync(archive, { force: true });
    const tree = await treeHash(work);
    if (!opts.pin && tree !== piece.tree) {
      throw new RuntimeError('checksum', 'The files extracted for ' + piece.name + ' do not match the official release this application was built with.');
    }
    const unpacked = folderSize(work);
    const final = pieceDir(root, piece);
    fs.rmSync(markerFile(root, piece.name), { force: true });
    fs.rmSync(final, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.mkdirSync(path.dirname(final), { recursive: true });
    fs.renameSync(work, final);
    fs.mkdirSync(path.join(root, STATE), { recursive: true });
    fs.writeFileSync(markerFile(root, piece.name), JSON.stringify({ tree, at: new Date().toISOString() }) + '\n');
    return { sha256, size, tree, unpacked };
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** Free bytes on the drive a folder is on. */
function freeBytesOf(dir: string): number {
  const s = fs.statfsSync(dir);
  return s.bavail * s.bsize;
}

const MB = 1024 * 1024;

/**
 * Makes the runtime in `root` what the pieces say: removes what an earlier version left that is no
 * longer pinned, then installs every piece that is missing or unchecked, one at a time (a piece
 * already installed is kept when a later one fails, so Retry carries on from there).
 */
export async function ensureRuntime(
  root: string,
  pieces: RuntimePiece[],
  download: Download,
  opts: { onProgress?: (p: Progress) => void; freeBytes?: (dir: string) => number } = {},
): Promise<{ installed: string[] }> {
  fs.mkdirSync(root, { recursive: true });
  fs.rmSync(partialDir(root), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  // What an earlier version pinned and this one does not: its old browsers, and their markers.
  const browsers = path.join(root, 'ms-playwright');
  const wanted = new Set(pieces.filter((p) => p.kind === 'browser').map((p) => p.name));
  if (fs.existsSync(browsers)) {
    for (const name of fs.readdirSync(browsers)) {
      if (!wanted.has(name) && /^[a-z0-9_]+-\d+$/.test(name)) fs.rmSync(path.join(browsers, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  const state = path.join(root, STATE);
  if (fs.existsSync(state)) {
    const names = new Set(pieces.map((p) => p.name + '.verified'));
    for (const name of fs.readdirSync(state)) if (name.endsWith('.verified') && !names.has(name)) fs.rmSync(path.join(state, name), { force: true });
  }

  const missing = pieces.filter((p) => !isInstalled(root, p));
  if (!missing.length) return { installed: [] };

  // Room for every missing piece unpacked, and the largest archive beside it while it unpacks.
  const need = missing.reduce((sum, p) => sum + p.unpacked, 0) + Math.max(...missing.map((p) => p.size)) + 256 * MB;
  const free = (opts.freeBytes ?? freeBytesOf)(root);
  if (free < need) {
    throw new RuntimeError(
      'space',
      'Installing Node.js and the browsers requires ' + Math.ceil(need / MB) + ' MB of free disk space on the drive containing ' + root + '; ' +
        Math.floor(free / MB) + ' MB is available.',
    );
  }

  const total = missing.reduce((sum, p) => sum + p.size, 0);
  let done = 0;
  for (const piece of missing) {
    const before = done;
    await installPiece(root, piece, download, {
      onBytes: (bytes) => opts.onProgress?.({ piece, phase: 'download', bytes, done: before + Math.min(bytes, piece.size), total }),
      onUnpack: () => opts.onProgress?.({ piece, phase: 'unpack', bytes: piece.size, done: before + piece.size, total }),
    });
    done = before + piece.size;
  }
  return { installed: missing.map((p) => p.name) };
}
