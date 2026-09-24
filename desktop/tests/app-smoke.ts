/**
 * Builds the app with the release's obfuscation and the tests' own licence key (test-keys.ts), lays
 * it out as installed - packed into app.asar, with the release's fuses (packed.ts) - and drives it
 * end to end with Playwright's Electron support:
 *
 *   - the licence screen: no licence, a changed licence, an expired one, one for another computer
 *   - the licence agreement, then the studio itself
 *   - the API refuses anyone without the window's token, keeps nothing in any cache, and the page
 *     has its Content Security Policy; nothing the page asks for leaves the computer
 *   - the course is watermarked with the licence in use, the fonts are the app's own
 *   - the Terminal runs the bundled Node, its live view arrives, Check my answer passes model
 *     answers in all three bundled browsers, and the test report is served apart from the studio
 *
 *   npm run test:app     (in desktop/; moves the app's data folder aside, and puts it back)
 *
 * A release build cannot be driven this way: its fuses refuse the debugger connection Playwright
 * uses. tests/release-checks.ts checks the packaged app from the outside instead.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { machineCode, sign, type Licence } from '../src/licence';
import { decodeAll } from '../src/watermark';
import { build } from '../scripts/build';
import { packedApp } from './packed';
import { testKeys } from './test-keys';
import { keepUserData } from './user-data';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'test-output');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');
let PRIVATE_KEY = '';

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

function licence(over: Partial<Licence> = {}): Licence {
  return {
    id: 'EVK-7E570001',
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

let EXE = '';
const launch = (): Promise<ElectronApplication> => electron.launch({ executablePath: EXE, args: [], timeout: 60_000 });

async function setupScreen(name: string, text: string | null): Promise<{ step: string; reason: string }> {
  reset(text);
  const app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector('#product:not(:empty)');
  const step = (await page.isVisible('#licence')) ? 'licence' : 'eula';
  const reason = (await page.isVisible('#reason')) ? ((await page.textContent('#reason')) ?? '') : '';
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await app.close();
  return { step, reason };
}

type TermResult = { code: number | null; out: string; frames: number; openUrl: string | null };

/** Runs one Terminal command through the API, as the page does, and returns what it streamed. */
async function terminal(page: Page, command: string, workspace: string): Promise<TermResult> {
  return page.evaluate(
    async ({ command, workspace }) => {
      const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
      const ws = new WebSocket('ws://' + location.host + '/api/run/' + run_id + '/stream');
      await new Promise((r) => (ws.onopen = r));
      let out = '';
      let frames = 0;
      const done = new Promise<TermResult>((resolve) => {
        ws.onmessage = (m) => {
          const e = JSON.parse(m.data as string) as { event: string; data?: string; code?: number | null; open_url?: string };
          if (e.event === 'term') out += e.data;
          if (e.event === 'frame') frames++;
          if (e.event === 'exit') resolve({ code: e.code ?? null, out, frames, openUrl: e.open_url ?? null });
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

/** A plain request with a Host header of our choosing (fetch does not allow one). */
function get(url: string, host?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, headers: host ? { host } : {} }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<void> {
  keepUserData(USER, 'QA Practice Training Studio.exe');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const keys = testKeys();
  PRIVATE_KEY = keys.privateKey;
  console.log('Building the app with the tests\' key, obfuscated like a release...');
  await build({ release: false, obfuscate: true, licenceFile: null, publicKeyFile: keys.publicKeyFile });
  EXE = await packedApp();
  const machine = machineCode();

  console.log('\nLicence screen');
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

  // A clock turned back does not bring an expired licence back: the app remembers the latest day.
  reset(JSON.stringify(sign(licence({ expires: '2099-01-01' }), PRIVATE_KEY)));
  fs.writeFileSync(path.join(USER, 'last-seen.json'), JSON.stringify({ day: '2099-06-01' }));
  let app = await launch();
  let first = await app.firstWindow();
  await first.waitForSelector('#product:not(:empty)');
  const rolled = (await first.isVisible('#reason')) ? await first.textContent('#reason') : '';
  expect(/expired/.test(rolled ?? ''), 'turning the clock back does not revive an expired licence', rolled ?? '');
  await app.close();

  console.log('\nAgreement and studio');
  reset(JSON.stringify(sign(licence({ machine }), PRIVATE_KEY)));
  app = await launch();
  const setup = await app.firstWindow();
  await setup.waitForSelector('#eula:not([hidden])');
  expect((await setup.textContent('#licensee')) === 'Smoke Test Ltd', 'a licence for this computer is accepted, and the agreement shown');
  expect(await setup.isDisabled('#accept'), 'Accept waits for the tick box');
  expect(setup.url() === 'studio://app/setup.html', 'the setup page is served by the app itself', setup.url());
  const ipc = await app.evaluate(async ({ ipcMain }) => ipcMain.listenerCount('setup:accept') >= 0);
  expect(ipc, 'the setup window has its handlers');
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
  const badCookie = (await fetch(origin + '/api/course', { headers: { cookie: 'studio_token=%' } })).status;
  expect(badCookie === 401, 'a malformed cookie is refused, not an error', String(badCookie));
  const rebound = await get(origin + '/api/course', 'attacker.example:' + new URL(origin).port);
  expect(rebound.status === 401, 'another host name (DNS rebinding) is refused', String(rebound.status));
  const inside = await page.evaluate(() => fetch('/api/course').then((r) => ({ status: r.status, cache: r.headers.get('cache-control') })));
  expect(inside.status === 200, 'the window itself can read the course', String(inside.status));
  expect(inside.cache === 'no-store', 'nothing the API sends is cached', String(inside.cache));
  const csp = await page.evaluate(() => fetch('/').then((r) => r.headers.get('content-security-policy') ?? ''));
  expect(/script-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp), 'the page has its Content Security Policy');
  const outside = await page.evaluate(() => fetch('https://example.com/').then(() => 'reached', () => 'blocked'));
  expect(outside === 'blocked', 'the page cannot reach anything outside the app', outside);

  console.log('\nThe page');
  // Each family loads from the app itself: load() finds no face for a family the page lacks.
  const fonts = await page.evaluate(() =>
    Promise.all(['IBM Plex Sans', 'IBM Plex Mono', 'Source Serif 4'].map((f) => document.fonts.load('600 16px "' + f + '"').then((faces) => faces.length > 0))),
  );
  expect(fonts.every(Boolean), 'the fonts are the app\'s own, with no internet', fonts.join(','));
  const dayJson = await page.evaluate(() => fetch('/api/course/1/3').then((r) => r.text()));
  const marks = new Set(decodeAll(dayJson));
  expect(marks.has('EVK-7E570001'), 'lessons carry the watermark of the licence in use', [...marks].join(', '));
  await page.goto(origin + '/learn/w1/d3');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '7-day3.png') });
  // A day with a diagram: Mermaid renders under the Content Security Policy.
  await page.goto(origin + '/learn/w1/d1/p1');
  const svg = await page.waitForSelector('.mermaid svg, .diagram svg', { timeout: 20_000 }).then(() => true, () => false);
  expect(svg, 'diagrams render under the Content Security Policy');

  console.log('\nThe Terminal, on the bundled Node and browsers');
  const version = await terminal(page, 'node --version', 'project');
  expect(version.out.includes('v24.21.0'), 'node --version is the bundled Node', version.out.trim());
  const npm = await terminal(page, 'npm --version', 'project');
  expect(/\d+\.\d+\.\d+/.test(npm.out) && !npm.out.includes('unknown'), 'npm --version works', npm.out.trim());
  const run = await page.evaluate(async () => {
    const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
    const code =
      "const { browser, page } = await launch();\nawait page.setContent('<h1>Hello</h1>');\nconsole.log(await page.textContent('h1'));\n" +
      "console.log(Object.keys(process.env).filter((k) => /TOKEN|STUDIO_TOKEN|ELECTRON|NODE_ENV/.test(k)).join(',') || 'clean');\nawait show(page);\nawait browser.close();";
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id, week: 1, day: 3, part: 1, code }),
    });
    return (await res.json()) as { status: string; stdout: string; screenshot: string | null };
  });
  expect(run.status === 'ok' && run.stdout.startsWith('Hello') && !!run.screenshot, 'the editor\'s Run opens Chromium and takes a screenshot', run.status + ', ' + run.stdout.split('\n')[0]);
  expect(run.stdout.endsWith('clean'), 'the learner\'s code gets no secrets from the app\'s environment', run.stdout.split('\n').pop());
  const typed = await page.evaluate(async () => {
    const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
    const code = 'class P { constructor(private readonly n: number) {} get twice(): number { return this.n * 2; } }\nconsole.log(new P(21).twice);';
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id, week: 1, day: 3, part: 1, code }) });
    return (await res.json()) as { status: string; stdout: string };
  });
  expect(typed.stdout.includes('42'), 'a Run transpiles TypeScript in its own process', typed.status + ', ' + typed.stdout);
  const cart = await checkAnswer(page, 1, 5, 5, 3);
  expect(cart.status === 'passed', 'Check my answer passes Day 5 exercise 3 (node)', cart.message);
  const logout = await checkAnswer(page, 2, 4, 9, 1);
  expect(logout.status === 'passed', 'Check my answer passes Day 9 exercise 1 (tests in 3 browsers)', logout.message);
  const tests = await terminal(page, 'npx playwright test tests/day9/logout.spec.ts', 'project');
  const passedLine = /(\d+) passed/.exec(tests.out.replace(/\x1b\[[0-9;]*m/g, ''))?.[0] ?? '';
  expect(tests.code === 0 && passedLine === '3 passed', 'the test runs in Chromium, Firefox and WebKit', passedLine);
  expect(tests.frames > 0, 'the live view arrives, with the command\'s own frame key', tests.frames + ' frames');
  const stranger = await fetch(origin + '/api/terminal/00000000-0000-4000-8000-000000000000/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Studio-Frame-Key': 'guess' },
    body: '{"data":"x"}',
  });
  expect(stranger.status === 410, 'a frame without the running command\'s key is dropped', String(stranger.status));

  // show-report: the report is served by a server of its own, and opens in the learner's browser.
  await app.evaluate(({ shell }) => {
    (globalThis as { opened?: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });
  const show = await terminal(page, 'npx playwright show-report', 'project');
  const reportUrl = show.openUrl ?? '';
  expect(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/.test(reportUrl) && !reportUrl.startsWith(origin), 'the report is served apart from the studio', reportUrl);
  await page.evaluate((url) => void window.open(url, '_blank', 'noopener'), reportUrl);
  await page.waitForTimeout(500);
  let opened = await app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
  expect(opened.includes(reportUrl), 'the report opens in the learner\'s browser, not with the studio\'s rights');
  const report = await get(reportUrl);
  expect(report.status === 200 && /Playwright Test Report/i.test(report.body), 'the report server serves the report', String(report.status));
  const noApi = await get(reportUrl.replace('/index.html', '/api/course'));
  expect(noApi.status === 404, 'the report server has no API', String(noApi.status));
  await page.evaluate(() => void window.open('https://playwright.dev/docs/intro', '_blank'));
  await page.waitForTimeout(500);
  opened = await app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
  expect(opened.includes('https://playwright.dev/docs/intro'), 'a link to another site opens in the learner\'s browser, not the app');

  await app.close();
  const workspace = path.join(USER, 'Workspace', 'project', 'tests', 'day9', 'logout.spec.ts');
  expect(fs.existsSync(workspace), 'the learner\'s files are kept in the app data folder');
  const cacheDir = path.join(USER, 'Cache', 'Cache_Data');
  const cached = fs.existsSync(cacheDir)
    ? fs.readdirSync(cacheDir).filter((f) => fs.readFileSync(path.join(cacheDir, f)).includes('course-day/v2'))
    : [];
  expect(cached.length === 0, 'no lesson is left on disk in the browser cache', cached.join(', '));

  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '. Screenshots: ' + OUT);
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
