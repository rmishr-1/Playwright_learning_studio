/**
 * The studio's Terminal: runs `npx playwright test` on the code in the editor.
 *
 * Output goes down the same stream a Run uses (WS /api/run/:run_id/stream), as raw `term`
 * chunks with their colors, then one `exit` event. The live browser view reaches the Browser tab
 * as ordinary `frame` events, posted by the Workspace's test wrapper (see workspace.ts).
 *
 * Like the Run button, this executes the learner's code, and it is sized the same way: for a
 * studio that each learner runs on their own computer. Only Playwright commands are accepted
 * (commands.ts), nothing goes through a shell, one command runs at a time, and a command is
 * stopped at a time limit.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '../config';
import { emit, retireStream } from '../runner';
import { HELP, parse } from './commands';
import { PLAYWRIGHT_CLI, WORKSPACE, hasReport, prepareWorkspace, writeSpec } from './workspace';

/** Where the backend serves the last HTML report. routes.ts mounts it. */
export const REPORT_URL = '/api/terminal/report/index.html';

type Running = { runId: string; child: ChildProcess; stopping: boolean; timedOut: boolean };
let running: Running | null = null;

const say = (runId: string, text: string): void => emit(runId, { event: 'term', data: text.replace(/\n/g, '\r\n') + '\r\n' });
const done = (runId: string, code: number | null, openUrl?: string): void => {
  emit(runId, openUrl ? { event: 'exit', code, open_url: openUrl } : { event: 'exit', code });
  retireStream(runId);
};

// Colors the terminal uses for its own messages, so they read apart from the runner's output.
const YELLOW = (s: string): string => '\x1b[33m' + s + '\x1b[0m';
const DIM = (s: string): string => '\x1b[90m' + s + '\x1b[0m';

/**
 * Starts one command. The run id is minted by POST /api/run/prepare, exactly as for a Run, and
 * the client attaches its socket before calling this. Returns at once; the outcome streams.
 */
export function startCommand(runId: string, line: string, code: string): void {
  if (running) {
    say(runId, YELLOW('A command is already running. Press Ctrl+C to stop it first.'));
    return done(runId, 1);
  }
  const parsed = parse(line);

  if (parsed.kind === 'help') {
    say(runId, HELP);
    return done(runId, 0);
  }
  if (parsed.kind === 'refused') {
    say(runId, YELLOW(parsed.message));
    return done(runId, 1);
  }
  if (parsed.kind === 'show-report') {
    if (!hasReport()) {
      say(runId, YELLOW('There is no report yet. Run npx playwright test first.'));
      return done(runId, 1);
    }
    say(runId, 'Opening the report of the last run in a new browser tab.');
    return done(runId, 0, REPORT_URL);
  }

  // `npx playwright test` needs a spec file. Code written for the Run button has no test() in
  // it, and saving it as a spec file would only produce a confusing error.
  if (!/\btest\s*(\.\w+\s*)?\(/.test(code)) {
    say(
      runId,
      YELLOW(
        'The editor does not contain a test. npx playwright test runs a spec file, which uses\n' +
          "test(...) from '@playwright/test'. Use ▶ Run for code that uses launch() and show().",
      ),
    );
    return done(runId, 1);
  }

  try {
    prepareWorkspace();
    const saved = writeSpec(parsed.specFile, code);
    say(runId, DIM('Saved the editor as ' + saved));
  } catch (e) {
    say(runId, YELLOW('The studio could not prepare its workspace: ' + (e as Error).message));
    return done(runId, 1);
  }

  // The learner's code runs with the studio's environment minus its secrets, as a Run does.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/ANTHROPIC|API_KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete env[key];
  }
  delete env.CI; // A CI variable would change retries and forbidOnly, and the lessons assume a computer.
  env.FORCE_COLOR = '1';
  env.PLAYWRIGHT_HTML_OPEN = 'never';
  env.STUDIO_FRAME_URL = 'http://127.0.0.1:' + config.port + '/api/terminal/' + runId + '/frame';
  env.STUDIO_ALLOWED_ORIGINS = JSON.stringify(config.run.allowed_origins);

  const child = spawn(process.execPath, [PLAYWRIGHT_CLI, 'test', ...parsed.args], {
    cwd: WORKSPACE,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group on macOS and Linux, so Ctrl+C reaches the workers and browsers too.
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  const current: Running = { runId, child, stopping: false, timedOut: false };
  running = current;

  const forward = (chunk: Buffer): void => emit(runId, { event: 'term', data: chunk.toString('utf-8').replace(/\r?\n/g, '\r\n') });
  child.stdout?.on('data', forward);
  child.stderr?.on('data', forward);

  const timer = setTimeout(() => {
    current.timedOut = true;
    kill(current, true);
  }, config.run.terminal_timeout_ms);

  child.on('error', (e) => {
    say(runId, YELLOW('The test runner could not start: ' + e.message));
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (running === current) running = null;
    if (current.timedOut) {
      say(runId, YELLOW('\nThe command was stopped at the time limit of ' + Math.round(config.run.terminal_timeout_ms / 1000) + ' seconds.'));
    } else if (current.stopping) {
      say(runId, DIM('^C'));
    }
    done(runId, current.stopping ? 130 : code);
  });
}

/** Ctrl+C. Returns false when there was nothing to stop. */
export function stopCommand(runId: string): boolean {
  if (!running || running.runId !== runId) return false;
  kill(running, false);
  return true;
}

/**
 * Stops the test runner with its workers and browsers. A gentle interrupt first, as Ctrl+C in a
 * real terminal sends, so the runner can close its browsers; then a hard stop if it is still
 * there. Windows has no process-group signal, so the whole tree is ended with taskkill.
 */
function kill(r: Running, hard: boolean): void {
  r.stopping = true;
  const pid = r.child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => r.child.kill());
    return;
  }
  const signal = (sig: NodeJS.Signals): void => {
    try {
      process.kill(-pid, sig);
    } catch {
      r.child.kill(sig);
    }
  };
  signal(hard ? 'SIGKILL' : 'SIGINT');
  if (!hard) setTimeout(() => { if (r.child.exitCode === null && r.child.signalCode === null) signal('SIGKILL'); }, 4000);
}

/** One live-view frame from the Workspace's test wrapper. Frames for a finished command are dropped. */
export function receiveFrame(runId: string, body: { data?: unknown; width?: unknown; height?: unknown }): boolean {
  if (!running || running.runId !== runId || typeof body.data !== 'string') return false;
  emit(runId, {
    event: 'frame',
    data: body.data,
    width: typeof body.width === 'number' ? body.width : 1280,
    height: typeof body.height === 'number' ? body.height : 720,
  });
  return true;
}
