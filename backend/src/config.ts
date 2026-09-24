/**
 * Runtime configuration, read once at boot from <data>/Config/studio.config.json.
 * setup.bat writes a local-dev copy; deployments supply their own.
 *
 * Where things live. In development everything is in the repository, as before. The desktop app
 * (desktop/) sets these variables before it loads the backend:
 *
 *   STUDIO_DATA_DIR       writable: progress, the Terminal's workspaces, the config file
 *   STUDIO_CONTENT_PACK   the course, encrypted (see content.ts), in place of Data/Content/
 *   STUDIO_WEB_DIR        the built Option C page, which the backend then serves itself
 *   STUDIO_NODE_PATH      the Node that runs the learner's code; the desktop app ships its own
 *   STUDIO_PORT           0 picks a free port
 *   PLAYWRIGHT_BROWSERS_PATH   the browsers the app ships; every learner process inherits it
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA = process.env.STUDIO_DATA_DIR ? path.resolve(process.env.STUDIO_DATA_DIR) : path.join(ROOT, 'Data');
/** The course as plain files, read when there is no content pack. */
export const CONTENT = path.join(ROOT, 'Data', 'Content');
export const CONTENT_PACK = process.env.STUDIO_CONTENT_PACK || null;
export const WEB_DIR = process.env.STUDIO_WEB_DIR || null;
/**
 * The Node that runs the learner's code: `node day3/hello.ts`, the test runner, the type checker
 * and a Run. The lessons need Node 22.18 or later, for its TypeScript support.
 */
export const NODE_BIN = process.env.STUDIO_NODE_PATH || process.execPath;

/**
 * A package file the learner's Node must read. Inside the desktop app, require.resolve() gives a
 * path inside app.asar, which only Electron can read; the real files are unpacked next to it.
 */
export const onDisk = (file: string): string => file.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
/**
 * There are no accounts, so there is no per-person directory of records - just the one file a
 * single local instance keeps for whoever is using it.
 */
export const PROGRESS_FILE = path.join(DATA, 'Progress', 'progress.json');
/**
 * Where the Terminal's workspaces live. STUDIO_WORKSPACE_ROOT lets `npm run verify:content` work in
 * a folder of its own, so a check never touches the files a learner has saved (the desktop app
 * clears it).
 */
export const WORKSPACE_ROOT = process.env.STUDIO_WORKSPACE_ROOT || path.join(DATA, 'Workspace');

export type StudioConfig = {
  /** 0 picks a free port. The port in use is `listening.port`. */
  port: number;
  run: {
    /** Hard wall-clock ceiling on one run. */
    timeout_ms: number;
    /** How many runs may execute at once before further requests are refused. */
    max_concurrent: number;
    /**
     * Hard wall-clock ceiling on one Terminal command. Longer than a Run's, because the test
     * runner starts browsers, may retry, and a learner may run several tests at once.
     */
    terminal_timeout_ms: number;
    /**
     * Origins a Run's browser, and the Terminal's tests, may navigate to. Fail-closed: an empty list
     * blocks every navigation rather than allowing everything. It keeps lessons on the sites the
     * course uses; it is a guide rail for the browser, not a sandbox. The learner's code itself runs
     * as the learner, with their rights, as code they write in any editor would.
     */
    allowed_origins: string[];
  };
};

const DEFAULTS: StudioConfig = {
  port: 3010,
  run: {
    timeout_ms: 30_000,
    max_concurrent: 3,
    terminal_timeout_ms: 300_000,
    // The course's practice pages load with page.setContent(), so they need no site at all. Two
    // lessons open playwright.dev.
    allowed_origins: [
      'https://playwright.dev',
      'http://localhost',
      'http://127.0.0.1',
    ],
  },
};

/** What a config file may hold: anything else, or anything out of range, is refused. */
const ConfigFile = z
  .object({
    port: z.number().int().min(0).max(65_535),
    run: z
      .object({
        timeout_ms: z.number().int().min(1_000).max(600_000),
        max_concurrent: z.number().int().min(1).max(16),
        terminal_timeout_ms: z.number().int().min(1_000).max(3_600_000),
        allowed_origins: z.array(z.string().regex(/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i)).max(100),
      })
      .strict()
      .partial(),
  })
  .strict()
  .partial();

function load(): StudioConfig {
  const file = path.join(DATA, 'Config', 'studio.config.json');
  let raw: z.infer<typeof ConfigFile> = {};
  if (fs.existsSync(file)) {
    try {
      raw = ConfigFile.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
    } catch (e) {
      // The defaults are safe; a damaged or edited file must not stop the studio, nor loosen it.
      console.error('[studio] ' + file + ' is not a valid config, so the defaults are used: ' + (e as Error).message.slice(0, 300));
    }
  }
  const envPort = process.env.STUDIO_PORT;
  const port = envPort !== undefined && /^\d{1,5}$/.test(envPort) && Number(envPort) <= 65_535 ? Number(envPort) : null;
  return {
    ...DEFAULTS,
    ...raw,
    ...(port === null ? {} : { port }),
    run: { ...DEFAULTS.run, ...(raw.run ?? {}) },
  };
}

export const config = load();

/**
 * The ports the servers are actually listening on, once they are: config.port may be 0, and the
 * test report's server (server.ts) always takes a free one.
 */
export const listening = { port: config.port, reportPort: 0, reportPath: '/' + crypto.randomBytes(16).toString('hex') };
