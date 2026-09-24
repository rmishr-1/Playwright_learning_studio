/**
 * Checks a build made for one customer, laid out as installed (see packed.ts). It makes everything
 * it needs with the tests' own key (test-keys.ts): a customer licence with a seal and a logo, and a
 * build for it that does not carry it, as new-customer.bat makes.
 *
 *   npm run test:customer [-- <logo.png>]
 *
 *   - it accepts only that customer's licence: every other one is refused, even a valid one
 *   - without that licence it opens nothing, and its course cannot even be decrypted
 *   - its lessons carry that customer's licence ID as their watermark
 *   - the header shows the customer's logo right of the theme switch
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { machineCode, sign, verify, type Licence } from '../src/licence';
import { decodeAll } from '../src/watermark';
import { build } from '../scripts/build';
import { packedApp } from './packed';
import { testKeys } from './test-keys';
import { keepUserData } from './user-data';

const DESKTOP = path.resolve(__dirname, '..');
const OUT = path.join(DESKTOP, 'test-output');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');

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
  keepUserData(USER, 'QA Practice Training Studio.exe');
  fs.mkdirSync(OUT, { recursive: true });
  const keys = testKeys();
  const logoFile = process.argv[2] ?? path.join(DESKTOP, 'assets', 'icon.png');
  const customer: Licence = {
    id: 'EVK-C0570001',
    licensee: 'Customer Test University',
    email: null,
    issued: '2026-09-24',
    expires: null,
    machine: null,
    product: 'learning-studio',
    logo: 'data:image/png;base64,' + fs.readFileSync(logoFile).toString('base64'),
    seal: crypto.randomBytes(32).toString('hex'),
  };
  const licenceText = JSON.stringify(sign(customer, keys.privateKey));
  const licenceFile = path.join(OUT, 'customer-test.lic');
  fs.writeFileSync(licenceFile, licenceText);
  console.log('Building a copy for ' + customer.licensee + ', sealed to its licence, obfuscated like a release...');
  await build({ release: false, obfuscate: true, licenceFile, carryLicence: false, publicKeyFile: keys.publicKeyFile });
  expect(!fs.existsSync(path.join(DESKTOP, 'build', 'app', 'licence.lic')), 'the build does not carry the licence');
  const exe = await packedApp();
  const launch = () => electron.launch({ executablePath: exe, args: [], timeout: 60_000 });

  // A valid licence, for someone else: this copy is not theirs.
  const otherLicence: Licence = { ...customer, id: 'EVK-0DDC0FFE', licensee: 'Another Customer', logo: null, seal: crypto.randomBytes(32).toString('hex'), machine: machineCode() };
  const other = JSON.stringify(sign(otherLicence, keys.privateKey));
  const verdict = verify(other, keys.publicKey, { onlyId: customer.id, machine: machineCode() });
  expect(!verdict.ok && /not the one this copy was made for/.test(verdict.reason), 'the check refuses other licences', verdict.ok ? '' : verdict.reason);

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

  // The course is sealed: the key built into the app opens it only with this customer's seal.
  const pack = fs.readFileSync(path.join(DESKTOP, 'build', 'app', 'content.pack'));
  const mainJs = fs.readFileSync(path.join(DESKTOP, 'build', 'app', 'main.js'), 'utf-8');
  expect(pack.subarray(0, 4).toString('latin1') === 'SPK1' && !mainJs.includes(customer.seal!), 'the seal is not in the app: it comes only with the licence');

  reset(licenceText);
  app = await launch();
  s = await setupStep(app);
  expect(s.step === 'eula' && (await s.page.textContent('#licensee')) === customer.licensee, 'with its own licence, it shows the agreement', customer.licensee);
  await s.page.check('#agree');
  const opened = app.waitForEvent('window');
  await s.page.click('#accept');
  const page = await opened;
  await page.waitForSelector('text=Week 1', { timeout: 30_000 });
  expect(true, 'with its own licence, the sealed course opens');
  const day = await page.evaluate(() => fetch('/api/course/1/3').then((r) => r.text()));
  const marks = [...new Set(decodeAll(day))];
  expect(marks.length === 1 && marks[0] === customer.id, 'the lessons carry this customer\'s watermark only', marks.join(', '));

  const logo = page.locator('.hdr-customer img');
  await logo.waitFor({ timeout: 10_000 });
  const shown = await logo.evaluate((img: HTMLImageElement) => ({
    width: img.naturalWidth,
    alt: img.alt,
    rightOfTheme:
      img.closest('.hdr-customer')!.getBoundingClientRect().left >= document.querySelector('.app-header .hdr-btn.icon')!.getBoundingClientRect().right,
  }));
  expect(shown.width > 0 && shown.alt === customer.licensee, 'the header shows the customer\'s logo', shown.width + 'px wide, "' + shown.alt + '"');
  expect(shown.rightOfTheme, 'the logo sits right of the theme switch');
  await page.screenshot({ path: path.join(OUT, 'customer-2-course-index.png') });
  await page.goto(new URL(page.url()).origin + '/learn/w1/d3');
  await page.waitForTimeout(2500);
  expect(await logo.isVisible(), 'the logo stays on a lesson page');
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
