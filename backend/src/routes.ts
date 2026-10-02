import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from './config';
import { lastFrame, prepareRun, startRun } from './runner';
import { receiveFrame, startCommand, stopCommand } from './terminal';
import { readLearnerFile } from './terminal/workspace';
import {
  courseDay,
  courseIndex,
  coursePlan,
  ensureReconciled,
  findProblem,
  indexDayTitle,
  isLocked,
  progressForClient,
  readProgress,
  recordProgress,
} from './store';
import type { FileAt } from '../../shared/contracts/progress';
import type { SavedCode } from '../../shared/contracts/saved_code';
import { ProgressUpdate } from '../../shared/contracts/progress';
import { RunRequest } from '../../shared/contracts/run';
import { CheckRequest } from '../../shared/contracts/check';
import { checkAnswer } from './check';
import { savePreview } from './preview';
import { getBranding } from './branding';
import { serveMark } from './content';
import { markDay } from '../../shared/watermark';
import { Workspace } from '../../shared/contracts/course_day';
import { ContentId, DayNumber, WeekNumber, exerciseIdentity } from '../../shared/contracts/common';
import type { ErrorCode } from '../../shared/contracts/problem_error';

/** Every non-2xx response is problem+json - clients branch on `code`, never on `detail`. */
function fail(res: Response, status: number, code: ErrorCode, detail: string): void {
  res.status(status).type('application/problem+json').json({
    type: 'about:blank',
    title: code,
    status,
    code,
    detail,
  });
}

const badRequest = (res: Response, code: ErrorCode, e: unknown): void =>
  fail(res, 400, code, e instanceof z.ZodError ? e.issues[0]?.message ?? 'invalid request' : String(e));

export const router = Router();

/**
 * A locked day is closed on every route, not just when its lessons are read: a check would give
 * away its expected output, and a run or progress record would count work on a day that is not open.
 */
/** Answers for a locked day, or for one whose course cannot be read, and says it did. Never throws. */
function refuseLocked(res: Response, week: number, day: number): boolean {
  try {
    if (!isLocked(week, day)) return false;
    fail(res, 423, 'DAY_LOCKED', courseDay(week, day)?.title ?? 'This day is not open yet.');
  } catch {
    fail(res, 500, 'INTERNAL_ERROR', 'The course could not be read.');
  }
  return true;
}

/** Progress is bookkeeping: when recording it fails, the request it came with still succeeds. */
const recordQuietly = (update: Parameters<typeof recordProgress>[0]): void => {
  recordProgress(update).catch((e: unknown) => console.error('[studio] progress not recorded: ' + (e as Error).message));
};

// ---------------------------------------------------------------- content

router.get('/course', (_req, res) => {
  try {
    // Only open weeks are listed, so a week that is written but not ready does not make the course
    // look unfinished. The filter keys off `locked` rather than a week number, so a week appears
    // on its own the moment it is unlocked, and a direct link to a locked day still gets the
    // locked screen below instead of a 404.
    // The course plan comes with the course (it is content, not the page's), or null without one.
    const index = courseIndex();
    res.json({ ...index, weeks: index.weeks.filter((w) => !w.locked), plan: coursePlan() });
  } catch {
    fail(res, 503, 'CONTENT_MISSING', 'The course has no content yet.');
  }
});

router.get('/course/:week/:day', (req, res) => {
  const week = Number(req.params.week);
  const day = Number(req.params.day);
  const found = courseDay(week, day);
  // A locked day is not in the app's content pack at all: the index still knows it, and its title.
  if (!found && isLocked(week, day) && indexDayTitle(week, day) !== null) {
    return fail(res, 423, 'DAY_LOCKED', indexDayTitle(week, day)!);
  }
  if (!found) return fail(res, 404, 'DAY_NOT_FOUND', 'Week ' + week + ' day ' + day + ' does not exist.');
  if (found.locked || isLocked(week, day)) {
    // A locked day (or a day of a locked week) still answers, with its title, so a link into it lands somewhere honest
    // rather than a 404. The SPA renders the locked state from this.
    return fail(res, 423, 'DAY_LOCKED', found.title);
  }
  // Every day leaves marked with the licence the app runs under (shared/watermark.ts).
  const mark = serveMark();
  res.json(mark ? markDay(found, mark).day : found);
});

/** Who the studio is licensed to, and their logo, for the header (branding.ts). */
router.get('/branding', (_req, res) => res.json(getBranding()));

// ---------------------------------------------------------------- progress

router.get('/progress', async (_req, res) => {
  try {
    // Reconciled with the course first, so the day cards' tags are those of this launch's course.
    res.json(await progressForClient());
  } catch (e) {
    fail(res, 500, 'INTERNAL_ERROR', (e as { code?: string }).code === 'PROGRESS_NEWER' ? (e as Error).message : 'The progress record could not be read.');
  }
});

