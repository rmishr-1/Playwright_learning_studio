/**
 * The studio's Terminal: runs the course's commands (see commands.ts) in a workspace (see
 * workspace.ts), after saving the editor as the file it holds.
 *
 * Output goes down the same stream a Run uses (WS /api/run/:run_id/stream), as raw `term`
 * chunks with their colors, then one `exit` event. The live browser view reaches the Browser tab
 * as ordinary `frame` events, posted by the workspace's test wrapper (see workspace.ts).
 *
 * Like the Run button, this executes the learner's code, and it is sized the same way: for a
 * studio that each learner runs on their own computer. Only the course's commands are accepted
 * (commands.ts), nothing goes through a shell, one command runs at a time, and a command is
 * stopped at a time limit.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NODE_BIN, config, listening, onDisk } from '../config';
import { emit, retireStream } from '../runner';
import { learnerEnv, systemExe } from '../child-env';
import { DEFAULT_SPEC, HELP, parse, type Parsed } from './commands';
import { PLAYWRIGHT_CLI, fileExists, hasReport, prepareWorkspace, reportDir, saveFile, workspaceDir } from './workspace';
import type { Workspace } from '../../../shared/contracts/course_day';

/**
 * Where the last HTML report is served: a server of its own (server.ts), outside the studio's
 * origin, so the report cannot use the studio's API.
 */
const reportUrl = (): string => 'http://127.0.0.1:' + listening.reportPort + listening.reportPath + '/index.html';

/** The workspace whose report show-report opens: the one the last test run used. */
let reportFrom: Workspace = 'project';
export const currentReportDir = (): string => reportDir(reportFrom);

/**
 * The TypeScript compiler for `npm run check`, with the flags the lessons set up. It is the version
 * a learner gets from `npm install -D typescript` today (7.x), installed under its own name so
 * the studio's own build keeps its version. Its bin/ is not in the package's exports, so it is
 * found from the package folder.
 */
const TSC = onDisk(path.join(path.dirname(require.resolve('typescript-learner/package.json')), 'bin', 'tsc'));
const CHECK_FLAGS = [
  '--noEmit',
  '--strict',
  '--target',
  'esnext',
  '--module',
  'nodenext',
  '--allowImportingTsExtensions',
  '--ignoreConfig',
  // The one-line error format the lessons show. The Terminal asks for colors, which would
  // otherwise switch the checker to its multi-line format.
  '--pretty',
  'false',
];

/** frameKey: what the command's test processes send with each live-view frame (receiveFrame). */
type Running = { runId: string; child: ChildProcess; stopping: boolean; timedOut: boolean; frameKey: string };
let running: Running | null = null;

const say = (runId: string, text: string): void => emit(runId, { event: 'term', data: text.replace(/\n/g, '\r\n') + '\r\n' });
const done = (runId: string, code: number | null, openUrl?: string): void => {
  emit(runId, openUrl ? { event: 'exit', code, open_url: openUrl } : { event: 'exit', code });
  retireStream(runId);
};

// Colors the terminal uses for its own messages, so they read apart from the programs' output.
const YELLOW = (s: string): string => '\x1b[33m' + s + '\x1b[0m';
const DIM = (s: string): string => '\x1b[90m' + s + '\x1b[0m';

