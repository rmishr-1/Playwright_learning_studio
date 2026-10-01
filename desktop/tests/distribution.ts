/**
 * The studio as it now ships: an app with no course and no studio code in it, which downloads both
 * at every start. Built with the tests' own key and app secret, laid out as installed (packed.ts),
 * published to a folder with the real publisher (publish.ts), and served by a stand-in for GitHub
 * (fake-raw.ts) that can misbehave:
 *
 *   - a start downloads, opens and runs the studio; the first start tags no day
 *   - no internet: the launch window says so, and Retry opens the studio once it is back
 *   - GitHub busy (429), a damaged download, a licence with no grant: each said plainly
 *   - a course update: the next start serves it, and the changed day is tagged
 *   - a licence withdrawn after the app was built: refused once the release lists it
 *   - a course that needs a newer studio: "install the new version"
 *   - after quitting, no course text is anywhere in the app's data or the temporary folder
 *   - a standard build (no Node or browsers in it): a damaged runtime download is refused; then its
 *     first start downloads the official archives (served locally) with progress, and the Terminal's
 *     Node and all three browsers run; the next start downloads nothing
 *
 *   npm run test:distribution     (in desktop/; moves the app's data folder aside, and puts it back)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { fingerprint, machineCode, sign, type Licence } from '../src/licence';
import { appSecret, seedOf, unpackContainer } from '../src/release-format';
import { build, buildBundle, BUNDLE_FILE, runPrefix } from '../scripts/build';
import { contentFiles } from '../scripts/content-files';
import { publishInto, type PublishContext } from '../scripts/publish';
import { packedApp } from './packed';
import { testKeys } from './test-keys';
import { keepUserData } from './user-data';
import { internalVariant } from '../scripts/variants';
import { fakeRaw } from './fake-raw';
import { ARCHIVES } from '../scripts/runtime';

const DESKTOP = path.resolve(__dirname, '..');
const OUT = path.join(DESKTOP, 'test-output', 'distribution');
const VARIANT = internalVariant();
const USER = path.join(process.env.APPDATA!, VARIANT.name);
/** Where a standard build keeps what its first start downloaded (src/env.ts RUNTIME_DIR). */
const LOCAL = path.join(process.env.LOCALAPPDATA!, VARIANT.name);
const RUNTIME = path.join(LOCAL, 'runtime');

type TermResult = { code: number | null; out: string };

