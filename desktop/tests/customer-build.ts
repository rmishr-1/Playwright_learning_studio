/**
 * Checks a build made for one customer (`npm run build -- --dev --licence <file>`):
 *
 *   - it opens straight to the agreement, with the licence it carries, and no file to choose
 *   - it refuses any other licence, even a valid one Evoke issued to someone else
 *   - its lessons carry that customer's licence ID as their watermark
 *
 *   npm run test:customer -- licences/<id>-<name>.lic
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron } from 'playwright';
import { machineCode, sign, verify, type LicenceFile } from '../src/licence';
import { decodeAll } from '../src/watermark';

const DESKTOP = path.resolve(__dirname, '..');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');
const ELECTRON = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const PRIVATE_KEY = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

function reset(): void {
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(USER, { recursive: true });
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run test:customer -- <the licence the build was made with>');
  const customer = (JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile).licence;
  const launch = () => electron.launch({ executablePath: ELECTRON, args: [path.join(DESKTOP, 'build', 'app')], timeout: 60_000 });

  reset();
  let app = await launch();
  let page = await app.firstWindow();
  await page.waitForSelector('#product:not(:empty)');
  expect(
    (await page.isVisible('#eula')) && (await page.textContent('#licensee')) === customer.licensee,
    'opens with the licence it carries',
    customer.licensee + ', ' + customer.id,
  );
  await page.check('#agree');
  const opened = app.waitForEvent('window');
  await page.click('#accept');
  page = await opened;
  await page.waitForLoadState('load');
  const day = await page.evaluate(() => fetch('/api/course/1/3').then((r) => r.text()));
  const marks = [...new Set(decodeAll(day))];
  expect(marks.length === 1 && marks[0] === customer.id, 'the lessons carry this customer\'s watermark', marks.join(', '));
  await app.close();

  // A valid licence, for someone else: this copy is not theirs.
  reset();
  const other = sign(
    { id: 'EVK-OTHER001', licensee: 'Another Customer', email: null, issued: '2026-09-24', expires: null, machine: machineCode(), product: 'learning-studio' },
    PRIVATE_KEY,
  );
  fs.writeFileSync(path.join(USER, 'licence.lic'), JSON.stringify(other));
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector('#product:not(:empty)');
  // The built-in licence is still valid, so the copy opens as the customer's, never as the other one.
  const licensee = (await page.isVisible('#eula')) ? await page.textContent('#licensee') : null;
  expect(licensee === customer.licensee, 'another customer\'s licence does not make it theirs', String(licensee));
  await app.close();
  // The check the app makes, with this build's setting: only the customer's licence ID passes.
  const publicKey = fs.readFileSync(path.join(DESKTOP, 'src', 'licence-public.pem'), 'utf-8');
  const verdict = verify(JSON.stringify(other), publicKey, { onlyId: customer.id, machine: machineCode() });
  expect(!verdict.ok && /not the one this copy was made for/.test(verdict.reason), 'a customer\'s copy refuses other licences', verdict.ok ? '' : verdict.reason);

  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed'));
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
