/**
 * The folders the Terminal works in, under Data/Workspace/, one per kind of day:
 *
 *   demo/      ready-made, with a demo day's own files, for a day that comes before the learner
 *              has a project of their own
 *   project/   the learner's project, which starts as `npm init playwright@latest` leaves it
 *
 * Each is laid out the way the course's project is:
 *
 *   package.json             marks the folder as a project
 *   playwright.config.ts     the settings the test runner reads
 *   tsconfig.json            points `@playwright/test` at .studio/ (below)
 *   .studio/test.ts          adds the live browser view to every test
 *   tests/                   the spec files
 *   pages/, fixtures/, test-data/, utils/   page objects, fixtures, data and helpers (Day 10)
 *   ts-basics/               the TypeScript playground, where `node day3/hello.ts` runs
 *   test-results/, playwright-report/   written by the test runner
 *
 * The files a workspace starts with come from Data/Content/workspaces.json. The studio keeps them
 * up to date with the course, but never touches a file the learner has changed (see
 * prepareWorkspace()). The studio's own
 * files are written again before every command, so an edit to them, or an upgrade of Playwright,
 * can never leave a workspace broken. Data/Workspace/ is ignored by Git.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WORKSPACE_ROOT, onDisk } from '../config';
import { readContent } from '../content';
import { lockedDayNumbers } from '../store';
import { PROJECT_FILE, WorkspaceSeeds, type Workspace } from '../../../shared/contracts/course_day';

const ROOT = WORKSPACE_ROOT;
export const workspaceDir = (name: Workspace): string => path.join(ROOT, name);
export const reportDir = (name: Workspace): string => path.join(workspaceDir(name), 'playwright-report');

/** The real @playwright/test, resolved once. The Terminal's own wrapper re-exports it. */
const PLAYWRIGHT_TEST = onDisk(require.resolve('@playwright/test'));
/** The test runner's command-line entry point: what `npx playwright` runs. */
export const PLAYWRIGHT_CLI = onDisk(require.resolve('@playwright/test/cli'));

const CONFIG = `// Written by the Learning Studio for its Terminal. Changes to this file are replaced.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  // The same report as a new project. It is opened with \`npx playwright show-report\`.
  reporter: [['list'], ['html', { open: 'never' }]],
  // The course's own time limits (Day 10): each test 30 s, each web-first assertion 5 s.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    // The course's practice site, which its tests serve themselves: page.goto('/signin').
    baseURL: 'https://qa-academy.test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // The three browsers a new project tests in. The live view shows Chromium.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`;

// \`@playwright/test\` is mapped to .studio/test.ts, so a spec file written exactly as in the
// lessons gets the live browser view without any change to its import line.
const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      strict: false,
      esModuleInterop: true,
      baseUrl: '.',
      paths: { '@playwright/test': ['./.studio/test.ts'] },
    },
  },
  null,
  2,
) + '\n';

/**
 * Streams each Chromium page to the Terminal's Browser tab, as a Run does. It posts frames to the
 * studio backend at STUDIO_FRAME_URL, which the backend sets for each command. Without that
 * variable it does nothing, so the file is harmless if the project is run by hand.
 */
