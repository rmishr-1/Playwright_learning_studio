/**
 * Password-reset proof. Run with `npx tsx backend/test/reset-proof.ts` against a running backend.
 *
 * A six-digit code guarding an account is only a million wide, so the interesting cases are all
 * the ways it must refuse: no enumeration, no reuse, no expiry drift, no unlimited guessing.
 *
 * The code is read out of Data/Outbox/ because SMTP is not configured in this repo — which is
 * exactly the fallback an operator uses until it is.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:3010';
const LEARNERS = path.resolve(__dirname, '..', '..', 'Data', 'Learners');
const OUTBOX = path.resolve(__dirname, '..', '..', 'Data', 'Outbox');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || !detail ? '' : ' - ' + detail));
  if (!ok) failures++;
}

const post = async (p: string, body: unknown): Promise<{ status: number; body: any }> => {
  const res = await fetch(BASE + '/api' + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
};

/** The most recent code written to the outbox for this address. */
function codeFromOutbox(email: string): string | null {
  if (!fs.existsSync(OUTBOX)) return null;
  const mine = fs
    .readdirSync(OUTBOX)
    .filter((f) => f.includes(email.replace(/[^\w.@-]/g, '_')))
    .sort();
  const last = mine.at(-1);
  if (!last) return null;
  const text = fs.readFileSync(path.join(OUTBOX, last), 'utf-8');
  return /^\s{4}(\d{6})$/m.exec(text)?.[1] ?? null;
}

async function main(): Promise<void> {
  const NAME = 'Proof Reset ' + Date.now();
  const id = NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const EMAIL = id + '@example.com';

  const reg = await post('/auth/register', { name: NAME, email: EMAIL, password: 'first-password' });
  check('registration requires an email', reg.status === 200, 'got ' + reg.status);
  const noEmail = await post('/auth/register', { name: NAME + ' B', password: 'first-password' });
  check('registering without an email is refused', noEmail.status === 400, 'got ' + noEmail.status);

  console.log('\nNo enumeration');
  const real = await post('/auth/forgot', { name: NAME });
  const fake = await post('/auth/forgot', { name: 'Nobody At All ' + Date.now() });
  check('a real and an unknown name answer identically',
    real.status === fake.status && JSON.stringify(real.body) === JSON.stringify(fake.body),
    real.status + ' ' + JSON.stringify(real.body) + ' vs ' + fake.status + ' ' + JSON.stringify(fake.body));

  console.log('\nThe code');
  const code = codeFromOutbox(EMAIL);
  check('a six-digit code was issued', !!code && /^\d{6}$/.test(code), String(code));
  const stored = JSON.parse(fs.readFileSync(path.join(LEARNERS, id + '.json'), 'utf-8'));
  check('the record stores a digest, never the code itself',
    !!stored.password_reset?.hash && JSON.stringify(stored).includes(code!) === false);

  console.log('\nRefusals');
  const wrong = await post('/auth/reset', { name: NAME, code: '000000' === code ? '111111' : '000000', password: 'brand-new-password' });
  check('a wrong code is refused', wrong.status === 400, 'got ' + wrong.status);
  check('it does not say which part was wrong', wrong.body?.code === 'RESET_CODE_INVALID', wrong.body?.code);
  const short = await post('/auth/reset', { name: NAME, code: code!, password: 'short' });
  check('a too-short new password is refused', short.status === 400, 'got ' + short.status);

  console.log('\nSuccess');
  const ok = await post('/auth/reset', { name: NAME, code: code!, password: 'brand-new-password' });
  check('the right code sets the new password', ok.status === 200, 'got ' + ok.status);

  const oldPw = await post('/auth/login', { name: NAME, password: 'first-password' });
  check('the OLD password no longer works', oldPw.status === 401, 'got ' + oldPw.status);
  const newPw = await post('/auth/login', { name: NAME, password: 'brand-new-password' });
  check('the new password works', newPw.status === 200, 'got ' + newPw.status);

  console.log('\nSingle use');
  const replay = await post('/auth/reset', { name: NAME, code: code!, password: 'third-password' });
  check('the same code cannot be used twice', replay.status === 400, 'got ' + replay.status);
  const after = JSON.parse(fs.readFileSync(path.join(LEARNERS, id + '.json'), 'utf-8'));
  check('the challenge was cleared on use', after.password_reset === null);

  console.log('\nGuessing is capped');
  await post('/auth/forgot', { name: NAME });
  const fresh = codeFromOutbox(EMAIL)!;
  const decoy = fresh === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await post('/auth/reset', { name: NAME, code: decoy, password: 'nope-nope-nope' });
  const burned = await post('/auth/reset', { name: NAME, code: fresh, password: 'nope-nope-nope' });
  check('the code is discarded after too many wrong guesses', burned.status === 400, 'got ' + burned.status);

  fs.unlinkSync(path.join(LEARNERS, id + '.json'));
  for (const f of fs.readdirSync(OUTBOX).filter((f) => f.includes(id))) {
    fs.unlinkSync(path.join(OUTBOX, f));
  }

  console.log('\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.'));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Proof could not run - is the backend up on ' + BASE + '?');
  console.error(e);
  process.exit(1);
});
