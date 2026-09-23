import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from './config';
import { lastFrame, prepareRun, startRun } from './runner';
import { currentReportDir, receiveFrame, startCommand, stopCommand } from './terminal';
import { courseDay, courseIndex, readProgress, recordProgress } from './store';
import { ProgressUpdate } from '../../shared/contracts/progress';
import { RunRequest } from '../../shared/contracts/run';
import { Workspace } from '../../shared/contracts/course_day';
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

// ---------------------------------------------------------------- content

router.get('/course', (_req, res) => {
  try {
    // Only open weeks are listed, so a week that is written but not ready does not make the course
    // look unfinished. The filter keys off `locked` rather than a week number, so a week appears
    // on its own the moment it is unlocked, and a direct link to a locked day still gets the
    // locked screen below instead of a 404.
    const index = courseIndex();
    res.json({ ...index, weeks: index.weeks.filter((w) => !w.locked) });
  } catch {
    fail(res, 503, 'CONTENT_MISSING', 'The course has no content yet.');
  }
});

router.get('/course/:week/:day', (req, res) => {
  const week = Number(req.params.week);
  const day = Number(req.params.day);
  const found = courseDay(week, day);
  if (!found) return fail(res, 404, 'DAY_NOT_FOUND', 'Week ' + week + ' day ' + day + ' does not exist.');
  if (found.locked) {
    // A locked day still answers, with its title, so a link into it lands somewhere honest
    // rather than a 404. The SPA renders the locked state from this.
    return fail(res, 423, 'DAY_LOCKED', found.title);
  }
  res.json(found);
});

// ---------------------------------------------------------------- progress

router.get('/progress', (_req, res) => res.json(readProgress()));

router.post('/progress', async (req, res) => {
  let parsed;
  try {
    parsed = ProgressUpdate.parse(req.body);
  } catch (e) {
    return badRequest(res, 'PART_NOT_FOUND', e);
  }
  res.json(await recordProgress(parsed));
});

// ---------------------------------------------------------------- run

router.post('/run', async (req, res) => {
  let parsed;
  try {
    parsed = RunRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'CODE_REQUIRED', e);
  }
  const started = startRun(parsed);
  if ('queue_full' in started) {
    return fail(
      res,
      429,
      'RUN_QUEUE_FULL',
      'Too many runs in flight (' + config.run.max_concurrent + ' at once). Try again in a moment.',
    );
  }
  // Recording the attempt is progress bookkeeping; a failure there must not fail the run.
  if (parsed.problem_number) {
    void recordProgress({
      week: parsed.week,
      day: parsed.day,
      part: parsed.part,
      attempted_problem: parsed.problem_number,
    });
  }
  res.json(await started.done);
});

/**
 * Mints the run id BEFORE the run so the client can attach the WebSocket first. Without this
 * the first second of frames is missed on every run.
 */
router.post('/run/prepare', (_req, res) => res.json({ run_id: prepareRun() }));

/**
 * What the Detach window shows the instant it opens, before (or instead of) anything arrives
 * on its own WebSocket connection - see the comment on the Stream type in runner.ts for why the
 * stream alone is not enough once a run is already under way or already finished.
 */
router.get('/run/:run_id/last-frame', (req, res) => {
  res.json(lastFrame(req.params.run_id) ?? { frame: null, status: null });
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
});

/** Starts one Terminal command. Its output, and its outcome, arrive on the run's stream. */
router.post('/terminal', (req, res) => {
  let parsed;
  try {
    parsed = TerminalRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'CODE_REQUIRED', e);
  }
  startCommand(parsed.run_id, parsed.command, parsed.code, parsed.file, parsed.workspace);
  res.json({ ok: true });
});

/** Ctrl+C in the Terminal. */
router.post('/terminal/:run_id/stop', (req, res) => res.json({ stopped: stopCommand(req.params.run_id) }));

/**
 * Live-view frames from the Workspace's test wrapper, which runs inside the test runner on this
 * same computer. Only a loopback caller is accepted, and only for the command that is running.
 */
router.post('/terminal/:run_id/frame', (req, res) => {
  const from = req.socket.remoteAddress ?? '';
  if (!/^(::1|127\.|::ffff:127\.)/.test(from)) return res.status(403).end();
  res.status(receiveFrame(req.params.run_id, req.body ?? {}) ? 204 : 410).end();
});

/** The HTML report of the last Terminal command, opened by `npx playwright show-report`. */
router.use('/terminal/report', (req, res, next) => express.static(currentReportDir())(req, res, next));
