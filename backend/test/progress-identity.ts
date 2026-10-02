/**
 * Progress keeps its meaning when the course changes: records follow their days, changed days are
 * tagged until opened, attempts and saved code stay with their exercises, and the record survives
 * keys it does not know.
 *
 *   npm run test:progress
 *
 * Runs on a copy of the course in a folder of its own, with a progress record and workspaces of its
 * own, so it never touches the learner's.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-progress-test-'));
const contentDir = path.join(work, 'Content');
fs.cpSync(path.join(ROOT, 'Data', 'Content'), contentDir, { recursive: true });
process.env.STUDIO_DATA_DIR = path.join(work, 'Data');
process.env.STUDIO_CONTENT_DIR = contentDir;
process.env.STUDIO_WORKSPACE_ROOT = path.join(work, 'Data', 'Workspace');
delete process.env.STUDIO_CONTENT_PACK;

// Loaded after the variables are set: config.ts reads them as it loads.
/* eslint-disable @typescript-eslint/no-require-imports */
const store = require('../src/store') as typeof import('../src/store');
const { reconcile } = require('../src/reconcile') as typeof import('../src/reconcile');
const workspace = require('../src/terminal/workspace') as typeof import('../src/terminal/workspace');
const { checkLedger, EMPTY_LEDGER } = require('../../scripts/lib/identity-ledger') as typeof import('../../scripts/lib/identity-ledger');
const { PROGRESS_FILE } = require('../src/config') as typeof import('../src/config');
/* eslint-enable @typescript-eslint/no-require-imports */
import type { ContentSnapshot, SnapshotDay } from '../src/reconcile';
import type { Progress } from '../../shared/contracts/progress';
import type { CourseDay } from '../../shared/contracts/course_day';

let failures = 0;
let passes = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (ok) passes++;
  else failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (ok || !detail ? '' : '\n      ' + detail));
}

// ---------------------------------------------------------------- reconcile, on its own

const ts = '2026-09-01T00:00:00Z';
const day = (id: string, week: number, d: number, revision: string | null, extra: Partial<SnapshotDay> = {}): SnapshotDay => ({
  id,
  week,
  day: d,
  open: true,
  revision,
  workspace: 'project',
  exercises: [],
  ...extra,
});
const snap = (days: SnapshotDay[]): ContentSnapshot => ({
  fingerprint: days.map((d) => d.id + '@' + d.week + '/' + d.day + '=' + (d.open ? d.revision : '-')).join('|'),
  days,
});
const empty = (): Progress => ({ schema: 'progress/v1', resume: null, progress: {} });
const rec = (extra: Record<string, unknown> = {}) => ({
  parts_viewed: [1 as const],
  completed: false,
  attempted_problems: [] as number[],
  first_opened_at: ts,
  completed_at: null,
  ...extra,
});

{
  const v1 = snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'b')]);
  const base = reconcile(empty(), v1);
  expect(Object.keys(base.day_tags ?? {}).length === 0, 'first reconcile: no tags');
  expect(base.content_seen?.days.d1 === 'a' && base.content_seen?.days.d2 === 'b', 'first reconcile: records what each day is');
  expect(reconcile(base, v1) === base, 'the same course again: the record is not rewritten');

  const v2 = snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'B'), day('d3', 1, 3, 'c')]);
  const next = reconcile(base, v2);
  expect(next.day_tags?.d2 === 'updated', 'a changed day is tagged updated');
  expect(next.day_tags?.d3 === 'new', 'a day not there before is tagged new');
  expect(next.day_tags?.d1 === undefined, 'an unchanged day is not tagged');

  const v3 = snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'B'), day('d3', 1, 3, 'C')]);
  const again = reconcile(next, v3);
  expect(again.day_tags?.d3 === 'new', 'a new day changed again stays new');

  const locked = snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'X', { open: false }), day('d3', 1, 3, 'c')]);
  const lockedNext = reconcile(base, locked);
  expect(lockedNext.day_tags?.d2 === undefined, 'a locked day is not tagged');
  expect(lockedNext.content_seen?.days.d2 === 'b', 'a locked day keeps the revision it last had');
  const unlocked = reconcile(lockedNext, snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'X'), day('d3', 1, 3, 'c')]));
  expect(unlocked.day_tags?.d2 === 'updated', 'a day changed while locked is tagged when it opens');
}

