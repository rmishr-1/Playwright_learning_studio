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
 *   ts-basics/               the TypeScript playground, where `node day3/hello.ts` runs
 *   test-results/, playwright-report/   written by the test runner
 *
 * The files a workspace starts with come from Data/Content/workspaces.json. A seed file is written
 * only when it is missing, so a file the learner saved from the editor is kept. The studio's own
 * files are written again before every command, so an edit to them, or an upgrade of Playwright,
 * can never leave a workspace broken. Data/Workspace/ is ignored by Git.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTENT, DATA } from '../config';
import { WorkspaceSeeds, type Workspace } from '../../../shared/contracts/course_day';

// STUDIO_WORKSPACE_ROOT lets `npm run verify:content` work in a folder of its own, so a check never
// touches the files a learner has saved.
const ROOT = process.env.STUDIO_WORKSPACE_ROOT || path.join(DATA, 'Workspace');
export const workspaceDir = (name: Workspace): string => path.join(ROOT, name);
export const reportDir = (name: Workspace): string => path.join(workspaceDir(name), 'playwright-report');

/** The real @playwright/test, resolved once. The Terminal's own wrapper re-exports it. */
const PLAYWRIGHT_TEST = require.resolve('@playwright/test');
/** The test runner's command-line entry point: what `npx playwright` runs. */
export const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');

const CONFIG = `// Written by the Learning Studio for its Terminal. Changes to this file are replaced.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  // The same report as a new project. It is opened with \`npx playwright show-report\`.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
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
// The same fail-closed allowlist a Run uses (Data/Config/studio.config.json): a page may only
// navigate to the course's practice sites. The backend always sets it; unset, nothing is gated.
const ALLOWED: string[] | null = process.env.STUDIO_ALLOWED_ORIGINS ? JSON.parse(process.env.STUDIO_ALLOWED_ORIGINS) : null;

export const test = base.extend({
  context: async ({ context }, use) => {
    if (ALLOWED) {
      await context.route('**/*', (route) => {
        const request = route.request();
        const url = request.url();
        const topLevel = request.isNavigationRequest() && request.frame().parentFrame() === null;
        let origin = '';
        try { origin = new URL(url).origin; } catch {}
        if (!topLevel || url.startsWith('data:') || url.startsWith('about:') || ALLOWED.some((a) => origin === a || origin.startsWith(a))) {
          return route.fallback();
        }
        console.log('Navigation blocked: ' + url + '. The studio only lets tests reach the practice sites that the course uses.');
        return route.abort('blockedbyclient');
      });
    }
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
            headers: { 'Content-Type': 'application/json' },
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
  const file = path.join(CONTENT, 'workspaces.json');
  if (!fs.existsSync(file)) return { demo: { files: {} }, project: { files: {} } };
  return WorkspaceSeeds.parse(JSON.parse(fs.readFileSync(file, 'utf-8'))).workspaces;
}

/**
 * A path inside a workspace, from a path the learner or a lesson gave. Only files under tests/ and
 * ts-basics/ may be written or named, and never a path that climbs out of the workspace.
 */
export function resolveInside(name: Workspace, rel: string): string | null {
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^(tests|ts-basics)\/[\w./-]+$/.test(clean) || clean.split('/').includes('..')) return null;
  return path.join(workspaceDir(name), ...clean.split('/'));
}

/** Writes the studio's own files, and any seed file that is missing. */
export function prepareWorkspace(name: Workspace): void {
  const dir = workspaceDir(name);
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE);
  fs.writeFileSync(path.join(dir, 'playwright.config.ts'), CONFIG);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(dir, '.studio', 'test.ts'), wrapper());
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  for (const [rel, text] of Object.entries(readSeeds()[name]?.files ?? {})) {
    const file = path.join(dir, ...rel.split('/'));
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
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
