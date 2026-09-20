import * as crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from './config';
import { ask, assistantAvailable } from './assistant';
import { prepareRun, startRun } from './runner';
import {
  atLeast,
  clearSessionCookie,
  effectiveRole,
  hashPassword,
  requireAuth,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from './auth';
import { certificateFor, certificateHtml, certificatePdf } from './certificate';
import { mailConfigured, resetCodeMail, send } from './mailer';
import {
  allLearners,
  blockingWeek,
  claimAccount,
  concepts,
  courseDay,
  courseIndex,
  createAccount,
  learnerId,
  readLearner,
  recordProgress,
  clearPasswordReset,
  deleteAccount,
  recordResetAttempt,
  replacePassword,
  setEmail,
  setRole,
  startPasswordReset,
  touchLearner,
} from './store';
import { ProgressUpdate, type Learner } from '../../shared/contracts/learner';
import {
  ForgotRequest,
  LoginRequest,
  RegisterRequest,
  ResetRequest,
  SetEmailRequest,
  SetRoleRequest,
} from '../../shared/contracts/session';
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

/** Strips the password digest. Invariant 5: it never leaves the server. */
const publicLearner = (l: Learner) => {
  const { password: _password, ...rest } = l;
  return { ...rest, role: effectiveRole(l) };
};

export const router = Router();

// ---------------------------------------------------------------- auth

router.post('/auth/register', async (req, res) => {
  let parsed;
  try {
    parsed = RegisterRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'WEAK_PASSWORD', e);
  }
  const created = await createAccount(parsed.name, parsed.email, hashPassword(parsed.password));
  if ('exists' in created) {
    return fail(res, 409, 'ACCOUNT_EXISTS', 'That name is already registered. Sign in instead.');
  }
  setSessionCookie(res, created.learner_id);
  res.json(publicLearner(created));
});

router.post('/auth/login', async (req, res) => {
  let parsed;
  try {
    parsed = LoginRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'INVALID_CREDENTIALS', e);
  }
  const id = learnerId(parsed.name);
  const learner = readLearner(id);
  // One message for "no such account" and "wrong password" - a different answer to each tells
  // an outsider which names exist.
  const rejected = (): void =>
    fail(res, 401, 'INVALID_CREDENTIALS', 'That name and password do not match.');

  if (!learner) return rejected();

  if (!learner.password) {
    // An unclaimed account, migrated from before logins existed: the first sign-in sets the
    // password. Documented in the README as a bootstrap weakness, not a feature.
    if (parsed.password.length < 8) {
      return fail(res, 400, 'WEAK_PASSWORD', 'Use at least 8 characters to claim this account.');
    }
    const claimed = await claimAccount(id, hashPassword(parsed.password));
    if (!claimed) return rejected();
    setSessionCookie(res, id);
    return res.json(publicLearner(claimed));
  }

  if (!verifyPassword(parsed.password, learner.password)) return rejected();
  await touchLearner(id);
  setSessionCookie(res, id);
  res.json(publicLearner(learner));
});

/**
 * Step one of a reset. ALWAYS answers the same, whether or not the account exists and whether
 * or not it has an email - a different answer would turn this into a way to enumerate who is
 * registered.
 */
router.post('/auth/forgot', async (req, res) => {
  let parsed;
  try {
    parsed = ForgotRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'LEARNER_NAME_REQUIRED', e);
  }
  const id = learnerId(parsed.name);
  const learner = readLearner(id);

  if (learner?.email) {
    // Six digits, from a CSPRNG rather than Math.random - this guards an account.
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const digest = hashPassword(code);
    const expiresAt = new Date(Date.now() + config.reset.code_ttl_minutes * 60_000)
      .toISOString()
      .replace(/\.\d+Z$/, 'Z');
    await startPasswordReset(id, { ...digest, expires_at: expiresAt });
    try {
      await send(resetCodeMail(learner.display_name, learner.email, code, config.reset.code_ttl_minutes));
    } catch (e) {
      // A mail failure must not tell the caller whether the account exists, so it is logged
      // and swallowed. The learner simply never receives a code.
      console.error('[mail] failed to send a reset code:', e);
    }
  }

  res.json({ sent: true, delivery: mailConfigured() ? 'smtp' : 'outbox' });
});

