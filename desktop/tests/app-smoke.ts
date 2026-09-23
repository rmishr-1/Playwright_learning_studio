/**
 * Drives the built app (desktop/build/app, from `npm run build -- --dev`) end to end with
 * Playwright's Electron support:
 *
 *   - the licence screen: no licence, a changed licence, an expired one, one for another computer
 *   - the licence agreement, then the studio itself
 *   - the API refuses anyone without the window's token
 *   - the course is watermarked, the fonts are the app's own, the page renders
 *   - the Terminal runs the bundled Node, and Check my answer passes a model answer in all three
 *     bundled browsers
 *
 *   npm run test:app     (in desktop/; uses the learner's real app data folder, and empties it)
 *
 * Build with `npm run build -- --dev --obfuscate` to test the release's obfuscated code.
 *
 * A release build cannot be driven this way: its fuses refuse the debugger connection Playwright
 * uses. tests/release-checks.ts checks the packaged app from the outside instead.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { machineCode, sign, type Licence } from '../src/licence';
import { decodeAll } from '../src/watermark';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'test-output');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');
const ELECTRON = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const PRIVATE_KEY = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

function licence(over: Partial<Licence> = {}): Licence {
  return {
    id: 'EVK-TEST0001',
    licensee: 'Smoke Test Ltd',
    email: null,
    issued: '2026-09-24',
    expires: null,
    machine: null,
    product: 'learning-studio',
    ...over,
  };
}

function reset(licenceText: string | null): void {
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(USER, { recursive: true });
  if (licenceText !== null) fs.writeFileSync(path.join(USER, 'licence.lic'), licenceText);
}

const launch = (): Promise<ElectronApplication> =>
  electron.launch({ executablePath: ELECTRON, args: [path.join(DESKTOP, 'build', 'app')], timeout: 60_000 });

async function setupScreen(name: string, text: string | null): Promise<{ step: string; reason: string }> {
  reset(text);
  const app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector('#machine:not(:empty)');
  const step = (await page.isVisible('#licence')) ? 'licence' : 'eula';
  const reason = (await page.isVisible('#reason')) ? await page.textContent('#reason') ?? '' : '';
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await app.close();
  return { step, reason };
}

/** Runs one Terminal command through the API, as the page does, and returns its output. */
async function terminal(page: Page, command: string, workspace: string): Promise<{ code: number | null; out: string }> {
  return page.evaluate(
    async ({ command, workspace }) => {
      const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
      const ws = new WebSocket('ws://' + location.host + '/api/run/' + run_id + '/stream');
      await new Promise((r) => (ws.onopen = r));
      let out = '';
      const done = new Promise<{ code: number | null; out: string }>((resolve) => {
        ws.onmessage = (m) => {
          const e = JSON.parse(m.data as string) as { event: string; data?: string; code?: number | null };
          if (e.event === 'term') out += e.data;
          if (e.event === 'exit') resolve({ code: e.code ?? null, out });
        };
      });
      await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id, command, code: '', file: null, workspace }),
      });
      return done;
    },
    { command, workspace },
  );
}

/** The model answer of exercise N of a course day, from the course source. */
function solution(dayNumber: number, exercise: number): string {
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'Data', 'Source', 'course', 'json', 'day' + dayNumber + '.json'), 'utf-8')) as {
    sections: { lessons: { blocks: { type: string; solution?: string }[] }[] }[];
  };
  const exercises = day.sections.flatMap((s) => s.lessons.flatMap((l) => l.blocks.filter((b) => b.type === 'exercise')));
  return exercises[exercise - 1].solution ?? '';
}

async function checkAnswer(page: Page, week: number, day: number, dayNumber: number, problemNumber: number) {
  return page.evaluate(
    async ({ week, day, problemNumber, code }) => {
      const d = (await (await fetch('/api/course/' + week + '/' + day)).json()) as {
        workspace: string;
        parts: { part: number; problems: { number: number }[] }[];
      };
      const part = d.parts.find((p) => p.problems.some((q) => q.number === problemNumber))!;
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, day, part: part.part, problem: problemNumber, code, workspace: d.workspace }),
      });
      return (await res.json()) as { status: string; message: string; output: string | null };
    },
    { week, day, problemNumber, code: solution(dayNumber, problemNumber) },
  );
}