{
  // Days move: d2 is inserted before the old second day, which becomes the third.
  const v1 = snap([day('d1', 1, 1, 'a'), day('d2', 1, 2, 'b')]);
  const p: Progress = { ...empty(), resume: { week: 1, day: 2, part: 3 }, progress: { w1d1: rec(), w1d2: rec({ parts_viewed: [1, 2] }) } };
  const base = reconcile(p, v1);
  expect(base.progress.w1d2?.day_id === 'd2', 'records get their day identity');
  const moved = reconcile(base, snap([day('d1', 1, 1, 'a'), day('new', 1, 2, 'n'), day('d2', 1, 3, 'b')]));
  expect(moved.progress.w1d3?.day_id === 'd2' && moved.progress.w1d3.parts_viewed.length === 2, "a moved day's record follows it");
  expect(moved.progress.w1d2 === undefined, 'nothing is left at the old place');
  expect(moved.resume?.day === 3 && moved.resume.part === 3, 'the resume point follows its day');
  expect(moved.day_tags?.new === 'new' && moved.day_tags?.d2 === undefined, 'only the inserted day is tagged');

  const swapped = reconcile(base, snap([day('d2', 1, 1, 'b'), day('d1', 1, 2, 'a')]));
  expect(swapped.progress.w1d1?.day_id === 'd2' && swapped.progress.w1d2?.day_id === 'd1', 'two days that swap places swap records');

  const gone = reconcile(base, snap([day('d1', 1, 1, 'a'), day('d9', 1, 2, 'z')]));
  expect(gone.progress['gone:d2']?.parts_viewed.length === 2, 'a removed day is parked, not overwritten');
  expect(gone.resume === null, 'the resume point of a removed day is cleared');
  const back = reconcile(gone, snap([day('d1', 1, 1, 'a'), day('d9', 1, 2, 'z'), day('d2', 1, 3, 'b')]));
  expect(back.progress.w1d3?.day_id === 'd2' && back.progress.w1d3.parts_viewed.length === 2, 'a day that comes back gets its record back');
}

{
  // Exercises: renumbered, and moved to another file.
  const ex = (id: string, number: number, file: string | null, revision = 'r1') => ({ id, number, file, revision });
  const v1 = snap([day('d4', 1, 4, 'a', { exercises: [ex('d4-ex1', 1, 'ts-basics/day4/a.ts'), ex('d4-ex2', 2, 'ts-basics/day4/b.ts')] })]);
  const legacy: Progress = { ...empty(), progress: { w1d4: rec({ attempted_problems: [2] }) } };
  const base = reconcile(legacy, v1);
  expect(base.attempts?.['d4-ex2']?.revision === 'r1', 'an attempt recorded by number is given to its exercise');
  expect(base.attempts?.['d4-ex1'] === undefined, 'and to no other');

  const v2 = snap([
    day('d4', 1, 4, 'A', { exercises: [ex('d4-ex0', 1, 'ts-basics/day4/z.ts'), ex('d4-ex1', 2, 'ts-basics/day4/a.ts'), ex('d4-ex2', 3, 'ts-basics/day4/b2.ts', 'r2')] }),
  ]);
  const next = reconcile(base, v2);
  expect(next.attempts?.['d4-ex2']?.revision === 'r1', 'a renumbered exercise keeps its attempt');
  const files = next.content_seen?.files['d4-ex2'];
  expect(files?.at?.file === 'ts-basics/day4/b2.ts' && files.moved_from.some((m) => m.file === 'ts-basics/day4/b.ts'), 'an exercise moved to another file remembers where it was');
  expect(next.content_seen?.files['d4-ex1']?.moved_from.length === 0, 'an exercise that kept its file has no history');
}

{
  // Keys this version does not know, and malformed new keys.
  const { Progress: ProgressSchema } = require('../../shared/contracts/progress') as typeof import('../../shared/contracts/progress');
  const parsed = ProgressSchema.parse({ ...empty(), future_key: { a: 1 }, day_tags: 'not an object' });
  expect((parsed as Record<string, unknown>).future_key !== undefined, 'a key from a newer studio is kept');
  expect(parsed.day_tags === undefined, 'a malformed new key is dropped on its own');
}

// ---------------------------------------------------------------- the store, over a copy of the course

const INDEX = path.join(contentDir, 'course-index.json');
type Index = { weeks: { week: number; days: { day: number; number: number; revision?: string }[] }[] };
const readIndex = (): Index => JSON.parse(fs.readFileSync(INDEX, 'utf-8')) as Index;
let bump = 0;
/** Changes the course as a rebuild would, and makes sure its stamp moves. */
function editIndex(fn: (index: Index) => void): void {
  const index = readIndex();
  fn(index);
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
  const at = new Date(Date.now() + ++bump * 5_000);
  fs.utimesSync(INDEX, at, at);
}

