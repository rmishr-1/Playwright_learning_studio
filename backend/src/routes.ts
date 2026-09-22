import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from './config';
import { ask, assistantAvailable } from './assistant';
import { lastFrame, prepareRun, startRun } from './runner';
import { concepts, courseDay, courseIndex, readProgress, recordProgress } from './store';
import { ProgressUpdate } from '../../shared/contracts/progress';
import { RunRequest } from '../../shared/contracts/run';
import { AssistantRequest } from '../../shared/contracts/assistant';
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
    res.json(courseIndex());
  } catch {
    fail(res, 503, 'CONTENT_NOT_IMPORTED', 'Course content has not been imported yet. Run `npm run import`.');
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

router.get('/concepts', (_req, res) => res.json({ entries: concepts() }));

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

// ---------------------------------------------------------------- assistant

router.post('/assistant', async (req: Request, res: Response) => {
  if (!assistantAvailable()) {
    return fail(res, 503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not configured on this server.');
  }
  let parsed;
  try {
    parsed = AssistantRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'ASSISTANT_UNAVAILABLE', e);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (event: string, data: unknown): void => {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };

  try {
    for await (const chunk of ask(parsed)) {
      if (chunk.type === 'delta') send('delta', { text: chunk.text });
      else if (chunk.type === 'error') send('error', { text: chunk.text });
      else send('done', {});
    }
  } catch (e) {
    send('error', { text: e instanceof Error ? e.message : 'Assistant failed.' });
  }
  res.end();
});