/** Step two. Verifies the code and sets the new password; it does not sign anyone in. */
router.post('/auth/reset', async (req, res) => {
  let parsed;
  try {
    parsed = ResetRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'RESET_CODE_INVALID', e);
  }
  const id = learnerId(parsed.name);
  const learner = readLearner(id);
  const challenge = learner?.password_reset;

  const invalid = (): void =>
    fail(res, 400, 'RESET_CODE_INVALID', 'That code is not right, or it has already been used.');
  if (!learner || !challenge) return invalid();

  if (Date.now() > Date.parse(challenge.expires_at)) {
    await clearPasswordReset(id);
    return fail(res, 400, 'RESET_CODE_EXPIRED', 'That code has expired. Ask for a new one.');
  }

  if (!verifyPassword(parsed.code, challenge)) {
    // A six-digit code is only a million wide, so unlimited guesses would fall in minutes.
    const attempts = await recordResetAttempt(id);
    if (attempts >= config.reset.max_attempts) await clearPasswordReset(id);
    return invalid();
  }

  await replacePassword(id, hashPassword(parsed.password));
  res.json({ ok: true });
});

router.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const learner = req.learner!;
  const role = effectiveRole(learner);
  res.json({
    learner_id: learner.learner_id,
    display_name: learner.display_name,
    role,
    // The client renders its menu from these; the routes below enforce the same rules
    // independently, because a hidden menu item is not a permission.
    may_see_dashboard: atLeast(learner, 'trainer'),
    may_manage_people: atLeast(learner, 'admin'),
    resume: learner.resume,
  });
});

// ---------------------------------------------------------------- content

router.get('/course', requireAuth, (_req, res) => {
  try {
    res.json(courseIndex());
  } catch {
    fail(res, 503, 'CONTENT_NOT_IMPORTED', 'Course content has not been imported yet. Run `npm run import`.');
  }
});

router.get('/course/:week/:day', requireAuth, (req, res) => {
  const week = Number(req.params.week);
  const day = Number(req.params.day);
  const found = courseDay(week, day);
  if (!found) return fail(res, 404, 'DAY_NOT_FOUND', 'Week ' + week + ' day ' + day + ' does not exist.');
  if (found.locked) {
    // A locked day still answers, with its title, so a link into it lands somewhere honest
    // rather than a 404. The SPA renders the locked state from this.
    return fail(res, 423, 'DAY_LOCKED', found.title);
  }

  // Sequential progression, against the SIGNED-IN learner - not an id from the query string.
  const blocking = blockingWeek(req.learner!, week);
  if (blocking !== null) {
    return fail(
      res,
      423,
      'WEEK_NOT_UNLOCKED',
      'Finish Week ' + blocking + ' first — every day in it — and Week ' + week + ' opens.',
    );
  }
  res.json(found);
});

router.get('/concepts', requireAuth, (_req, res) => res.json({ entries: concepts() }));

// ---------------------------------------------------------------- learner

router.get('/learner/me', requireAuth, (req, res) => res.json(publicLearner(req.learner!)));

router.post('/learner/progress', requireAuth, async (req, res) => {
  let parsed;
  try {
    parsed = ProgressUpdate.parse(req.body);
  } catch (e) {
    return badRequest(res, 'PART_NOT_FOUND', e);
  }
  // The acting learner comes from the session. An id in the body would be a claim, not a fact.
  const updated = await recordProgress(req.learner!.learner_id, parsed);
  if (!updated) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');
  res.json(publicLearner(updated));
});

// ---------------------------------------------------------------- run

