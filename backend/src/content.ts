/**
 * The course content, read from one of two places:
 *
 *   - Data/Content/, the plain files `npm run build:content` writes (development)
 *   - the content pack the desktop app ships (STUDIO_CONTENT_PACK), encrypted, so that the course
 *     is not lying on the learner's disk as plain files
 *
 * The pack is 'SPK1', a 12-byte IV, the 16-byte GCM tag, then AES-256-GCM over the gzipped JSON
 * of { "course-index.json": text, "weeks/week-1/day-1.json": text, ... }. It is decrypted in
 * memory only. The desktop build (desktop/scripts/pack-content.ts) makes a new key for every build
 * and puts it into the bundled backend as two halves XORed together; in development there is no
 * key and no pack.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { CONTENT, CONTENT_PACK } from './config';

declare const __STUDIO_PACK_KEY__: [string, string] | undefined;

let pack: Map<string, string> | null = null;

function openPack(file: string): Map<string, string> {
  if (pack) return pack;
  if (typeof __STUDIO_PACK_KEY__ === 'undefined') throw new Error('This build has no content key.');
  const [a, b] = __STUDIO_PACK_KEY__.map((h) => Buffer.from(h, 'hex'));
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) key[i] = a[i] ^ b[i];
  const raw = fs.readFileSync(file);
  if (raw.subarray(0, 4).toString('latin1') !== 'SPK1') throw new Error('The content pack is damaged.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(4, 16));
  decipher.setAuthTag(raw.subarray(16, 32));
  const plain = zlib.gunzipSync(Buffer.concat([decipher.update(raw.subarray(32)), decipher.final()]));
  pack = new Map(Object.entries(JSON.parse(plain.toString('utf-8')) as Record<string, string>));
  return pack;
}

/** A content file's text, by its path under Data/Content/ ('weeks/week-1/day-1.json'). null when there is none. */
export function readContent(rel: string): string | null {
  if (CONTENT_PACK) return openPack(CONTENT_PACK).get(rel) ?? null;
  const file = path.join(CONTENT, ...rel.split('/'));
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

/**
 * When a content file last changed, so a cache can tell an edited file from the one it holds.
 * null when there is no such file. A pack never changes while the app runs.
 */
export function contentStamp(rel: string): number | null {
  if (CONTENT_PACK) return openPack(CONTENT_PACK).has(rel) ? 1 : null;
  const file = path.join(CONTENT, ...rel.split('/'));
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : null;
}
