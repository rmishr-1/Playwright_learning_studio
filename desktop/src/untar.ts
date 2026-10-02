/**
 * Unpacks an npm package tarball (a gzipped tar whose files are all under package/) into a folder,
 * in-process: no tar.exe, no npm, no install script. Regular files and folders only; a link, a device
 * or any path that would land outside the folder stops it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const LIMIT = 256 * 1024 * 1024;

function field(block: Buffer, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString('utf-8');
}

/** The files of a tarball, by their path under package/. */
export function readNpmTarball(tgz: Buffer): Map<string, Buffer> {
  const tar = zlib.gunzipSync(tgz, { maxOutputLength: LIMIT });
  const files = new Map<string, Buffer>();
  let at = 0;
  let longName: string | null = null;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = field(header, 345, 155);
    let name = longName ?? (prefix ? prefix + '/' : '') + field(header, 0, 100);
    longName = null;
    const body = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (!Number.isFinite(size) || size < 0 || at > tar.length + 512) throw new Error('The package is damaged.');
    if (type === 'x') {
      // A pax header: a long path for the next entry.
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf-8'));
      if (m) longName = m[1];
      continue;
    }
    if (type === 'g' || type === '5') continue;
    if (type !== '0' && type !== '7') throw new Error('The package holds something that is not a file: ' + name);
    name = name.replace(/\\/g, '/');
    if (!name.startsWith('package/')) throw new Error('The package has a file outside package/: ' + name);
    const rel = name.slice('package/'.length);
    if (!rel || rel.startsWith('/') || /^[a-z]:/i.test(rel) || rel.split('/').some((s) => s === '..' || s === '.' || s === '')) {
      throw new Error('The package has a file with an unsafe path: ' + name);
    }
    files.set(rel, Buffer.from(body));
  }
  return files;
}

/** Writes a tarball's files into dir (made fresh: whatever was there goes first). */
export function unpackNpmTarball(tgz: Buffer, dir: string): number {
  const files = readNpmTarball(tgz);
  const root = path.resolve(dir);
  const temp = root + '.unpacking';
  fs.rmSync(temp, { recursive: true, force: true });
  for (const [rel, data] of files) {
    const out = path.resolve(temp, ...rel.split('/'));
    if (!out.startsWith(temp + path.sep)) throw new Error('The package has a file with an unsafe path: ' + rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.renameSync(temp, root);
  return files.size;
}