router.post('/progress', async (req, res) => {
  let parsed;
  try {
    parsed = ProgressUpdate.parse(req.body);
  } catch (e) {
    return badRequest(res, 'PART_NOT_FOUND', e);
  }
  if (refuseLocked(res, parsed.week, parsed.day)) return;
  try {
    res.json(await recordProgress(parsed));
  } catch {
    fail(res, 500, 'INTERNAL_ERROR', 'The progress record could not be saved.');
  }
});

// ---------------------------------------------------------------- run

router.post('/run', async (req, res) => {
  let parsed;
  try {
    parsed = RunRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'CODE_REQUIRED', e);
  }
  if (refuseLocked(res, parsed.week, parsed.day)) return;
  let started;
  try {
    started = startRun(parsed);
  } catch (e) {
    if ((e as { code?: string }).code === 'RUN_QUEUE_FULL') return fail(res, 429, 'RUN_QUEUE_FULL', 'Too many runs are waiting. Try again in a moment.');
    return fail(res, 500, 'INTERNAL_ERROR', 'The run could not start.');
  }
  if ('queue_full' in started) {
    return fail(
      res,
      429,
      'RUN_QUEUE_FULL',
      'Too many runs in flight (' + config.run.max_concurrent + ' at once). Try again in a moment.',
    );
  }
  // Recording the attempt is progress bookkeeping; a failure there must not fail the run.
  // Attempting an exercise is not reading the part, so it does not count the part as read -
  // every frontend records that separately.
  if (parsed.problem_number || parsed.problem_id) {
    recordQuietly({
      week: parsed.week,
      day: parsed.day,
      part: parsed.part,
      attempted_problem: parsed.problem_number ?? null,
      ...(parsed.problem_id ? { attempted_exercise: parsed.problem_id } : {}),
      viewed: false,
    });
  }
  res.json(await started.done);
});

/**
 * Mints the run id BEFORE the run so the client can attach the WebSocket first. Without this
 * the first second of frames is missed on every run.
 */
router.post('/run/prepare', (_req, res) => {
  try {
    res.json({ run_id: prepareRun() });
  } catch {
    fail(res, 429, 'RUN_QUEUE_FULL', 'Too many runs are waiting. Try again in a moment.');
  }
});

/**
 * What the Detach window shows the instant it opens, before (or instead of) anything arrives
 * on its own WebSocket connection - see the comment on the Stream type in runner.ts for why the
 * stream alone is not enough once a run is already under way or already finished.
 */
router.get('/run/:run_id/last-frame', (req, res) => {
  res.json(lastFrame(req.params.run_id) ?? { frame: null, status: null });
});

// ---------------------------------------------------------------- check my answer

/**
 * Grades a code exercise with the check the course gives it. The browser sends only the learner's
 * code and which exercise it is; the check itself is read from the course here.
 */
router.post('/check', async (req, res) => {
  let parsed: CheckRequest;
  try {
    parsed = CheckRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'CODE_REQUIRED', e);
  }
  if (refuseLocked(res, parsed.week, parsed.day)) return;
  let found;
  try {
    found = courseDay(parsed.week, parsed.day);
  } catch {
    return fail(res, 500, 'INTERNAL_ERROR', 'The course could not be read.');
  }
  // By identity first, so an exercise renumbered since the page loaded is still the one checked.
  const located = found ? findProblem(found, { id: parsed.problem_id ?? null, number: parsed.problem }) : null;
  const problem = located?.problem;
  if (!found || !problem?.check || !problem.file) {
    return fail(res, 404, 'EXERCISE_NOT_FOUND', 'This exercise has no automatic check.');
  }
  // The check runs in the day's own workspace, whatever the page says.
  parsed = { ...parsed, part: located!.part.part, problem: problem.number, workspace: found.workspace };
  // Checking an answer is an attempt at the exercise, not reading the part.
  recordQuietly({
    week: parsed.week,
    day: parsed.day,
    part: parsed.part,
    attempted_problem: parsed.problem,
    attempted_exercise: exerciseIdentity(found.number, problem),
    viewed: false,
  });
  try {
    res.json(await checkAnswer(problem, parsed));
  } catch (e) {
    if ((e as { code?: string }).code === 'RUN_QUEUE_FULL') return fail(res, 429, 'RUN_QUEUE_FULL', 'Too many runs are waiting. Try again in a moment.');
    fail(res, 500, 'INTERNAL_ERROR', 'The check could not run.');
  }
});

// ---------------------------------------------------------------- terminal

const TerminalRequest = z.object({
  /** Minted by POST /api/run/prepare, so the output streams over the same WebSocket as a Run. */
  run_id: z.string().uuid(),
  command: z.string().min(1).max(2_000),
  /** The editor's code, which the command saves before it runs. */
  code: z.string().max(64_000),
  /** The file the editor holds, relative to the workspace, when it holds a lesson's file. */
  file: z.string().max(200).nullable().default(null),
  /** The workspace of the day the learner is on. */
  workspace: Workspace.default('project'),
  /**
   * The exercise the editor holds, when it was opened from one: saving it as that exercise's own file
   * counts as working on the exercise.
   */
  exercise: z
    .object({ week: WeekNumber, day: DayNumber, id: ContentId })
    .nullable()
    .default(null),
});

