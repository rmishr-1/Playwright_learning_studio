/**
 * Auth and RBAC proof. Run with `npx tsx backend/test/auth-proof.ts` against a running backend.
 *
 * Every check here exists because getting it wrong would be invisible: a role that is only
 * enforced in the menu, a demotion that waits for a token to expire, or a learner able to write
 * someone else's progress. It creates its own throwaway accounts and deletes them afterwards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:3010';
const LEARNERS = path.resolve(__dirname, '..', '..', 'Data', 'Learners');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || !detail ? '' : ' - ' + detail));
  if (!ok) failures++;
}

type Session = { cookie: string };

async function call(
  path_: string,
  opts: { method?: string; body?: unknown; session?: Session } = {},
): Promise<{ status: number; body: any; cookie: string | null }> {
  const res = await fetch(BASE + '/api' + path_, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.session ? { Cookie: opts.session.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : null;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, cookie };
}

const rm = (id: string): void => {
  const f = path.join(LEARNERS, id + '.json');
  if (fs.existsSync(f)) fs.unlinkSync(f);
};

async function main(): Promise<void> {
  const STUDENT = 'Proof Student ' + Date.now();
  const STAFF = 'Proof Staff ' + Date.now();
  const studentId = STUDENT.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const staffId = STAFF.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  console.log('Registration and sign-in');
  const email = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@example.com';
  const weak = await call('/auth/register', {
    method: 'POST',
    body: { name: STUDENT, email: email(STUDENT), password: 'short' },
  });
  check('a password under 8 characters is refused', weak.status === 400, 'got ' + weak.status);

  const reg = await call('/auth/register', {
    method: 'POST',
    body: { name: STUDENT, email: email(STUDENT), password: 'correct-horse' },
  });
  check('registering returns a session cookie', reg.status === 200 && !!reg.cookie, 'status ' + reg.status);
  check('the password digest is never returned', reg.body && reg.body.password === undefined);
  check('a new account is a learner', reg.body?.role === 'learner', 'got ' + reg.body?.role);

  const dupe = await call('/auth/register', {
    method: 'POST',
    body: { name: STUDENT, email: email(STUDENT), password: 'another-one' },
  });
  check('the same name cannot register twice', dupe.status === 409, 'got ' + dupe.status);

  const wrong = await call('/auth/login', { method: 'POST', body: { name: STUDENT, password: 'not-it' } });
  check('a wrong password is rejected', wrong.status === 401, 'got ' + wrong.status);

  const good = await call('/auth/login', { method: 'POST', body: { name: STUDENT, password: 'correct-horse' } });
  check('the right password signs in', good.status === 200 && !!good.cookie, 'status ' + good.status);
  const student: Session = { cookie: good.cookie! };

  console.log('\nUnauthenticated access');
  const anon = await call('/course');
  check('course content needs a session', anon.status === 401, 'got ' + anon.status);
  const anonDash = await call('/dashboard');
  check('the dashboard needs a session', anonDash.status === 401, 'got ' + anonDash.status);

  console.log('\nRole gates');
  const learnerDash = await call('/dashboard', { session: student });
  check('a learner is refused the dashboard', learnerDash.status === 403, 'got ' + learnerDash.status);
  const learnerPeople = await call('/people', { session: student });
  check('a learner is refused People', learnerPeople.status === 403, 'got ' + learnerPeople.status);

  const staffReg = await call('/auth/register', {
    method: 'POST',
    body: { name: STAFF, email: email(STAFF), password: 'staff-password' },
  });
  const staff: Session = { cookie: staffReg.cookie! };

  // Promotion needs an admin. The config-pinned admin may not have a password yet, so drive the
  // role change through the store directly - the HTTP guard itself is proven above and below.
  const { setRole } = await import('../src/store');
  await setRole(staffId, 'trainer');

  const trainerDash = await call('/dashboard', { session: staff });
  check('a trainer reaches the dashboard', trainerDash.status === 200, 'got ' + trainerDash.status);
  const trainerPeople = await call('/people', { session: staff });
  check('a trainer is still refused People', trainerPeople.status === 403, 'got ' + trainerPeople.status);

  const meTrainer = await call('/auth/me', { session: staff });
  check('/auth/me reports the trainer verdicts',
    meTrainer.body?.may_see_dashboard === true && meTrainer.body?.may_manage_people === false);

  console.log('\nDemotion takes effect immediately');
  await setRole(staffId, 'learner');
  const afterDemote = await call('/dashboard', { session: staff });
  check(
    'the SAME cookie is refused after demotion, with no re-login',
    afterDemote.status === 403,
    'got ' + afterDemote.status,
  );

  console.log('\nThe acting user comes from the session');
  const before = await call('/learner/me', { session: staff });
  await call('/learner/progress', { method: 'POST', session: student, body: { week: 1, day: 1, part: 2 } });
  const after = await call('/learner/me', { session: staff });
  check(
    "one learner's progress post cannot land on another account",
    JSON.stringify(before.body?.progress) === JSON.stringify(after.body?.progress),
  );
  const mine = await call('/learner/me', { session: student });
  check('it landed on the poster instead', !!mine.body?.progress?.w1d1);

  console.log('\nSigning out');
  const out = await call('/auth/logout', { method: 'POST', session: student });
  check('logout clears the cookie', out.cookie === 'studio_session=');

  const forged: Session = { cookie: 'studio_session=not-a-real-token' };
  const tampered = await call('/auth/me', { session: forged });
  check('a forged token is rejected', tampered.status === 401, 'got ' + tampered.status);

  rm(studentId);
  rm(staffId);

  console.log('\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.'));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Proof could not run - is the backend up on ' + BASE + '?');
  console.error(e);
  process.exit(1);
});
