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
import * as fs from 'node:fs';
import * as path from 'node:path';

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
     * Origins the browser may navigate to. Fail-closed: an empty list blocks every navigation
     * rather than allowing everything.
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

function load(): StudioConfig {
  const file = path.join(DATA, 'Config', 'studio.config.json');
  const raw = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StudioConfig>) : {};
  const port = process.env.STUDIO_PORT ? Number(process.env.STUDIO_PORT) : null;
  return {
    ...DEFAULTS,
    ...raw,
    ...(port === null ? {} : { port }),
    run: { ...DEFAULTS.run, ...(raw.run ?? {}) },
  };
}

export const config = load();

/** The port the server is actually listening on, once it is: config.port may be 0. */
export const listening = { port: config.port };
