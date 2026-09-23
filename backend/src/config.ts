/**
 * Runtime configuration, read once at boot from Data/Config/studio.config.json.
 * setup.bat writes a local-dev copy; deployments supply their own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA = path.join(ROOT, 'Data');
export const CONTENT = path.join(DATA, 'Content');
/**
 * There are no accounts, so there is no per-person directory of records - just the one file a
 * single local instance keeps for whoever is using it.
 */
export const PROGRESS_FILE = path.join(DATA, 'Progress', 'progress.json');

export type StudioConfig = {
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
  if (!fs.existsSync(file)) return DEFAULTS;
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StudioConfig>;
  return {
    ...DEFAULTS,
    ...raw,
    run: { ...DEFAULTS.run, ...(raw.run ?? {}) },
  };
}

export const config = load();
