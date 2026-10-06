/**
 * Checks, at every start, the program files that run outside app.asar: Electron checks app.asar
 * itself (the EnableEmbeddedAsarIntegrityValidation fuse), but not these.
 *
 *   - The packages the learner's code runs on (app.asar.unpacked: Playwright, TypeScript). app.asar's
 *     header already lists every unpacked file with its size and SHA-256, and the fuse checks that
 *     header against the hash built into the program, so it is the list they are checked against.
 *     Every file listed must be there unchanged, and nothing else may be.
 *   - Node and the browsers (runtime-files.json, written into app.asar from desktop/runtime by
 *     scripts/build.ts). Hashing all of them would take seconds at every start (about 1 GB), so
 *     this is the quick check: every file there at its built size, every program (.exe) up to
 *     HASHED_MAX by its SHA-256, and no file added beside them (a DLL placed beside a program is
 *     loaded by it), apart from the logs Chromium may write. A piece is checked in full by its hash
 *     when it is installed (runtime-install.ts).
 *
 * Each check returns the first file that is wrong, relative to the folder checked, or null.
 */
import * as crypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';

/** The fs to read with: in the app, Electron's original-fs, which reads app.asar as the file it is. */
type Fs = Pick<typeof nodeFs, 'openSync' | 'readSync' | 'closeSync' | 'readdirSync' | 'statSync' | 'createReadStream'>;

/** One piece of the runtime: its folder, relative to the runtime's root, and its files: [size, SHA-256 for a program]. */
export type RuntimeFiles = Record<string, { dir: string; files: Record<string, [number] | [number, string]> }>;

/**
 * The largest program hashed at every start. node.exe (about 90 MB) is under it; Chromium's headless
 * shell (about 200 MB, more than half of all the programs together) is over it, and checked by its
 * size only, as the libraries are.
 */
const HASHED_MAX = 100 * 1024 * 1024;

/** Files a browser may write into its own folder while it runs. */
const MAY_APPEAR = /\.log$/i;

function sha256(fs: Fs, file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Every file under a folder, relative, with forward slashes. */
function filesUnder(fs: Fs, dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(fs, path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

/** Runs `check` on every item, a few at a time; the first non-null answer, in the items' order. */
async function firstWrong<T>(items: T[], check: (item: T) => Promise<string | null>): Promise<string | null> {
  const answers: (string | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      answers[i] = await check(items[i]);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return answers.find((a) => a !== null) ?? null;
}

type AsarNode = { files?: Record<string, AsarNode>; unpacked?: boolean; size?: number; integrity?: { algorithm: string; hash: string } };

/** app.asar's header: a pickled size, then a pickled JSON string (the format @electron/asar writes). */
export function readAsarHeader(fs: Fs, asarFile: string): AsarNode {
  const fd = fs.openSync(asarFile, 'r');
  try {
    const sizes = Buffer.alloc(8);
    fs.readSync(fd, sizes, 0, 8, 0);
    const headerSize = sizes.readUInt32LE(4);
    const header = Buffer.alloc(headerSize);
    fs.readSync(fd, header, 0, headerSize, 8);
    const length = header.readUInt32LE(4);
    return JSON.parse(header.subarray(8, 8 + length).toString('utf-8')) as AsarNode;
  } finally {
    fs.closeSync(fd);
  }
}

/** The files app.asar's header says are unpacked, by their path relative to app.asar.unpacked. */
function unpackedFiles(header: AsarNode): Map<string, { size: number; hash: string | null }> {
  const found = new Map<string, { size: number; hash: string | null }>();
  const walk = (node: AsarNode, prefix: string): void => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      if (child.files) walk(child, prefix + name + '/');
      else if (child.unpacked) {
        found.set(prefix + name, { size: child.size ?? -1, hash: child.integrity?.algorithm === 'SHA256' ? child.integrity.hash : null });
      }
    }
  };
  walk(header, '');
  return found;
}

/** Checks app.asar.unpacked, beside `asarFile`, against app.asar's header. */
export async function checkUnpacked(fs: Fs, asarFile: string): Promise<string | null> {
  const listed = unpackedFiles(readAsarHeader(fs, asarFile));
  const dir = asarFile + '.unpacked';
  let present: string[];
  try {
    present = filesUnder(fs, dir);
  } catch {
    present = [];
  }
  const extra = present.find((f) => !listed.has(f));
  if (extra) return extra;
  return firstWrong([...listed], async ([rel, want]) => {
    const file = path.join(dir, ...rel.split('/'));
    try {
      if (want.hash === null || fs.statSync(file).size !== want.size) return rel;
      return (await sha256(fs, file)) === want.hash ? null : rel;
    } catch {
      return rel;
    }
  });
}

/** Checks one piece of the runtime (its folder under `root`) against its entry in runtime-files.json. */
export async function checkRuntimePiece(fs: Fs, root: string, piece: RuntimeFiles[string]): Promise<string | null> {
  const dir = path.join(root, ...piece.dir.split('/'));
  let present: string[];
  try {
    present = filesUnder(fs, dir);
  } catch {
    return piece.dir;
  }
  const extra = present.find((f) => !(f in piece.files) && !MAY_APPEAR.test(f));
  if (extra) return piece.dir + '/' + extra;
  return firstWrong(Object.entries(piece.files), async ([rel, [size, hash]]) => {
    const file = path.join(dir, ...rel.split('/'));
    try {
      if (fs.statSync(file).size !== size) return piece.dir + '/' + rel;
      if (hash && (await sha256(fs, file)) !== hash) return piece.dir + '/' + rel;
      return null;
    } catch {
      return piece.dir + '/' + rel;
    }
  });
}

/**
 * runtime-files.json, from desktop/runtime's manifest (scripts/runtime.ts: "<sha256>  <path>" for
 * every file): each piece's files with their sizes, and the SHA-256 of each program.
 */
export function runtimeFilesFrom(runtimeDir: string, manifest: string): RuntimeFiles {
  const pieces: RuntimeFiles = {};
  for (const line of manifest.split('\n')) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (!m) continue;
    const [, hash, rel] = m;
    const parts = rel.split('/');
    let name: string;
    let dir: string;
    if (parts[0] === 'node') [name, dir] = ['node', 'node'];
    else if (parts[0] === 'ms-playwright' && parts.length > 2) [name, dir] = [parts[1], 'ms-playwright/' + parts[1]];
    else continue;
    const inPiece = rel.slice(dir.length + 1);
    const size = nodeFs.statSync(path.join(runtimeDir, ...parts)).size;
    (pieces[name] ??= { dir, files: {} }).files[inPiece] = /\.exe$/i.test(inPiece) && size <= HASHED_MAX ? [size, hash] : [size];
  }
  return pieces;
}