async function main(): Promise<void> {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const machine = machineCode();

  console.log('Licence screen');
  let s = await setupScreen('1-no-licence', null);
  expect(s.step === 'licence' && s.reason === '', 'no licence: asks for one');

  const tampered = sign(licence(), PRIVATE_KEY);
  tampered.licence.licensee = 'Someone Else';
  s = await setupScreen('2-changed-licence', JSON.stringify(tampered));
  expect(s.step === 'licence' && /not valid/.test(s.reason), 'a changed licence is refused', s.reason);

  s = await setupScreen('3-expired-licence', JSON.stringify(sign(licence({ expires: '2020-01-01' }), PRIVATE_KEY)));
  expect(s.step === 'licence' && /expired/.test(s.reason), 'an expired licence is refused', s.reason);

  s = await setupScreen('4-other-computer', JSON.stringify(sign(licence({ machine: '0000-0000-0000-0000' }), PRIVATE_KEY)));
  expect(s.step === 'licence' && /different computer/.test(s.reason), 'a licence for another computer is refused', s.reason);

  console.log('\nAgreement and studio');
  reset(JSON.stringify(sign(licence({ machine }), PRIVATE_KEY)));
  const app = await launch();
  const setup = await app.firstWindow();
  await setup.waitForSelector('#eula:not([hidden])');
  expect((await setup.textContent('#licensee')) === 'Smoke Test Ltd', 'a licence for this computer is accepted, and the agreement shown');
  expect(await setup.isDisabled('#accept'), 'Accept waits for the tick box');
  await setup.screenshot({ path: path.join(OUT, '5-agreement.png') });
  await setup.check('#agree');
  const studioOpened = app.waitForEvent('window');
  await setup.click('#accept');
  const page = await studioOpened;
  await page.waitForLoadState('load');
  const origin = new URL(page.url()).origin;
  expect(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'the studio opens from its own local server', origin);
  const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getTitle()).join(' | '));
  expect(title.includes('Licensed to Smoke Test Ltd'), 'the window names the licensee', title);
  await page.waitForSelector('text=Week 1', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '6-course.png') });

  console.log('\nThe API is closed to everything but the window');
  for (const p of ['/api/course', '/', '/api/course/1/1', '/api/progress']) {
    const status = (await fetch(origin + p)).status;
    expect(status === 401, 'without the token, ' + p + ' is refused', String(status));
  }
  const forged = (await fetch(origin + '/api/course', { headers: { cookie: 'studio_token=' + 'a'.repeat(64) } })).status;
  expect(forged === 401, 'a made-up token is refused', String(forged));
  const inside = await page.evaluate(() => fetch('/api/course').then((r) => r.status));
  expect(inside === 200, 'the window itself can read the course', String(inside));

  console.log('\nThe page');
  // Each family loads from the app itself: load() finds no face for a family the page lacks.
  const fonts = await page.evaluate(() =>
    Promise.all(['IBM Plex Sans', 'IBM Plex Mono', 'Source Serif 4'].map((f) => document.fonts.load('600 16px "' + f + '"').then((faces) => faces.length > 0))),
  );
  expect(fonts.every(Boolean), 'the fonts are the app\'s own, with no internet', fonts.join(','));
  const googleRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /googleapis|gstatic/.test(e.name)).length);
  expect(googleRequests === 0, 'nothing is fetched from Google Fonts');
  const dayJson = await page.evaluate(() => fetch('/api/course/1/3').then((r) => r.text()));
  const marks = decodeAll(dayJson);
  expect(marks.length > 0 && marks.every((m) => m === 'EVK-INTERNAL'), 'lesson text carries the build\'s watermark', marks.length + ' marks');
  await page.goto(origin + '/learn/w1/d3');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '7-day3.png') });

  console.log('\nThe Terminal, on the bundled Node and browsers');
  const version = await terminal(page, 'node --version', 'project');
  expect(version.out.includes('v24.21.0'), 'node --version is the bundled Node', version.out.trim());
  const npm = await terminal(page, 'npm --version', 'project');
  expect(/\d+\.\d+\.\d+/.test(npm.out) && !npm.out.includes('unknown'), 'npm --version works', npm.out.trim());
  const run = await page.evaluate(async () => {
    const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
    const code = "const { browser, page } = await launch();\nawait page.setContent('<h1>Hello</h1>');\nconsole.log(await page.textContent('h1'));\nawait show(page);\nawait browser.close();";
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id, week: 1, day: 3, part: 1, code }),
    });
    return (await res.json()) as { status: string; stdout: string; screenshot: string | null };
  });
  expect(run.status === 'ok' && run.stdout === 'Hello' && !!run.screenshot, 'the editor\'s Run opens Chromium and takes a screenshot', run.status + ', ' + run.stdout);
  const cart = await checkAnswer(page, 1, 5, 5, 3);
  expect(cart.status === 'passed', 'Check my answer passes Day 5 exercise 3 (node)', cart.message);
  const logout = await checkAnswer(page, 2, 4, 9, 1);
  expect(logout.status === 'passed', 'Check my answer passes Day 9 exercise 1 (tests in 3 browsers)', logout.message);
  const tests = await terminal(page, 'npx playwright test tests/day9/logout.spec.ts', 'project');
  const passedLine = /(\d+) passed/.exec(tests.out.replace(/\x1b\[[0-9;]*m/g, ''))?.[0] ?? '';
  expect(tests.code === 0 && passedLine === '3 passed', 'the test runs in Chromium, Firefox and WebKit', passedLine);
  // show-report opens the report as the page does: window.open on the studio's own address.
  const reportOpened = app.waitForEvent('window');
  await page.evaluate(() => void window.open('/api/terminal/report/index.html', '_blank', 'noopener'));
  const report = await reportOpened;
  await report.waitForLoadState('load');
  await report.waitForTimeout(1500);
  const reportText = (await report.textContent('body')) ?? '';
  expect(/logout|passed/i.test(reportText), 'the HTML report opens in an app window', report.url());
  await report.screenshot({ path: path.join(OUT, '8-report.png') });
  // Recorded instead of really opening the learner's browser.
  await app.evaluate(({ shell }) => {
    (globalThis as { opened?: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });
  const blocked = await page.evaluate(() => window.open('https://playwright.dev/docs/intro', '_blank') === null);
  const opened = await app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
  expect(blocked && opened[0] === 'https://playwright.dev/docs/intro', 'a link to another site opens in the learner\'s browser, not the app', opened.join());

  await app.close();
  const workspace = path.join(USER, 'Workspace', 'project', 'tests', 'day9', 'logout.spec.ts');
  expect(fs.existsSync(workspace), 'the learner\'s files are kept in the app data folder');

  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '. Screenshots: ' + OUT);
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
