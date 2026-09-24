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
 *
 * A build made for one customer is also sealed: the two halves XOR to the key XORed with a hash of
 * the seal in that customer's licence (desktop/src/licence.ts). Their copy of the app therefore
 * cannot decrypt its course, even by someone who digs the halves out of it, without their licence
 * file, which is sent apart from the app.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { CONTENT, CONTENT_PACK } from './config';

declare const __STUDIO_PACK_KEY__: [string, string] | undefined;
declare const __STUDIO_PACK_SEALED__: boolean | undefined;

let pack: Map<string, string> | null = null;
let seal: string | null = null;
let servingMark: string | null = null;
/** Changes with every licence the app runs under, so no cache keeps content across licences. */
let generation = 1;

/** What the key of a sealed pack is XORed with: a hash of the licence's seal. */
export const sealMask = (s: string): Buffer => crypto.createHash('sha256').update('learning-studio:content:' + s).digest();

/**
 * The licence the app runs under (desktop/src/main.ts): its seal, for a sealed pack, and the ID to
 * watermark every day with as it is served (routes.ts).
 */
export function useLicence(opts: { seal: string | null; mark: string | null }): void {
  seal = opts.seal;
  servingMark = opts.mark;
  pack = null;
  generation++;
}

/** The licence ID the served lessons are marked with, when the app runs under a licence. */
export const serveMark = (): string | null => servingMark;

function openPack(file: string): Map<string, string> {
  if (pack) return pack;
  if (typeof __STUDIO_PACK_KEY__ === 'undefined') throw new Error('This build has no content key.');
  const [a, b] = __STUDIO_PACK_KEY__.map((h) => Buffer.from(h, 'hex'));
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) key[i] = a[i] ^ b[i];
  if (typeof __STUDIO_PACK_SEALED__ !== 'undefined' && __STUDIO_PACK_SEALED__) {
    if (!seal) throw new Error('This copy opens only with the licence it was made for.');
    const mask = sealMask(seal);
    for (let i = 0; i < 32; i++) key[i] ^= mask[i];
  }
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
 * null when there is no such file. A pack never changes while the app runs, but the licence it is
 * read under can, and a new one makes every cached file stale.
 */
export function contentStamp(rel: string): number | null {
  if (CONTENT_PACK) return openPack(CONTENT_PACK).has(rel) ? generation : null;
  const file = path.join(CONTENT, ...rel.split('/'));
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : null;
}
