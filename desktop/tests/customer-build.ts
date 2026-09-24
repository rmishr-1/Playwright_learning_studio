/**
 * Checks a build made for one customer, laid out as installed (see packed.ts):
 *
 *   npm run build -- --dev --obfuscate --licence <file> [--no-carry]
 *   npm run test:customer -- <file>
 *
 *   - it accepts only that customer's licence: every other one is refused, even a valid one Evoke
 *     issued to someone else
 *   - a build that carries the licence opens straight to the agreement; one that does not (the
 *     zip new-customer.bat makes) asks for it, and opens nothing until it is the right one
 *   - its lessons carry that customer's licence ID as their watermark
 *   - when the licence carries a logo, the header shows it right of the theme switch
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { machineCode, sign, verify, type LicenceFile } from '../src/licence';
import { decodeAll } from '../src/watermark';
import { packedApp } from './packed';
import { keepUserData } from './user-data';

const DESKTOP = path.resolve(__dirname, '..');
const OUT = path.join(DESKTOP, 'test-output');
// The app keeps its data under its product name. A test build may be given another name, to
// run beside an installed copy.
const PRODUCT = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'build', 'app', 'package.json'), 'utf-8')) as { productName: string }).productName;
const USER = path.join(process.env.APPDATA!, PRODUCT);
const PRIVATE_KEY = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

function reset(licenceText: string | null): void {
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(USER, { recursive: true });
  if (licenceText !== null) fs.writeFileSync(path.join(USER, 'licence.lic'), licenceText);
}

async function setupStep(app: ElectronApplication): Promise<{ page: Page; step: string; reason: string }> {
  const page = await app.firstWindow();
  await page.waitForSelector('#product:not(:empty)');
  const step = (await page.isVisible('#eula')) ? 'eula' : 'licence';
  const reason = (await page.isVisible('#reason')) ? ((await page.textContent('#reason')) ?? '') : '';
  return { page, step, reason };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run test:customer -- <the licence the build was made with>');
  fs.mkdirSync(OUT, { recursive: true });
  keepUserData(USER, 'QA Practice Training Studio.exe');
  const text = fs.readFileSync(file, 'utf-8');
  const customer = (JSON.parse(text) as LicenceFile).licence;
  const carried = fs.existsSync(path.join(DESKTOP, 'build', 'app', 'licence.lic'));
  const exe = await packedApp();
  const launch = () => electron.launch({ executablePath: exe, args: [], timeout: 60_000 });
  console.log('A build for ' + customer.licensee + ' (' + customer.id + '), ' + (carried ? 'carrying' : 'not carrying') + ' the licence');

  // A valid licence, for someone else: this copy is not theirs.
  const other = JSON.stringify(
    sign({ id: 'EVK-0DDC0FFE', licensee: 'Another Customer', email: null, issued: '2026-09-24', expires: null, machine: machineCode(), product: 'learning-studio' }, PRIVATE_KEY),
  );
  const publicKey = fs.readFileSync(path.join(DESKTOP, 'src', 'licence-public.pem'), 'utf-8');
  const verdict = verify(other, publicKey, { onlyId: customer.id, machine: machineCode() });
  expect(!verdict.ok && /not the one this copy was made for/.test(verdict.reason), 'the check refuses other licences', verdict.ok ? '' : verdict.reason);

  if (!carried) {
    reset(null);
    let app = await launch();
    let s = await setupStep(app);
    expect(s.step === 'licence', 'with no licence, it asks for one and opens nothing');
    await app.close();
    reset(other);
    app = await launch();
    s = await setupStep(app);
    expect(s.step === 'licence' && /not the one this copy was made for/.test(s.reason), 'another customer\'s valid licence is refused', s.reason);
    await s.page.screenshot({ path: path.join(OUT, 'customer-1-other-licence.png') });
    await app.close();
  } else {
    reset(other);
    const app = await launch();
    const s = await setupStep(app);
    const licensee = s.step === 'eula' ? await s.page.textContent('#licensee') : null;
    expect(licensee === customer.licensee, 'another customer\'s licence does not make it theirs', String(licensee));
    await app.close();
  }

  reset(carried ? null : text);
  const app = await launch();
  const s = await setupStep(app);
  expect(s.step === 'eula' && (await s.page.textContent('#licensee')) === customer.licensee, 'with its own licence, it shows the agreement', customer.licensee);
  await s.page.check('#agree');
  const opened = app.waitForEvent('window');
  await s.page.click('#accept');
  const page = await opened;
  await page.waitForSelector('text=Week 1', { timeout: 30_000 });
  const day = await page.evaluate(() => fetch('/api/course/1/3').then((r) => r.text()));
  const marks = [...new Set(decodeAll(day))];
  expect(marks.length === 1 && marks[0] === customer.id, 'the lessons carry this customer\'s watermark', marks.join(', '));

  const logo = page.locator('.hdr-customer img');
  if (customer.logo) {
    await logo.waitFor({ timeout: 10_000 });
    const shown = await logo.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      alt: img.alt,
      rightOfTheme:
        img.closest('.hdr-customer')!.getBoundingClientRect().left >=
        document.querySelector('.app-header .hdr-btn.icon')!.getBoundingClientRect().right,
    }));
    expect(shown.width > 0 && shown.alt === customer.licensee, 'the header shows the customer\'s logo', shown.width + 'px wide, "' + shown.alt + '"');
    expect(shown.rightOfTheme, 'the logo sits right of the theme switch');
    await page.screenshot({ path: path.join(OUT, 'customer-2-course-index.png') });
    await page.goto(new URL(page.url()).origin + '/learn/w1/d3');
    await page.waitForTimeout(2500);
    expect(await logo.isVisible(), 'the logo stays on a lesson page');
  } else {
    expect((await logo.count()) === 0, 'no licence logo, no logo in the header');
  }
  await page.screenshot({ path: path.join(OUT, 'customer-3-lesson.png') });
  await app.close();

  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '. Screenshots: ' + OUT);
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