/** Records an attempt when a command saved the editor as the exercise's own file, in the day's workspace. */
function recordTerminalAttempt(exercise: { week: number; day: number; id: string }, saved: string, workspace: Workspace): void {
  try {
    if (isLocked(exercise.week, exercise.day)) return;
    const day = courseDay(exercise.week, exercise.day);
    const located = day ? findProblem(day, { id: exercise.id }) : null;
    if (!day || !located || located.problem.file !== saved || day.workspace !== workspace) return;
    recordQuietly({
      week: exercise.week,
      day: exercise.day,
      part: located.part.part,
      attempted_problem: located.problem.number,
      attempted_exercise: exercise.id,
      viewed: false,
    });
  } catch {
    // Bookkeeping only.
  }
}

/** Starts one Terminal command. Its output, and its outcome, arrive on the run's stream. */
router.post('/terminal', (req, res) => {
  let parsed;
  try {
    parsed = TerminalRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'CODE_REQUIRED', e);
  }
  let saved: string | null;
  try {
    saved = startCommand(parsed.run_id, parsed.command, parsed.code, parsed.file, parsed.workspace);
  } catch {
    return fail(res, 500, 'INTERNAL_ERROR', 'The command could not start.');
  }
  if (saved && parsed.exercise) recordTerminalAttempt(parsed.exercise, saved, parsed.workspace);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- the learner's saved code

/** The longest file loaded back into the editor: the most the editor sends (CODE_MAX). */
const SAVED_MAX = 64_000;
const nothingSaved: SavedCode = { code: null, file: null, moved: false, too_large: false };
const plain = (text: string): string => text.replace(/\r\n/g, '\n').trim();

/**
 * The code the learner last saved for a code exercise, so "Start this in the editor" brings their
 * work back. Looked for where the exercise's file is now, then where it was before a course update
 * moved it (newest first). An untouched starting file, or the starting code itself, is not theirs.
 */
router.get('/exercise/:week/:day/:id/saved', async (req, res) => {
  const week = Number(req.params.week);
  const day = Number(req.params.day);
  const id = req.params.id;
  if (!Number.isInteger(week) || !Number.isInteger(day) || !ContentId.safeParse(id).success) {
    return fail(res, 404, 'EXERCISE_NOT_FOUND', 'There is no such exercise.');
  }
  if (refuseLocked(res, week, day)) return;
  let found;
  try {
    found = courseDay(week, day);
  } catch {
    return fail(res, 500, 'INTERNAL_ERROR', 'The course could not be read.');
  }
  const problem = found ? findProblem(found, { id })?.problem : undefined;
  if (!found || !problem || problem.kind !== 'code' || !problem.file) {
    return fail(res, 404, 'EXERCISE_NOT_FOUND', 'This exercise has no file of its own.');
  }
  let earlier: FileAt[] = [];
  try {
    await ensureReconciled();
    earlier = [...(readProgress().content_seen?.files[id]?.moved_from ?? [])].reverse();
  } catch {
    // Without the record, only the exercise's own file is looked at.
  }
  const places: FileAt[] = [{ workspace: found.workspace, file: problem.file }, ...earlier];
  for (const [i, at] of places.entries()) {
    const text = readLearnerFile(at.workspace, at.file);
    if (text === null || (problem.stub !== null && plain(text) === plain(problem.stub))) continue;
    const answer: SavedCode =
      text.length > SAVED_MAX
        ? { code: null, file: at.file, moved: i > 0, too_large: true }
        : { code: text, file: at.file, moved: i > 0, too_large: false };
    return res.json(answer);
  }
  res.json(nothingSaved);
});

const PreviewRequest = z
  .object({ html: z.string().min(1).max(500_000), responses: z.record(z.unknown()).optional() })
  .refine((r) => JSON.stringify(r.responses ?? {}).length <= 200_000, { message: 'responses are too large' });

/** View in Page: keeps a practice page's HTML and answers with the address that shows it (preview.ts). */
router.post('/preview', (req, res) => {
  let parsed;
  try {
    parsed = PreviewRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'BAD_REQUEST', e);
  }
  res.json({ url: savePreview(parsed.html, parsed.responses) });
});

/** Ctrl+C in the Terminal. */
router.post('/terminal/:run_id/stop', (req, res) => res.json({ stopped: stopCommand(req.params.run_id) }));

/**
 * Live-view frames from the Workspace's test wrapper, which runs inside the test runner on this
 * same computer. Only a loopback caller is accepted, only for the command that is running, and only
 * with the key that command was given (terminal/index.ts).
 */
router.post('/terminal/:run_id/frame', (req, res) => {
  const from = req.socket.remoteAddress ?? '';
  if (!/^(::1|127\.|::ffff:127\.)/.test(from)) return res.status(403).end();
  res.status(receiveFrame(req.params.run_id, req.get('x-studio-frame-key'), req.body ?? {}) ? 204 : 410).end();
});
