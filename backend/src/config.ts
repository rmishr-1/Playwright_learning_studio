/**
 * Runtime configuration, read once at boot from Data/Config/studio.config.json.
 * setup.bat writes a local-dev copy; deployments supply their own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA = path.join(ROOT, 'Data');
export const CONTENT = path.join(DATA, 'Content');
export const LEARNERS = path.join(DATA, 'Learners');

export type StudioConfig = {
  port: number;
  /**
   * Bootstrap admins, by learner id. An id here is an admin whatever the stored record says -
   * the escape hatch that stops a bad demotion locking everyone out of the People screen.
   */
  admins: string[];
  run: {
    /** Hard wall-clock ceiling on one learner run. */
    timeout_ms: number;
    /** How many runs may execute at once before further requests are refused. */
    max_concurrent: number;
    /**
     * Origins the learner's browser may navigate to. Fail-closed: an empty list blocks
     * every navigation rather than allowing everything.
     */
    allowed_origins: string[];
  };
  assistant: {
    enabled: boolean;
    model: string;
  };
  /**
   * SMTP for password-reset codes. Leave `host` or `user` empty and nothing is sent: the
   * message lands in Data/Outbox/ instead and the log says so. The password comes from
   * STUDIO_SMTP_PASSWORD, never from this file.
   */
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  reset: {
    /** How long a reset code stays valid. */
    code_ttl_minutes: number;
    /** Wrong guesses before the code is discarded - a 6-digit code is only 1,000,000 wide. */
    max_attempts: number;
  };
};

const DEFAULTS: StudioConfig = {
  port: 3010,
  admins: [],
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
  mail: { host: '', port: 587, secure: false, user: '', password: '', from: '' },
  reset: { code_ttl_minutes: 10, max_attempts: 5 },
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
    // The SMTP password is an env var, never a config-file value that could be committed.
    mail: {
      ...DEFAULTS.mail,
      ...(raw.mail ?? {}),
      password: process.env.STUDIO_SMTP_PASSWORD ?? '',
    },
    reset: { ...DEFAULTS.reset, ...(raw.reset ?? {}) },
  };
}

export const config = load();

/**
 * The API key never comes from the config file - it is an environment variable, so it cannot
 * be committed by accident and never reaches the browser.
 */
export const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
