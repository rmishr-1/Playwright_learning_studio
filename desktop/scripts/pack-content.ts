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
import { markDay } from '../../shared/watermark';
import { sealMask } from '../../backend/src/content';

const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');

type Block = { type: string; text: string };
type Day = { parts: { blocks: Block[]; problems?: { statement: string }[] }[] };

function files(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

/**
 * Writes the pack, and returns the key as two halves that XOR to it; with a seal (a build for one
 * customer), to the key XORed with the seal's mask, so the licence is needed to open it.
 */
export function packContent(out: string, mark: string, seal: string | null = null): { key: [string, string]; files: number; marks: number } {
  const entries: Record<string, string> = {};
  let marks = 0;
  // A locked day (or a day of a locked week) is not shipped at all: the app only answers that it
  // is locked, from the index, so its lessons need not be in the pack to be kept from the learner.
  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'course-index.json'), 'utf-8')) as {
    weeks: { week: number; locked?: boolean; days: { day: number; locked?: boolean }[] }[];
  };
  // The same rule the app keeps (store.ts isLocked): the week, the index's day, or the day's own file.
  const dayFile = (w: number, d: number): string => 'weeks/week-' + w + '/day-' + d + '.json';
  const ownLock = (rel: string): boolean => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(CONTENT, ...rel.split('/')), 'utf-8')) as { locked?: boolean }).locked === true;
    } catch {
      return false;
    }
  };
  const lockedDays = index.weeks.flatMap((w) =>
    w.days.filter((d) => w.locked || d.locked || ownLock(dayFile(w.week, d.day))).map((d) => ({ rel: dayFile(w.week, d.day), number: (d as { number?: number }).number })),
  );
  const locked = new Set(lockedDays.map((d) => d.rel));
  const lockedNumbers = new Set(lockedDays.map((d) => d.number).filter((n): n is number => typeof n === 'number'));
  for (const rel of files(CONTENT)) {
    if (!rel.endsWith('.json') || rel === 'course-plan.json') continue;
    if (locked.has(rel)) continue;
    let text = fs.readFileSync(path.join(CONTENT, ...rel.split('/')), 'utf-8');
    if (rel === 'workspaces.json' && lockedNumbers.size) {
      // A locked day's starting files stay out too (the same names the app filters by).
      const seeds = JSON.parse(text) as { workspaces: Record<string, { files: Record<string, string> }> };
      for (const ws of Object.values(seeds.workspaces)) {
        for (const name of Object.keys(ws.files)) {
          const days = [...name.matchAll(/(?:^|[\/._-])day[_-]?0*(\d+)(?!\d)/gi)].map((m) => Number(m[1]));
          if (days.some((d) => lockedNumbers.has(d))) delete ws.files[name];
        }
      }
      text = JSON.stringify(seeds);
    } else if (rel.startsWith('weeks/')) {
      const marked = markDay(JSON.parse(text) as Day, mark);
      marks += marked.marks;
      text = JSON.stringify(marked.day);
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
  const mask = seal ? sealMask(seal) : Buffer.alloc(32);
  for (let i = 0; i < 32; i++) b[i] = key[i] ^ a[i] ^ mask[i];
  return { key: [a.toString('hex'), b.toString('hex')], files: Object.keys(entries).length, marks };
}