function wrapper(): string {
  const real = JSON.stringify(PLAYWRIGHT_TEST);
  return `// Written by the Learning Studio for its Terminal. Changes to this file are replaced.
import { test as base } from ${real};
export * from ${real};

const FRAME_URL = process.env.STUDIO_FRAME_URL;
const FRAME_KEY = process.env.STUDIO_FRAME_KEY ?? '';
// The same fail-closed allowlist a Run uses (Data/Config/studio.config.json): a page may only
// navigate to the course's practice sites. The backend always sets it; unset, nothing is allowed.
const ALLOWED: string[] = process.env.STUDIO_ALLOWED_ORIGINS ? JSON.parse(process.env.STUDIO_ALLOWED_ORIGINS) : [];

// The same scheme and host as an allowed origin; any port, unless the entry names one.
function allowed(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  return ALLOWED.some((a) => {
    let e: URL;
    try { e = new URL(a); } catch { return false; }
    return u.protocol === e.protocol && u.hostname === e.hostname && (e.port === '' || u.port === e.port);
  });
}

export const test = base.extend({
  // No service workers: their requests would not pass through the gate below.
  serviceWorkers: 'block',
  context: async ({ context }, use) => {
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = request.url();
      const topLevel = request.isNavigationRequest() && request.frame().parentFrame() === null;
      if (!topLevel || url.startsWith('data:') || url.startsWith('about:') || allowed(url)) {
        return route.fallback();
      }
      console.log('Navigation blocked: ' + url + '. The studio only lets tests reach the practice sites that the course uses.');
      return route.abort('blockedbyclient');
    });
    // Playwright routes only the first request of a redirect: a redirect to a site not allowed is
    // caught where it lands, and the page is taken back to a blank one.
    context.on('page', (page) => {
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        if (url === '' || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('chrome-error:') || allowed(url)) return;
        console.log('Navigation blocked: ' + url + '. The studio only lets tests reach the practice sites that the course uses.');
        page.goto('about:blank').catch(() => {});
      });
    });
    await use(context);
  },
  page: async ({ page, browserName }, use) => {
    let cdp: any = null;
    if (FRAME_URL && browserName === 'chromium') {
      let sending = false;
      try {
        cdp = await page.context().newCDPSession(page);
        cdp.on('Page.screencastFrame', (f: any) => {
          cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
          // Drop a frame rather than queue it, so the view stays current on a slow machine.
          if (sending) return;
          sending = true;
          fetch(FRAME_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Studio-Frame-Key': FRAME_KEY },
            body: JSON.stringify({ data: f.data, width: f.metadata?.deviceWidth ?? 1280, height: f.metadata?.deviceHeight ?? 720 }),
          })
            .catch(() => {})
            .finally(() => { sending = false; });
        });
        await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 720 });
      } catch {
        // The live view is a convenience. A test must never fail because of it.
        cdp = null;
      }
    }
    await use(page);
    if (cdp) await cdp.send('Page.stopScreencast').catch(() => {});
  },
});

export default test;
`;
}

// Playwright writes test-results/ and playwright-report/ next to the nearest package.json. Without
// one here, that would be the studio's own, at the root of the repository.
const PACKAGE = JSON.stringify({ name: 'studio-workspace', private: true }, null, 2) + '\n';

function readSeeds(): WorkspaceSeeds['workspaces'] {
  const text = readContent('workspaces.json');
  if (text === null) return { demo: { files: {} }, project: { files: {} } };
  const seeds = WorkspaceSeeds.parse(JSON.parse(text)).workspaces;
  // A locked day's starting files (tests/day9/..., ts-basics/day8/...) wait until it opens.
  const locked = lockedDayNumbers();
  if (locked === null) return { demo: { files: {} }, project: { files: {} } };
  if (locked.size === 0) return seeds;
  // day9/, day09/, day_9/, day9.spec.ts, day9-login.spec.ts, day9Login.spec.ts: any name that says
  // which day it belongs to.
  const open = (rel: string): boolean => {
    const days = [...rel.matchAll(/(?:^|[\/._-])day[_-]?0*(\d+)(?!\d)/gi)].map((m) => Number(m[1]));
    return !days.some((d) => locked.has(d));
  };
  return Object.fromEntries(
    Object.entries(seeds).map(([name, ws]) => [name, { files: Object.fromEntries(Object.entries(ws.files).filter(([rel]) => open(rel))) }]),
  ) as WorkspaceSeeds['workspaces'];
}

/**
 * A path inside a workspace, from a path the learner or a lesson gave. Only files in the project's
 * own folders (PROJECT_FILE) may be written or named, and never a path that climbs out of the
 * workspace.
 */
export function resolveInside(name: Workspace, rel: string): string | null {
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!PROJECT_FILE.test(clean) || clean.split('/').includes('..')) return null;
  return path.join(workspaceDir(name), ...clean.split('/'));
}

const fingerprint = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Files an earlier version of the course put into the workspaces, before .studio/seeded.json
 * existed, by path and fingerprint. A workspace with no record yet is cleaned against this list,
 * so a course update does not leave the old course's demo tests behind; a file the learner changed
 * has a different fingerprint and is kept.
 */
