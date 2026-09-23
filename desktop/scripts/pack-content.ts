/**
 * Packs the built course (Data/Content/, from `npm run build:content`) into the one encrypted file
 * the app reads: content.pack. See backend/src/content.ts for the format.
 *
 * Every build gets a new key. The lesson text is watermarked with the licence ID the build is for
 * (see src/watermark.ts) before it is encrypted. course-plan.json is not packed: it holds only the
 * module names and colors, and the page bundles it.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { markMarkdown } from '../src/watermark';

const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');
const MARKED = new Set(['markdown', 'callout', 'at-a-glance', 'recap', 'reference']);

type Block = { type: string; text: string };
type Day = { parts: { blocks: Block[]; problems?: { statement: string }[] }[] };

function files(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

/** Writes the pack, and returns the key as two halves that XOR to it. */
export function packContent(out: string, mark: string): { key: [string, string]; files: number; marks: number } {
  const entries: Record<string, string> = {};
  let marks = 0;
  for (const rel of files(CONTENT)) {
    if (!rel.endsWith('.json') || rel === 'course-plan.json') continue;
    let text = fs.readFileSync(path.join(CONTENT, ...rel.split('/')), 'utf-8');
    if (rel.startsWith('weeks/')) {
      const day = JSON.parse(text) as Day;
      for (const part of day.parts) {
        for (const block of part.blocks) {
          if (!MARKED.has(block.type) || typeof block.text !== 'string') continue;
          const marked = markMarkdown(block.text, mark);
          if (marked !== block.text) marks++;
          block.text = marked;
        }
        for (const problem of part.problems ?? []) {
          const marked = markMarkdown(problem.statement, mark);
          if (marked !== problem.statement) marks++;
          problem.statement = marked;
        }
      }
      text = JSON.stringify(day);
    } else {
      text = JSON.stringify(JSON.parse(text));
    }
    entries[rel] = text;
  }
  if (!entries['course-index.json']) throw new Error('No course in Data/Content/. Run `npm run build:content` first.');

  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(JSON.stringify(entries), { level: 9 })), cipher.final()]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([Buffer.from('SPK1', 'latin1'), iv, cipher.getAuthTag(), body]));

  const a = crypto.randomBytes(32);
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) b[i] = key[i] ^ a[i];
  return { key: [a.toString('hex'), b.toString('hex')], files: Object.keys(entries).length, marks };
}
