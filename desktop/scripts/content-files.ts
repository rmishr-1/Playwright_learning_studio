/**
 * The course as it is published (publish.ts): the built files of Data/Content/ (from
 * `npm run build:content`), by their path there, minified. The publisher packs them into one
 * container and encrypts it (src/release-format.ts); the launcher hands them to the studio in memory.
 *
 * One course for every licence, so nothing is watermarked here: the studio marks every day with the
 * licence that opened it as it serves it (backend/src/routes.ts, shared/watermark.ts).
 *
 * A locked day (or a day of a locked week) is not published at all: the studio only answers that it
 * is locked, from the index, so its lessons need not be there to be kept from the learner. Its
 * starting files are left out of workspaces.json too.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');

function files(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

export function contentFiles(dir = CONTENT): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'course-index.json'), 'utf-8')) as {
    weeks: { week: number; locked?: boolean; days: { day: number; number?: number; locked?: boolean }[] }[];
  };
  // The same rule the app keeps (store.ts isLocked): the week, the index's day, or the day's own file.
  const dayFile = (w: number, d: number): string => 'weeks/week-' + w + '/day-' + d + '.json';
  const ownLock = (rel: string): boolean => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf-8')) as { locked?: boolean }).locked === true;
    } catch {
      return false;
    }
  };
  const lockedDays = index.weeks.flatMap((w) =>
    w.days.filter((d) => w.locked || d.locked || ownLock(dayFile(w.week, d.day))).map((d) => ({ rel: dayFile(w.week, d.day), number: d.number })),
  );
  const locked = new Set(lockedDays.map((d) => d.rel));
  const lockedNumbers = new Set(lockedDays.map((d) => d.number).filter((n): n is number => typeof n === 'number'));
  for (const rel of files(dir)) {
    if (!rel.endsWith('.json') || locked.has(rel)) continue;
    let text = fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf-8');
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
    } else {
      text = JSON.stringify(JSON.parse(text));
    }
    out.set(rel, Buffer.from(text, 'utf-8'));
  }
  if (!out.has('course-index.json')) throw new Error('No course in Data/Content/. Run `npm run build:content` first.');
  if (!out.has('course-plan.json')) throw new Error('Data/Content/ has no course-plan.json. Run `npm run build:content` first.');
  return out;
}