const LEGACY_SEEDS: Record<string, readonly string[]> = {
  'tests/example.spec.ts': ['a3cbab846a58843b', 'b76c4eb77f320104'],
  'tests/day1/auto-wait.spec.ts': ['599bfb967e4641b6', 'f24f55645b447900'],
  'tests/day1/contexts.spec.ts': ['d91427a1ccc3c50b', '2c74e693dd2b1235'],
  'tests/day1/browsers.spec.ts': ['7edef709810a0592', 'c49c4a31d4bb76e4'],
  'tests/day5/practice-pages.ts': ['d6961e019b4c1c23', '6663e418677e48b0'],
  'ts-basics/day4/helpers.ts': ['ccd1c960c2758fe5', 'f0d874a7c052735f'],
  'ts-basics/package.json': ['f85a086c7664d25e'],
};

/**
 * Writes the studio's own files, and brings the course's starting files up to date.
 *
 * .studio/seeded.json records each starting file the studio wrote, with its fingerprint. A file
 * that still matches its record is the studio's, so it is updated when the course changes it and
 * removed when the course no longer has it. A file that no longer matches has been changed by
 * the learner, and is left exactly as it is. A missing starting file is written.
 */
export function prepareWorkspace(name: Workspace): void {
  const dir = workspaceDir(name);
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE);
  fs.writeFileSync(path.join(dir, 'playwright.config.ts'), CONFIG);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(dir, '.studio', 'test.ts'), wrapper());
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

  const recordFile = path.join(dir, '.studio', 'seeded.json');
  // The record is the learner's to damage (their code can write here): one that cannot be read is
  // treated as none.
  let before: Record<string, readonly string[]> = LEGACY_SEEDS;
  try {
    const record = JSON.parse(fs.readFileSync(recordFile, 'utf-8')) as unknown;
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      before = Object.fromEntries(
        Object.entries(record as Record<string, unknown>)
          .filter((e): e is [string, string] => typeof e[1] === 'string')
          .map(([k, v]) => [k, [v]]),
      );
    }
  } catch {
    // No record yet, or a damaged one.
  }
  const seeds = readSeeds()[name]?.files ?? {};
  // Every path, from the course or from .studio/seeded.json (which the learner's code can write),
  // must stay inside the project's own folders of this workspace; anything else is skipped.
  const fileOf = (rel: string): string | null => resolveInside(name, rel);
  const current = (rel: string): string | null => {
    const file = fileOf(rel);
    return file && fs.existsSync(file) ? fingerprint(fs.readFileSync(file, 'utf-8')) : null;
  };

  // The course dropped a file the studio wrote, and the learner never changed it: remove it.
  for (const [rel, prints] of Object.entries(before)) {
    const file = fileOf(rel);
    if (rel in seeds || !file) continue;
    const now = current(rel);
    if (now && prints.includes(now)) fs.rmSync(file, { force: true });
  }

  const after: Record<string, string> = {};
  for (const [rel, text] of Object.entries(seeds)) {
    const file = fileOf(rel);
    if (!file) continue;
    const now = current(rel);
    const untouched = now !== null && (before[rel] ?? []).includes(now);
    if (now === null || untouched) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      after[rel] = fingerprint(text);
    } else if (now === fingerprint(text)) {
      after[rel] = now;
    }
    // Otherwise the learner has changed it: it is theirs now, and it is not recorded.
  }
  fs.rmSync(recordFile + '.tmp', { recursive: true, force: true });
  fs.writeFileSync(recordFile + '.tmp', JSON.stringify(after, null, 2) + '\n');
  fs.renameSync(recordFile + '.tmp', recordFile);
}

/** Saves the editor's code as a file in the workspace, and returns its path there. */
export function saveFile(name: Workspace, rel: string, code: string): string | null {
  const file = resolveInside(name, rel);
  if (!file) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, code.endsWith('\n') ? code : code + '\n');
  return path.relative(workspaceDir(name), file).split(path.sep).join('/');
}

export function fileExists(name: Workspace, rel: string): boolean {
  const file = resolveInside(name, rel);
  return file !== null && fs.existsSync(file);
}

export function hasReport(name: Workspace): boolean {
  return fs.existsSync(path.join(reportDir(name), 'index.html'));
}
