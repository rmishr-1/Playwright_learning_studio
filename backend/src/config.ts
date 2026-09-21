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
     * Origins the browser may navigate to. Fail-closed: an empty list blocks every navigation
     * rather than allowing everything.
     */
    allowed_origins: string[];
  };
  assistant: {
    enabled: boolean;
    model: string;
  };
};

const DEFAULTS: StudioConfig = {
  port: 3010,
  run: {
    timeout_ms: 30_000,
    max_concurrent: 3,
    allowed_origins: [
      'https://test-automation-banking.vercel.app',
      'https://demo.automationtesting.in',
      'https://opensource-demo.orangehrmlive.com',
      'https://playwright.dev',
      'http://localhost',
      'http://127.0.0.1',
    ],
  },
  assistant: {
    enabled: true,
    model: 'claude-opus-5',
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
    assistant: { ...DEFAULTS.assistant, ...(raw.assistant ?? {}) },
  };
}

export const config = load();

/**
 * The API key never comes from the config file - it is an environment variable, so it cannot
 * be committed by accident and never reaches the browser.
 */
export const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