/** Runs one Terminal command through the API, as the page does, and returns what it printed. */
async function terminal(page: Page, command: string, workspace: string): Promise<TermResult> {
  return page.evaluate(
    async ({ command, workspace }) => {
      const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
      const ws = new WebSocket('ws://' + location.host + '/api/run/' + run_id + '/stream');
      await new Promise((r) => (ws.onopen = r));
      let out = '';
      const done = new Promise<TermResult>((resolve) => {
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

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

/** Every file under a folder, for the scan for course text. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [];
    return e.isDirectory() ? filesUnder(full) : [full];
  });
}

async function main(): Promise<void> {
  keepUserData(USER, VARIANT.name + '.exe');
  // A standard build's Node and browsers, which a real installed copy may have there too.
  keepUserData(LOCAL, VARIANT.name + '.exe');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const keys = testKeys();
  const secret = appSecret(seedOf(keys.privateKey));

  console.log('Building the app (no course in it) and the studio bundle, with the tests\' key...');
  await build({ release: false, obfuscate: true, licenceFile: null, publicKeyFile: keys.publicKeyFile, appSecret: secret });
  await buildBundle({ release: false, obfuscate: true, version: 1 });
  const exe = await packedApp();

  // The licences, as the publisher sees them.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-dist-test-'));
  const licences = path.join(work, 'licences');
  fs.mkdirSync(licences);
  const machine = machineCode();
  const make = (id: string, name: string): { licence: Licence; text: string } => {
    const licence: Licence = {
      id,
      licensee: 'Distribution Test ' + name,
      email: null,
      issued: '2026-09-24',
      expires: null,
      machine,
      product: 'learning-studio',
      seal: crypto.randomBytes(32).toString('hex'),
      serial: crypto.randomBytes(8).toString('hex'),
    };
    const text = JSON.stringify(sign(licence, keys.privateKey));
    return { licence, text };
  };
  const granted = make('EVK-D15700A1', 'A');
  const stranger = make('EVK-D15700B2', 'B');
  fs.writeFileSync(path.join(licences, granted.licence.id + '-test.lic'), granted.text);
  const ctx = (revoked: string[] = []): PublishContext => ({
    privateKeyPem: keys.privateKey,
    publicKeyPem: keys.publicKey,
    licencesDir: licences,
    seals: { [granted.licence.id]: { licensee: granted.licence.licensee, seal: granted.licence.seal! } },
    revoked,
    today: new Date().toISOString().slice(0, 10),
  });

  const dist = path.join(work, 'dist');
  const course = contentFiles();
  publishInto(path.join(dist, 'app'), 'app', ctx(), { files: unpackContainer(fs.readFileSync(BUNDLE_FILE)), payload: 1 });
  publishInto(path.join(dist, 'content'), 'content', ctx(), { files: course });
  const raw = await fakeRaw(dist);

  const reset = (licenceText: string | null, keep = false): void => {
    if (!keep) fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.mkdirSync(USER, { recursive: true });
    if (licenceText !== null) fs.writeFileSync(path.join(USER, 'licence.lic'), licenceText);
  };
  const launch = (): Promise<ElectronApplication> =>
    electron.launch({ executablePath: exe, args: [], timeout: 60_000, env: { ...process.env, STUDIO_DIST_BASE: raw.base } as Record<string, string> });
  /** The studio's window, once it opens (the launch window comes first). */
  const studio = async (app: ElectronApplication, timeout = 60_000): Promise<Page | null> => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const page = app.windows().find((w) => w.url().startsWith('http://127.0.0.1:'));
      if (page) {
        await page.waitForLoadState('load');
        return page;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };
  /** What the launch window says, once it has settled on a problem or the licence step. */
  const launchScreen = async (app: ElectronApplication, name: string): Promise<{ step: string; text: string; page: Page }> => {
    const page = await app.firstWindow();
    await page.waitForSelector('#problem:not([hidden]), #licence:not([hidden])', { timeout: 60_000 });
    const step = (await page.isVisible('#problem')) ? 'problem' : 'licence';
    const text = ((await page.textContent(step === 'problem' ? '#problem' : '#licence')) ?? '').replace(/\s+/g, ' ');
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    return { step, text, page };
  };

  console.log('\nA start downloads the studio and the course');
  reset(granted.text);
  let app = await launch();
  let page = await studio(app);
  expect(page !== null, 'the studio opens from what was downloaded');
  if (page) {
    await page.waitForSelector('text=Week 1', { timeout: 30_000 });
    await page.screenshot({ path: path.join(OUT, '1-studio.png') });
    const progress = await page.evaluate(() => fetch('/api/progress').then((r) => r.json() as Promise<{ day_tags?: Record<string, string> }>));
    expect(Object.keys(progress.day_tags ?? {}).length === 0, 'the first start tags no day', JSON.stringify(progress.day_tags ?? {}));
    // The Terminal writes the day's starting files into the workspace.
    await page.evaluate(async () => {
      const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
      await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id, command: 'node --version', code: '', file: null, workspace: 'project' }) });
      await new Promise((r) => setTimeout(r, 3000));
    });
  }
  expect(raw.requests.some((r) => r.startsWith('/app/blobs/')) && raw.requests.some((r) => r.startsWith('/content/blobs/')), 'both releases were downloaded');
  await app.close();

  // The scan for course text: lines of lesson text, which appear nowhere but in the course.
  const day = JSON.parse(course.get('weeks/week-1/day-2.json')!.toString('utf-8')) as { parts: { blocks: { type: string; text: string }[] }[] };
  const canaries = day.parts
    .flatMap((p) => p.blocks)
    .filter((b) => b.type === 'markdown' && b.text.length > 80)
    .map((b) => b.text.replace(/[#*`_>\[\]()]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 8).join(' '))
    .filter((s) => s.split(' ').length >= 6)
    .slice(0, 5);
  const workspaceStarters = Object.values((JSON.parse(course.get('workspaces.json')!.toString('utf-8')) as { workspaces: Record<string, { files: Record<string, string> }> }).workspaces)
    .flatMap((w) => Object.values(w.files))
    .filter((t) => t.length > 200)
    .map((t) => t.slice(40, 120))
    .slice(0, 5);
  const needles = [...canaries.map((c) => c.split(' ').slice(0, 4).join(' ')), ...workspaceStarters];
  const prefix = runPrefix(VARIANT.appId);
  const scanned = [...filesUnder(USER), ...fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(prefix)).flatMap((n) => filesUnder(path.join(os.tmpdir(), n)))];
  const found = scanned.filter((f) => {
    try {
      const text = fs.readFileSync(f).toString('utf-8');
      return needles.some((n) => n && text.includes(n));
    } catch {
      return false;
    }
  });
  expect(needles.length > 0, 'there is course text to look for', needles.length + ' samples');
  expect(found.length === 0, 'after quitting, no course text is left in the app\'s data or temporary folders', found.map((f) => path.relative(USER, f)).join(', '));
  expect(fs.existsSync(path.join(USER, 'release-state', 'content-latest.json')), 'only the accepted manifests are kept');

  console.log('\nNo internet');
  raw.mode = 'offline';
  app = await launch();
  let screen = await launchScreen(app, '2-offline');
  expect(screen.step === 'problem' && /requires an internet connection/.test(screen.text), 'the launch window says the application requires the internet', screen.text.slice(0, 90));
  raw.mode = 'ok';
  await screen.page.click('#retry');
  page = await studio(app);
  expect(page !== null, 'Retry opens the studio once the connection is back');
  await app.close();

  console.log('\nGitHub busy, a damaged download, a licence with no access');
  raw.mode = 'busy';
  app = await launch();
  screen = await launchScreen(app, '3-busy');
  expect(/temporarily busy/.test(screen.text), 'the service being busy is said plainly, without naming it', screen.text.slice(0, 60));
  await app.close();
  raw.mode = 'corrupt';
  app = await launch();
  screen = await launchScreen(app, '4-corrupt');
  expect(/could not be verified/.test(screen.text), 'a damaged download is refused', screen.text.slice(0, 60));
  await app.close();
  raw.mode = 'ok';
  reset(stranger.text);
  app = await launch();
  screen = await launchScreen(app, '5-no-grant');
  expect(/does not have access/.test(screen.text) && screen.text.includes(stranger.licence.id), 'a licence with no grant is told to ask Evoke, by its ID', screen.text.slice(0, 90));
  await app.close();

  console.log('\nA course update');
  reset(granted.text);
  app = await launch();
  page = await studio(app);
  await app.close();
  const updated = new Map(course);
  const index = JSON.parse(updated.get('course-index.json')!.toString('utf-8')) as { weeks: { week: number; days: { day: number; revision?: string }[] }[] };
  index.weeks[0].days[1].revision = 'changed0test';
  updated.set('course-index.json', Buffer.from(JSON.stringify(index)));
  const d2 = JSON.parse(updated.get('weeks/week-1/day-2.json')!.toString('utf-8')) as { parts: { blocks: { type: string; text: string }[] }[] };
  d2.parts[0].blocks[0].text += ' (updated)';
  updated.set('weeks/week-1/day-2.json', Buffer.from(JSON.stringify(d2)));
  publishInto(path.join(dist, 'content'), 'content', ctx(), { files: updated });
  app = await launch();
  page = await studio(app);
  if (page) {
    const progress = await page.evaluate(() => fetch('/api/progress').then((r) => r.json() as Promise<{ day_tags?: Record<string, string> }>));
    expect(progress.day_tags?.d2 === 'updated', 'the next start serves the new course, and the changed day is tagged "updated"', JSON.stringify(progress.day_tags ?? {}));
    const served = await page.evaluate(() => fetch('/api/course/1/2').then((r) => r.text()));
    expect(served.includes('(updated)'), 'the changed lesson is the one served');
    await page.goto(new URL(page.url()).origin + '/');
    await page.waitForSelector('text=Week 1', { timeout: 30_000 });
    await page.screenshot({ path: path.join(OUT, '6-updated-tag.png') });
  } else expect(false, 'the studio opens after a course update');
  await app.close();

  console.log('\nA licence withdrawn after the app was built');
  publishInto(path.join(dist, 'content'), 'content', ctx([fingerprint(JSON.parse(granted.text))]), { files: null, rekey: true });
  app = await launch();
  screen = await launchScreen(app, '7-withdrawn');
  expect(screen.step === 'licence' && /withdrawn/.test(screen.text), 'the licence is refused as withdrawn, and a new one is asked for', screen.text.slice(0, 90));
  await app.close();

  console.log('\nA course that needs a newer studio');
  publishInto(path.join(dist, 'content'), 'content', ctx(), { files: null, minApp: 2, dropUnknown: true });
  reset(granted.text);
  app = await launch();
  screen = await launchScreen(app, '8-too-old');
  expect(/Install the new version/.test(screen.text), 'the learner is told to install the new version', screen.text.slice(0, 60));
  await app.close();

  console.log('\nA standard build: Node and the browsers on its first start');
  // The course for every licence again, as it was before the two cases above.
  publishInto(path.join(dist, 'content'), 'content', ctx(), { files: updated, minApp: null });
  await build({ release: false, obfuscate: true, licenceFile: null, publicKeyFile: keys.publicKeyFile, appSecret: secret, runtime: 'download' });
  const standardExe = await packedApp({ runtime: false });
  // The official archives runtime.ts downloaded and checked, served as the official servers would.
  const runtimeServer = await fakeRaw(ARCHIVES);
  const launchStandard = (): Promise<ElectronApplication> =>
    electron.launch({
      executablePath: standardExe,
      args: [],
      timeout: 60_000,
      env: { ...process.env, STUDIO_DIST_BASE: raw.base, STUDIO_RUNTIME_BASE: runtimeServer.base } as Record<string, string>,
    });
  reset(granted.text);
  fs.rmSync(RUNTIME, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  runtimeServer.mode = 'corrupt';
  app = await launchStandard();
  screen = await launchScreen(app, '9-runtime-damaged');
  expect(screen.step === 'problem' && /could not be verified/.test(screen.text), 'a damaged download of Node or a browser is refused', screen.text.slice(0, 90));
  expect(!fs.existsSync(path.join(RUNTIME, 'node', 'node.exe')), 'and nothing of it is installed');
  runtimeServer.mode = 'ok';
  await screen.page.click('#retry');
  const seen: string[] = [];
  let shot = false;
  page = null;
  for (const started = Date.now(); Date.now() - started < 15 * 60_000; ) {
    page = app.windows().find((w) => w.url().startsWith('http://127.0.0.1:')) ?? null;
    if (page) break;
    try {
      const text = (await screen.page.textContent('#progress', { timeout: 1000 })) ?? '';
      if (text && seen[seen.length - 1] !== text) seen.push(text);
      if (!shot && /\d+ MB of \d+ MB/.test(text)) {
        shot = true;
        await screen.page.screenshot({ path: path.join(OUT, '10-runtime-progress.png') });
      }
    } catch {
      // The launch window closes as the studio opens.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  expect(page !== null, 'Retry downloads Node and the browsers, and the studio opens');
  expect(seen.some((t) => /Downloading required components .*: \d+ MB of \d+ MB/.test(t)), 'the launch window shows the download\'s progress', seen.find((t) => /MB/.test(t)) ?? seen.join(' | '));
  expect(seen.some((t) => /Installing (Chromium|Firefox|WebKit|Node\.js)/.test(t)), 'and each piece being installed', seen.find((t) => /Installing/.test(t)) ?? '');
  if (page) {
    await page.waitForLoadState('load');
    await page.waitForSelector('text=Week 1', { timeout: 30_000 });
    const version = await terminal(page, 'node --version', 'project');
    expect(version.out.includes('v24.21.0'), 'the Terminal runs the downloaded Node', version.out.trim());
    const browsers = await page.evaluate(async () => {
      const { run_id } = (await (await fetch('/api/run/prepare', { method: 'POST' })).json()) as { run_id: string };
      const code =
        "const { chromium, firefox, webkit } = require('playwright');\n" +
        'for (const type of [chromium, firefox, webkit]) {\n' +
        '  const browser = await type.launch();\n' +
        '  const page = await browser.newPage();\n' +
        "  await page.setContent('<h1>ready</h1>');\n" +
        "  console.log(type.name() + ' ' + (await page.textContent('h1')));\n" +
        '  await browser.close();\n' +
        '}';
      const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id, week: 1, day: 3, part: 1, code }) });
      return (await res.json()) as { status: string; stdout: string; error: { message?: string } | null };
    });
    const said = browsers.stdout.trim().split(/\r?\n/).join(', ');
    expect(said === 'chromium ready, firefox ready, webkit ready', 'Chromium, Firefox and WebKit, as downloaded, all run', said || browsers.status + ' ' + (browsers.error?.message ?? ''));
  }
  await app.close();
  expect(
    ['node/node.exe', 'ms-playwright/chromium-1243', 'ms-playwright/firefox-1543', 'ms-playwright/webkit-2359'].every((p) => fs.existsSync(path.join(RUNTIME, ...p.split('/')))),
    'they are kept in %LOCALAPPDATA%\\' + VARIANT.name + '\\runtime',
  );
  const before = runtimeServer.requests.length;
  app = await launchStandard();
  page = await studio(app);
  expect(page !== null && runtimeServer.requests.length === before, 'the next start downloads nothing', runtimeServer.requests.length - before + ' requests');
  await app.close();
  await runtimeServer.close();

  await raw.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '. Screenshots: ' + OUT);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