async function storeTests(): Promise<void> {
  const first = await store.progressForClient();
  expect(Object.keys(first.day_tags ?? {}).length === 0, 'store: the first launch tags nothing');
  expect(fs.existsSync(PROGRESS_FILE), 'store: the first launch writes the baseline');
  expect((first as Record<string, unknown>).content_seen === undefined, 'store: what the course was is never sent to the page');

  editIndex((i) => {
    i.weeks[0].days[3].revision = 'changed-on-purpose';
  });
  const after = await store.progressForClient();
  expect(after.day_tags?.d4 === 'updated', 'store: a rebuilt day is tagged updated', JSON.stringify(after.day_tags));

  await store.recordProgress({ week: 1, day: 4, part: 4, reset_day: true });
  expect((await store.progressForClient()).day_tags?.d4 === 'updated', 'store: clearing a day\'s done mark does not take its tag off');

  const day4 = store.courseDay(1, 4) as CourseDay;
  const exercise = day4.parts.flatMap((p) => p.problems).find((p) => p.id === 'd4-ex1')!;
  await store.recordProgress({ week: 1, day: 4, part: 4, attempted_exercise: 'd4-ex1', viewed: false });
  const attempted = await store.progressForClient();
  expect(attempted.day_tags?.d4 === 'updated', 'store: an attempt does not take the tag off');
  expect(attempted.attempts?.['d4-ex1']?.revision === exercise.revision, 'store: an attempt is recorded by identity, with its revision');
  expect(attempted.progress.w1d4?.attempted_problems.includes(exercise.number) === true, 'store: and by number, for older pages');

  await store.recordProgress({ week: 1, day: 4, part: 1, viewed: false });
  expect((await store.progressForClient()).day_tags?.d4 === undefined, 'store: opening the day takes its tag off');

  // A record from a newer studio is refused, never set aside.
  const saved = fs.readFileSync(PROGRESS_FILE, 'utf-8');
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ schema: 'progress/v9', anything: true }));
  let refused = false;
  try {
    store.readProgress();
  } catch (e) {
    refused = (e as { code?: string }).code === 'PROGRESS_NEWER';
  }
  expect(refused && fs.existsSync(PROGRESS_FILE), 'store: a newer record is refused and left where it is');
  fs.writeFileSync(PROGRESS_FILE, saved);
}

// ---------------------------------------------------------------- saved code and starting files

function workspaceTests(): void {
  workspace.prepareWorkspace('project');
  const dir = workspace.workspaceDir('project');
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.studio', 'seeded.json'), 'utf-8')) as Record<string, string>;
  const seeds = Object.keys(record);
  expect(seeds.length > 0, 'workspace: starting files are recorded');
  const untouched = seeds[0];
  const changed = seeds[1];
  fs.appendFileSync(path.join(dir, ...changed.split('/')), '\n// my change\n');
  expect(workspace.readLearnerFile('project', untouched) === null, 'saved code: an untouched starting file is not the learner\'s');
  expect(workspace.readLearnerFile('project', changed)?.includes('my change') === true, 'saved code: a changed one is');

  fs.mkdirSync(path.join(dir, 'playwright-report'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'playwright-report', 'index.html'), 'course text');
  const removed = workspace.removeStartingFiles();
  expect(removed > 0 && !fs.existsSync(path.join(dir, ...untouched.split('/'))), 'quit: untouched starting files are removed');
  expect(fs.existsSync(path.join(dir, ...changed.split('/'))), 'quit: a file the learner changed is kept');
  expect(!fs.existsSync(path.join(dir, 'playwright-report')), "quit: the test runner's report is removed");
  expect(fs.existsSync(path.join(dir, '.studio', 'seeded.json')), 'quit: the record is kept');
  workspace.prepareWorkspace('project');
  expect(fs.existsSync(path.join(dir, ...untouched.split('/'))), 'next command: the starting files are written again');
}

// ---------------------------------------------------------------- the id ledger

function ledgerTests(): void {
  const first = checkLedger(EMPTY_LEDGER, [{ id: 'd9-ex1', title: 'Test the log-out flow', file: 'tests/day9/logout.spec.ts', kind: 'code', where: 'day 9' }]);
  const reused = (): unknown =>
    checkLedger(first.ledger, [{ id: 'd9-ex1', title: 'The sign-in page, at first sight', file: 'tests/day9/signin-page.spec.ts', kind: 'code', where: 'day 9' }]);
  let stopped = false;
  try {
    reused();
  } catch {
    stopped = true;
  }
  expect(stopped, 'ledger: an id reused for a different exercise stops the build');
  const retitled = checkLedger(first.ledger, [{ id: 'd9-ex1', title: 'Test log-out', file: 'tests/day9/logout.spec.ts', kind: 'code', where: 'day 9' }]);
  expect(retitled.ids.get('d9-ex1') === 'd9-ex1', 'ledger: a new title alone is the same exercise');
  const renewed = checkLedger(
    first.ledger,
    [{ id: 'd9-ex1', title: 'The sign-in page, at first sight', file: 'tests/day9/signin-page.spec.ts', kind: 'code', where: 'day 9' }],
    { newIdentity: new Set(['d9-ex1']) },
  );
  expect(renewed.ids.get('d9-ex1') === 'd9-ex1~2', 'ledger: --new-identity gives the new exercise its own identity');
}

void (async () => {
  try {
    await storeTests();
    workspaceTests();
    ledgerTests();
  } catch (e) {
    failures++;
    console.log('FAIL  the tests stopped: ' + ((e as Error).stack ?? String(e)));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})();