router.post('/run', requireAuth, async (req, res) => {
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
    void recordProgress(req.learner!.learner_id, {
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
router.post('/run/prepare', requireAuth, (_req, res) => res.json({ run_id: prepareRun() }));

// ---------------------------------------------------------------- certificate

router.get('/certificate', requireAuth, (req, res) => {
  const found = certificateFor(req.learner!.learner_id)!;
  res.json({
    earned: found.eligible.earned,
    completed: found.eligible.completed,
    total: found.eligible.total,
    issued_at: found.learner.certificate?.issued_at ?? null,
  });
});

/** The markup the SPA embeds AND the PDF renders - one source, no drift. */
router.get('/certificate/view.html', requireAuth, async (req, res) => {
  const found = certificateFor(req.learner!.learner_id)!;
  if (!found.eligible.earned) {
    return fail(
      res,
      403,
      'CERTIFICATE_NOT_EARNED',
      'You have completed ' + found.eligible.completed + ' of ' + found.eligible.total + ' days.',
    );
  }
  const issuedAt = await issueDate(found.learner);
  res.type('text/html').send(certificateHtml(found.learner, issuedAt, found.eligible.total));
});

router.get('/certificate/certificate.pdf', requireAuth, async (req, res) => {
  const found = certificateFor(req.learner!.learner_id)!;
  if (!found.eligible.earned) {
    return fail(
      res,
      403,
      'CERTIFICATE_NOT_EARNED',
      'You have completed ' + found.eligible.completed + ' of ' + found.eligible.total + ' days.',
    );
  }
  const issuedAt = await issueDate(found.learner);
  const pdf = await certificatePdf(certificateHtml(found.learner, issuedAt, found.eligible.total));
  if ('queue_full' in pdf) {
    return fail(res, 429, 'RUN_QUEUE_FULL', 'The browser pool is busy. Try again in a moment.');
  }
  res.type('application/pdf')
    .setHeader(
      'Content-Disposition',
      'attachment; filename="' + found.learner.learner_id + '-certificate.pdf"',
    );
  res.send(pdf);
});

/**
 * Stamped once, the first time it is earned, so the date does not move if the learner reopens
 * a day afterwards.
 */
async function issueDate(learner: Learner): Promise<string> {
  if (learner.certificate) return learner.certificate.issued_at;
  const { stampCertificate } = await import('./store');
  const stamped = await stampCertificate(learner.learner_id);
  return stamped?.certificate?.issued_at ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------- assistant

router.post('/assistant', requireAuth, async (req: Request, res: Response) => {
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
    // The session decides whose progress the assistant sees, not the payload.
    for await (const chunk of ask({ ...parsed, learner_id: req.learner!.learner_id })) {
      if (chunk.type === 'delta') send('delta', { text: chunk.text });
      else if (chunk.type === 'error') send('error', { text: chunk.text });
      else send('done', {});
    }
  } catch (e) {
    send('error', { text: e instanceof Error ? e.message : 'Assistant failed.' });
  }
  res.end();
});

// ---------------------------------------------------------------- dashboard

router.get('/dashboard', requireAuth, requireRole('trainer'), (_req, res) => {
  const index = courseIndex();
  const totalDays = index.totals.days;

  res.json({
    total_weeks: index.weeks.length,
    total_days: totalDays,
    learners: allLearners()
      .map((l) => {
        // Per-week completion drives the checkpoint line: one checkpoint per week, filled when
        // every day in it is done. `locked` weeks still appear, so the track is always 8 long.
        const weeks = index.weeks.map((w) => {
          const done = w.days.filter((d) => l.progress['w' + w.week + 'd' + d.day]?.completed).length;
          return { week: w.week, done, total: w.days.length, locked: w.locked };
        });
        const daysDone = weeks.reduce((n, w) => n + w.done, 0);
        // Where they are now. The resume point is the better answer while that week is still
        // in progress; once it is finished it is stale (it would say "Week 1" for someone who
        // has finished weeks 1 and 2), so fall through to the first unfinished week.
        const firstUnfinished = weeks.find((w) => w.done < w.total)?.week ?? index.weeks.length;
        const resumeWeek = l.resume?.week;
        const resumeDone = resumeWeek
          ? (weeks.find((w) => w.week === resumeWeek)?.done ?? 0) ===
            (weeks.find((w) => w.week === resumeWeek)?.total ?? 0)
          : true;
        return {
          learner_id: l.learner_id,
          display_name: l.display_name,
          role: effectiveRole(l),
          last_seen_at: l.last_seen_at,
          days_done: daysDone,
          current_week: resumeWeek && !resumeDone ? resumeWeek : firstUnfinished,
          weeks,
        };
      })
      .sort((a, b) => b.days_done - a.days_done),
  });
});

// ---------------------------------------------------------------- people (admin)

router.get('/people', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({
    people: allLearners().map((l) => ({
      learner_id: l.learner_id,
      display_name: l.display_name,
      role: effectiveRole(l),
      email: l.email,
      days_completed: Object.values(l.progress).filter((p) => p.completed).length,
      /** Pinned admins come from config and cannot be demoted from this screen. */
      pinned: config.admins.includes(l.learner_id),
      unclaimed: l.password === null,
      last_seen_at: l.last_seen_at,
    })),
  });
});

/**
 * Removes an account. Irreversible, so it refuses the three cases that are almost always a
 * mistake: a config-pinned admin, the last admin, and the account you are signed in as.
 */
router.delete('/people/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const target = readLearner(req.params.id);
  if (!target) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');

  if (target.learner_id === req.learner!.learner_id) {
    return fail(
      res,
      403,
      'FORBIDDEN',
      'You cannot delete the account you are signed in as. Sign in as another admin first.',
    );
  }
  if (config.admins.includes(target.learner_id)) {
    return fail(
      res,
      403,
      'FORBIDDEN',
      'That account is pinned as an admin in studio.config.json. Remove it there first.',
    );
  }
  if (effectiveRole(target) === 'admin') {
    const admins = allLearners().filter((l) => effectiveRole(l) === 'admin');
    if (admins.length <= 1) {
      return fail(res, 403, 'FORBIDDEN', 'Promote someone else to admin before deleting the last one.');
    }
  }

  const removed = await deleteAccount(req.params.id);
  if (!removed) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');
  res.json({ ok: true });
});

router.put('/people/:id/email', requireAuth, requireRole('admin'), async (req, res) => {
  let parsed;
  try {
    parsed = SetEmailRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'NO_EMAIL_ON_FILE', e);
  }
  const updated = await setEmail(req.params.id, parsed.email);
  if (!updated) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');
  res.json(publicLearner(updated));
});

router.put('/people/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  let parsed;
  try {
    parsed = SetRoleRequest.parse(req.body);
  } catch (e) {
    return badRequest(res, 'FORBIDDEN', e);
  }
  const target = readLearner(req.params.id);
  if (!target) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');

  if (config.admins.includes(target.learner_id) && parsed.role !== 'admin') {
    return fail(
      res,
      403,
      'FORBIDDEN',
      'That account is pinned as an admin in studio.config.json. Edit the file to change it.',
    );
  }

  // Removing the last admin needs an operator to edit a config file to recover, so refuse it.
  if (parsed.role !== 'admin') {
    const admins = allLearners().filter((l) => effectiveRole(l) === 'admin');
    if (admins.length <= 1 && admins[0]?.learner_id === target.learner_id) {
      return fail(res, 403, 'FORBIDDEN', 'Promote someone else to admin before demoting the last one.');
    }
  }

  const updated = await setRole(req.params.id, parsed.role);
  if (!updated) return fail(res, 404, 'LEARNER_NOT_FOUND', 'No such account.');
  res.json(publicLearner(updated));
});
