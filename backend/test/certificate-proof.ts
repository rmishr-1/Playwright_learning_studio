/**
 * Certificate proof. Run with `npx tsx backend/test/certificate-proof.ts` against a running
 * backend.
 *
 * The certificate is for the WHOLE course, so the interesting cases are the two ends: someone
 * part-way through must be refused, and someone who has finished must get a real PDF with a
 * date that does not move afterwards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:3010';
const LEARNERS = path.resolve(__dirname, '..', '..', 'Data', 'Learners');
const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || !detail ? '' : ' - ' + detail));
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const NAME = 'Proof Graduate ' + Date.now();
  const id = NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const reg = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NAME, email: id + '@example.com', password: 'graduate-password' }),
  });
  const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];
  const get = (p: string): Promise<Response> => fetch(BASE + '/api' + p, { headers: { Cookie: cookie } });
  type Status = { earned: boolean; completed: number; total: number; issued_at: string | null };
  const status = async (): Promise<Status> => (await (await get('/certificate')).json()) as Status;

  console.log('Part-way through');
  const early = await status();
  check('a brand-new account has not earned it', early.earned === false);
  check('it reports the whole course as the target', early.total === 38, 'total ' + early.total);
  const earlyHtml = await get('/certificate/view.html');
  check('the HTML is refused until earned', earlyHtml.status === 403, 'got ' + earlyHtml.status);
  const earlyPdf = await get('/certificate/certificate.pdf');
  check('the PDF is refused until earned', earlyPdf.status === 403, 'got ' + earlyPdf.status);

  console.log('\nEvery day complete');
  // Mark all 38 days complete directly in the record - driving 152 part views over HTTP would
  // prove the progress endpoint, which auth-proof already covers, not the certificate.
  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'course-index.json'), 'utf-8'));
  const file = path.join(LEARNERS, id + '.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  for (const w of index.weeks) {
    for (const d of w.days) {
      record.progress['w' + w.week + 'd' + d.day] = {
        parts_viewed: [1, 2, 3, 4],
        completed: true,
        attempted_problems: [],
        first_opened_at: now,
        completed_at: now,
      };
    }
  }
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');

  const earned = await status();
  check('it is now earned', earned.earned === true);
  check('completed equals the total', earned.completed === earned.total, earned.completed + '/' + earned.total);

  const html = await get('/certificate/view.html');
  const markup = await html.text();
  check('the HTML renders', html.status === 200, 'got ' + html.status);
  check('it names the learner', markup.includes(NAME));
  check('it is issued by Evoke Technologies', markup.includes('Evoke Technologies Private Limited'));
  check('it says congratulations', /Congratulations/i.test(markup));

  const pdfRes = await get('/certificate/certificate.pdf');
  const pdf = Buffer.from(await pdfRes.arrayBuffer());
  check('the PDF renders', pdfRes.status === 200, 'got ' + pdfRes.status);
  check('it really is a PDF', pdf.subarray(0, 5).toString() === '%PDF-', pdf.subarray(0, 8).toString());
  check('it is not an empty file', pdf.length > 5000, pdf.length + ' bytes');

  console.log('\nThe issue date is stamped once');
  const first = (await status()).issued_at;
  check('an issue date was recorded', typeof first === 'string' && first.length > 0);
  await get('/certificate/view.html');
  const second = (await status()).issued_at;
  check('it does not move on a later request', first === second, first + ' vs ' + second);

  fs.unlinkSync(file);
  console.log('\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.'));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Proof could not run - is the backend up on ' + BASE + '?');
  console.error(e);
  process.exit(1);
});
