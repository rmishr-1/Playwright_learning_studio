/**
 * The one folder the Terminal works in: Data/Workspace.
 *
 * It is a small Playwright project that the studio owns, laid out the way the learner's own
 * project is:
 *
 *   Data/Workspace/
 *     package.json             marks the folder as a project, as in the learner's own
 *     playwright.config.ts     the settings the test runner reads
 *     tsconfig.json            points `@playwright/test` at .studio/ (below)
 *     .studio/test.ts          adds the live browser view to every test
 *     tests/<one file>.spec.ts the editor's code, saved again before every command
 *     test-results/            written by the test runner
 *     playwright-report/       written by the test runner, opened by show-report
 *
 * Everything the Terminal creates stays inside this folder, and the tests folder only ever holds
 * the one file the current command runs, so a learner never sees stale files from an earlier
 * command. The files the studio writes are regenerated on every command, so an edit to them, or
 * an upgrade of Playwright, can never leave the folder in a broken state. The folder is ignored
 * by Git (see .gitignore).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DATA } from '../config';

export const WORKSPACE = path.join(DATA, 'Workspace');
export const TESTS_DIR = path.join(WORKSPACE, 'tests');
export const REPORT_DIR = path.join(WORKSPACE, 'playwright-report');

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
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'https://test-automation-banking.vercel.app',
    trace: 'on-first-retry',
  },
  // The studio installs Chromium only, so it is the one browser the Terminal runs.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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

/** Recreates the studio's own files, and empties the tests folder. */
export function prepareWorkspace(): void {
  fs.mkdirSync(path.join(WORKSPACE, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE, 'package.json'), PACKAGE);
  fs.writeFileSync(path.join(WORKSPACE, 'playwright.config.ts'), CONFIG);
  fs.writeFileSync(path.join(WORKSPACE, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(WORKSPACE, '.studio', 'test.ts'), wrapper());
  fs.rmSync(TESTS_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(TESTS_DIR, { recursive: true });
}

/** Saves the editor's code as the one file in the tests folder. */
export function writeSpec(fileName: string, code: string): string {
  const file = path.join(TESTS_DIR, path.basename(fileName));
  fs.writeFileSync(file, code.endsWith('\n') ? code : code + '\n');
  return path.relative(WORKSPACE, file).split(path.sep).join('/');
}

export function hasReport(): boolean {
  return fs.existsSync(path.join(REPORT_DIR, 'index.html'));
}