const containsTest = (code: string): boolean => /\btest\s*(\.\w+\s*)?\(/.test(code);

function npmVersion(): string {
  const agent = /npm\/([\d.]+)/.exec(process.env.npm_config_user_agent ?? '');
  if (agent) return agent[1];
  // A Node installation has npm beside it. The desktop app ships Node without npm, which no
  // command runs, and records the version npm would have had in npm-version.txt instead.
  const home = path.dirname(NODE_BIN);
  try {
    const file = path.join(home, 'node_modules', 'npm', 'package.json');
    return (JSON.parse(fs.readFileSync(file, 'utf-8')) as { version: string }).version;
  } catch {
    try {
      return fs.readFileSync(path.join(home, 'npm-version.txt'), 'utf-8').trim();
    } catch {
      return 'unknown';
    }
  }
}

/** The version of the Node that runs the learner's code, which may not be the one running this. */
let nodeVersionText: string | null = null;
function nodeVersion(): string {
  if (NODE_BIN === process.execPath && !process.versions.electron) return process.version;
  try {
    nodeVersionText ??= execFileSync(NODE_BIN, ['--version'], { encoding: 'utf-8', windowsHide: true }).trim();
    return nodeVersionText;
  } catch {
    return 'unknown';
  }
}

/**
 * Saves the editor before a command, and says where. The editor holds either a lesson's file,
 * which it is always saved as, or code of its own, which is saved only where it cannot replace a
 * file already in the workspace. Returns false, having said why, when the command cannot go on.
 */
function saveEditor(runId: string, ws: Workspace, parsed: Parsed, code: string, file: string | null): boolean {
  if (file) {
    const saved = saveFile(ws, file, code);
    if (!saved) {
      say(runId, YELLOW('The editor holds ' + file + ', which is not a file the Terminal can save.'));
      return false;
    }
    say(runId, DIM('Saved the editor as ' + saved));
    return true;
  }
  if (parsed.kind === 'node' || parsed.kind === 'check') {
    const rel = 'ts-basics/' + parsed.file;
    if (fileExists(ws, rel)) return true;
    say(runId, DIM('Saved the editor as ' + saveFile(ws, rel, code)));
    return true;
  }
  if (parsed.kind !== 'test') return true;
  // A test command that names one new file saves the editor there; one that names nothing runs
  // the editor on its own, as editor.spec.ts. Either way the editor has to contain a test.
  const named = parsed.paths.filter((p) => p.endsWith('.ts'));
  const target =
    parsed.paths.length === 0 ? DEFAULT_SPEC : named.length === 1 && !fileExists(ws, named[0]) ? named[0] : null;
  if (!target) return true;
  if (!containsTest(code)) {
    say(
      runId,
      YELLOW(
        'The editor does not contain a test. npx playwright test runs a spec file, which uses\n' +
          "test(...) from '@playwright/test'. Open a lesson's test in the editor first.",
      ),
    );
    return false;
  }
  say(runId, DIM('Saved the editor as ' + saveFile(ws, target, code)));
  if (parsed.paths.length === 0) parsed.args.push(target);
  return true;
}

/**
 * Starts one command. The run id is minted by POST /api/run/prepare, exactly as for a Run, and
 * the client attaches its socket before calling this. Returns at once; the outcome streams.
 */
export function startCommand(runId: string, line: string, code: string, file: string | null, ws: Workspace): void {
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
  if (parsed.kind === 'version') {
    const text =
      parsed.program === 'node'
        ? nodeVersion()
        : parsed.program === 'npm'
          ? npmVersion()
          : 'Version ' + (require('@playwright/test/package.json') as { version: string }).version;
    say(runId, text);
    return done(runId, 0);
  }
  if (parsed.kind === 'show-report') {
    if (!hasReport(reportFrom)) {
      say(runId, YELLOW('There is no report yet. Run npx playwright test first.'));
      return done(runId, 1);
    }
    say(runId, 'Opening the report of the last run in a new browser tab.');
    return done(runId, 0, reportUrl());
  }

  try {
    prepareWorkspace(ws);
    if (!saveEditor(runId, ws, parsed, code, file)) return done(runId, 1);
  } catch (e) {
    say(runId, YELLOW('The studio could not prepare its workspace: ' + (e as Error).message));
    return done(runId, 1);
  }

  // The learner's code runs with only the environment a program needs (child-env.ts). No CI
  // variable either: it would change retries and forbidOnly, and the lessons assume a computer.
  const frameKey = crypto.randomBytes(16).toString('hex');
  const env = learnerEnv({ FORCE_COLOR: '1' });

  let args: string[];
  let cwd: string;
  if (parsed.kind === 'test') {
    reportFrom = ws;
    env.PLAYWRIGHT_HTML_OPEN = 'never';
    env.STUDIO_FRAME_URL = 'http://127.0.0.1:' + listening.port + '/api/terminal/' + runId + '/frame';
    env.STUDIO_FRAME_KEY = frameKey;
    env.STUDIO_ALLOWED_ORIGINS = JSON.stringify(config.run.allowed_origins);
    args = [PLAYWRIGHT_CLI, 'test', ...parsed.args];
    cwd = workspaceDir(ws);
  } else {
    // `node` and `npm run check` run in ts-basics, as the TypeScript lessons do.
    cwd = path.join(workspaceDir(ws), 'ts-basics');
    args =
      parsed.kind === 'node'
        ? ['--disable-warning=ExperimentalWarning', parsed.file]
        : [TSC, ...CHECK_FLAGS, parsed.file];
  }

  const child = spawn(NODE_BIN, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group on macOS and Linux, so Ctrl+C reaches the workers and browsers too.
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  const current: Running = { runId, child, stopping: false, timedOut: false, frameKey };
  running = current;

  const forward = (chunk: Buffer): void => emit(runId, { event: 'term', data: chunk.toString('utf-8').replace(/\r?\n/g, '\r\n') });
  child.stdout?.on('data', forward);
  child.stderr?.on('data', forward);

  const timer = setTimeout(() => {
    current.timedOut = true;
    kill(current, true);
  }, config.run.terminal_timeout_ms);

  child.on('error', (e) => {
    say(runId, YELLOW('The command could not start: ' + e.message));
  });
  child.on('close', (exitCode) => {
    clearTimeout(timer);
    if (running === current) running = null;
    if (current.timedOut) {
      say(runId, YELLOW('\nThe command was stopped at the time limit of ' + Math.round(config.run.terminal_timeout_ms / 1000) + ' seconds.'));
    } else if (current.stopping) {
      say(runId, DIM('^C'));
    }
    done(runId, current.stopping ? 130 : exitCode);
  });
}

/** Stops whatever is running, with its browsers: the desktop app calls this as it closes. */
export function stopAll(): void {
  if (running) kill(running, true);
}

/** Ctrl+C. Returns false when there was nothing to stop. */
export function stopCommand(runId: string): boolean {
  if (!running || running.runId !== runId) return false;
  kill(running, false);
  return true;
}

/**
 * Stops a command with its workers and browsers. A gentle interrupt first, as Ctrl+C in a real
 * terminal sends, so the runner can close its browsers; then a hard stop if it is still there.
 * Windows has no process-group signal, so the whole tree is ended with taskkill.
 */
function kill(r: Running, hard: boolean): void {
  r.stopping = true;
  const pid = r.child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn(systemExe('taskkill.exe'), ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => r.child.kill());
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

/**
 * One live-view frame from the workspace's test wrapper, which sends the key only the running
 * command was given. Frames for a finished command, or without that key, are dropped.
 */
export function receiveFrame(runId: string, key: string | undefined, body: { data?: unknown; width?: unknown; height?: unknown }): boolean {
  if (!running || running.runId !== runId || typeof body.data !== 'string') return false;
  const want = Buffer.from(running.frameKey);
  const got = Buffer.from(key ?? '');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;
  emit(runId, {
    event: 'frame',
    data: body.data,
    width: typeof body.width === 'number' ? body.width : 1280,
    height: typeof body.height === 'number' ? body.height : 720,
  });
  return true;
}
