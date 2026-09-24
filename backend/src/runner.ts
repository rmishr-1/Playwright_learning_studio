/**
 * Executes learner-supplied TypeScript against a real Chromium, and streams the browser
 * back as CDP screencast frames.
 *
 * THIS RUNS ARBITRARY USER CODE. That is the feature, not an oversight, so every guard here
 * is load-bearing:
 *   - a separate child process per run, killed on timeout
 *   - a navigation allowlist, fail-closed (empty list blocks everything)
 *   - a concurrency cap, so one learner cannot exhaust the box
 *   - a per-run scratch directory, removed afterwards
 * It is sized for an internal training tool on a trusted network. Exposing it to the public
 * internet needs a container per run - see the README.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NODE_BIN, config, onDisk } from './config';
import { learnerEnv, systemExe } from './child-env';
import type { RunRequest, RunResult, RunStreamEvent } from '../../shared/contracts/run';

/**
 * Prefix the child uses to mark a structured event on stdout. Anything without it is the
 * learner's own console output and is forwarded as-is.
 */
const SENTINEL = '__STUDIO_EVT__';

type Listener = (e: RunStreamEvent) => void;
type Stream = {
  listeners: Set<Listener>;
  buffered: RunStreamEvent[];
  /**
   * The most recent frame and the terminal status, kept independently of who is listening.
   * A listener that attaches (or re-attaches, from a Detach window opened after the fact) only
   * ever gets frames buffered while NOBODY was listening - once the original page's overlay
   * has drained a run's frames, a second listener attaching later gets nothing further from the
   * stream itself. GET /api/run/:run_id/last-frame reads these two fields so a freshly opened
   * detached window has something to show immediately, whether the run is still going or is
   * long since finished.
   */
  lastFrame: string | null;
  status: string | null;
  /** The size of what is buffered, so a run with no viewer holds a bounded amount. */
  bufferedBytes: number;
};

/** What a stream holds for a viewer that has not attached yet, at most. */
const MAX_BUFFERED_BYTES = 16_000_000;
/** The largest live-view frame passed on (a frame is about 100 KB). */
const MAX_FRAME = 4_000_000;
/** The longest line of output passed on as one event. */
const MAX_EVENT_TEXT = 20_000;
/** Streams held at once, used or waiting: each can hold MAX_BUFFERED_BYTES. */
const MAX_STREAMS = 64;

const sizeOf = (event: RunStreamEvent): number =>
  event.event === 'frame' ? event.data.length : event.event === 'stdout' ? event.text.length : event.event === 'term' ? event.data.length : 100;

const newStream = (): Stream => ({ listeners: new Set(), buffered: [], lastFrame: null, status: null, bufferedBytes: 0 });

/** Frames arrive before the client may have attached, so buffer until it does. */
const streams = new Map<string, Stream>();
let active = 0;

export function attachStream(runId: string, listener: Listener): () => void {
  const s = streams.get(runId);
  if (!s) return () => {};
  for (const e of s.buffered) listener(e);
  s.buffered.length = 0;
  s.bufferedBytes = 0;
  s.listeners.add(listener);
  return () => s.listeners.delete(listener);
}

/** What a freshly attaching viewer should be shown right away - see the Stream type above. */
export function lastFrame(runId: string): { frame: string | null; status: string | null } | null {
  const s = streams.get(runId);
  if (!s) return null;
  return { frame: s.lastFrame, status: s.status };
}

/**
 * Pushes one event down a run's stream. Exported for the Terminal, which reuses the same stream
 * (and the same WebSocket route) for its output and its live browser frames.
 */
export function emit(runId: string, event: RunStreamEvent): void {
  const s = streams.get(runId);
  if (!s) return;
  if (event.event === 'frame') {
    if (typeof event.data !== 'string' || event.data.length > MAX_FRAME) return;
    s.lastFrame = event.data;
  } else if (event.event === 'ended') s.status = event.status;
  if (s.listeners.size === 0) {
    // Cap the buffer, in events and in bytes: a long run with no viewer must not grow without
    // bound. The run's end is always kept.
    const size = sizeOf(event);
    if ((s.buffered.length < 200 && s.bufferedBytes + size <= MAX_BUFFERED_BYTES) || event.event === 'ended' || event.event === 'exit') {
      s.buffered.push(event);
      s.bufferedBytes += size;
    }
    return;
  }
  for (const l of s.listeners) l(event);
}

/**
 * Lets a stream go once its command has finished and its last events have had time to reach the
 * client. The Terminal calls this; a Run cleans up its own stream when its process closes.
 */
export function retireStream(runId: string, afterMs = 60_000): void {
  setTimeout(() => streams.delete(runId), afterMs);
}

/** Written into the scratch dir and executed by node. */
function buildProgram(code: string): string {
  const allowed = JSON.stringify(config.run.allowed_origins);
  // The program runs from a temp directory, so ordinary resolution would not find playwright.
  // Resolve it here, in the parent, and bake in the absolute path.
  const playwrightPath = JSON.stringify(onDisk(require.resolve('playwright')));
  return `
const { chromium } = require(${playwrightPath});
const SENTINEL = ${JSON.stringify(SENTINEL)};

const ALLOWED = ${allowed};

const send = (o) => { try { process.stdout.write(SENTINEL + JSON.stringify(o) + '\\n'); } catch {} };

let _browser = null;
let _page = null;
let _lastShot = null;

// The same scheme and host as an allowed origin; any port, unless the entry names one.
// Exact, so https://playwright.dev.example.com is not https://playwright.dev.
function allowed(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return ALLOWED.some((a) => {
    let e;
    try { e = new URL(a); } catch { return false; }
    return u.protocol === e.protocol && u.hostname === e.hostname && (e.port === '' || u.port === e.port);
  });
}

async function launch(headless = true) {
  _browser = await chromium.launch({ headless: true });
  // No service workers: their requests would not pass through the gate below.
  const context = await _browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });

  // Fail-closed navigation gate, at the network layer. It gates TOP-LEVEL DOCUMENT navigation
  // only: once the main frame is on an allowed app, that app's own fonts, scripts and images are
  // allowed to load, otherwise every demo site renders broken and every run reports itself
  // blocked. Playwright routes only the first request of a redirect, so a redirect is caught
  // where it lands instead (framenavigated, below), and the page is taken back to a blank one.
  // It keeps lessons on the course's sites; it is a guide rail, not a sandbox.
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('about:')) return route.continue();
    const isTopLevel = request.isNavigationRequest() && request.frame().parentFrame() === null;
    if (!isTopLevel || allowed(url)) return route.continue();
    send({ event: 'blocked', url });
    return route.abort();
  });

  const watch = (page) => {
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url === '' || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('chrome-error:') || allowed(url)) return;
      send({ event: 'blocked', url });
      page.goto('about:blank').catch(() => {});
    });
  };
  context.on('page', watch);
  _page = await context.newPage();

  // Live view: CDP screencast, forwarded frame by frame to the overlay.
  try {
    const cdp = await context.newCDPSession(_page);
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame', async (f) => {
      send({ event: 'frame', data: f.data, width: 1280, height: 720 });
      try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  } catch (e) {
    // Screencast is a nicety. If it will not attach, the run still produces a screenshot.
    send({ event: 'stdout', text: '[live view unavailable: ' + String(e && e.message) + ']' });
  }

  return { browser: _browser, page: _page };
}

async function show(page) {
  const target = page || _page;
  if (!target) return;
  _lastShot = (await target.screenshot()).toString('base64');
  send({ event: 'shot' });
}

(async () => {
  try {
    await (async () => {
${code}
    })();
    if (_page && !_lastShot) { try { _lastShot = (await _page.screenshot()).toString('base64'); } catch {} }
    send({ event: 'result', status: 'ok', screenshot: _lastShot });
  } catch (err) {
    if (_page && !_lastShot) { try { _lastShot = (await _page.screenshot()).toString('base64'); } catch {} }
    send({
      event: 'result',
      status: 'error',
      screenshot: _lastShot,
      message: String(err && err.message ? err.message : err),
      stack: String((err && err.stack) || ''),
    });
  } finally {
    try { if (_browser) await _browser.close(); } catch {}
  }
})();
`;
}

/**
 * Runner frames name the studio's own generated program. A learner should see their own
 * line numbers, not ours, so strip the harness frames out of the stack.
 */
function cleanStack(stack: string): string {
  return stripAnsi(stack)
    .split('\n')
    .filter((l) => !/studio-run-|node:internal|[\\/]playwright[\\/]/.test(l))
    .join('\n')
    .trim();
}

/** Playwright's call log carries ANSI colour codes, which render as literal noise in a browser. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * The editor is a TypeScript editor - learners write type annotations, interfaces and Page
 * Object classes. A plain .js file gets none of Node's own TypeScript support, so real course
 * TypeScript (`(n: number) =>`, `private readonly page: Page`, `import { type Page }`) threw a
 * SyntaxError before a single line of the learner's own code ran. Transpiling through the real
 * compiler - not relying on Node's own strip-only mode, which additionally rejects parameter
 * properties and enums outright - removes that whole class of failure. This is a syntax-only pass
 * with no project type-checking, so it does not reject anything `tsc` would merely warn about.
 *
 * The transpiling happens in the run's own process (run.js below), not in the studio's: in the
 * desktop app the compiler sits outside app.asar, where the app's integrity check does not reach,
 * and the studio must not load code from there.
 */
const TYPESCRIPT = JSON.stringify(onDisk(require.resolve('typescript')));
/**
 * Where the program's own require() looks: the packages the studio ships, and nowhere else. Node's
 * usual search would climb from the temp folder through every parent's node_modules, and then try
 * its global folders (%USERPROFILE%\.node_modules and the like), where anything could be waiting
 * under a package's name; the bootstrap below empties both lists.
 */
const PACKAGES = JSON.stringify(path.resolve(onDisk(require.resolve('playwright/package.json')), '..', '..'));
const BOOTSTRAP = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require(${TYPESCRIPT});
const file = path.join(__dirname, 'program.js');
const out = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'program.ts'), 'utf-8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const m = new Module(file, module);
m.filename = file;
m.paths = [${PACKAGES}];
Module.globalPaths.length = 0;
m._compile(out, file);
`;

/** A run's output kept for its result: enough for any lesson, and never enough to exhaust memory. */
const MAX_OUTPUT = 1_000_000;
/** The longest line kept while waiting for its end (a live-view frame is about 100 KB). */
const MAX_LINE = 8_000_000;

/** Runs in flight, so the app can stop them, with their browsers, as it closes. */
const children = new Set<ChildProcess>();

/** Stops a run's process with everything it started. On Windows only taskkill /T reaches the browsers. */
function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    spawn(systemExe('taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill('SIGKILL'));
  } else {
    child.kill('SIGKILL');
  }
}

/** Stops every run in flight: the desktop app calls this as it closes. */
export function stopRuns(): void {
  for (const child of children) killTree(child);
}

export type StartedRun = { run_id: string; done: Promise<RunResult> };

/**
 * Registers a stream and returns its id. The client attaches the WebSocket to this id and
 * only then POSTs /api/run - otherwise the browser has already navigated by the time the
 * socket is open and the first frames are lost.
 */
export function prepareRun(): string {
  if (streams.size >= MAX_STREAMS) throw Object.assign(new Error('Too many runs are waiting.'), { code: 'RUN_QUEUE_FULL' });
  const runId = crypto.randomUUID();
  streams.set(runId, newStream());
  // An id nobody uses must not leak a stream entry.
  setTimeout(() => {
    const s = streams.get(runId);
    if (s && s.listeners.size === 0 && s.buffered.length === 0) streams.delete(runId);
  }, 120_000);
  return runId;
}

export function startRun(req: RunRequest): StartedRun | { queue_full: true } {
  if (active >= config.run.max_concurrent) return { queue_full: true };

  const runId = req.run_id;
  if (!streams.has(runId)) streams.set(runId, newStream());

  // Nothing is counted as running until the run's files are in place.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-run-'));
  const program = path.join(scratch, 'run.js');
  try {
    fs.writeFileSync(path.join(scratch, 'program.ts'), buildProgram(req.code));
    fs.writeFileSync(program, BOOTSTRAP);
  } catch (e) {
    fs.rmSync(scratch, { recursive: true, force: true });
    throw e;
  }
  active++;

  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let screenshot: string | null = null;
  let status: RunResult['status'] = 'ok';
  let error: RunResult['error'] = null;
  let blockedUrl: string | null = null;

  // Chromium needs a real Windows environment (SystemRoot, TEMP, LOCALAPPDATA) to start at all,
  // and gets only that (child-env.ts), so no secret of the studio's reaches the learner's code. The
  // learner's code runs as the learner, like code they write anywhere: the separate process and the
  // timeout keep a run from hurting the studio, and the navigation allowlist keeps lessons on the
  // course's sites; neither is a sandbox.
  const child = spawn(NODE_BIN, [program], {
    cwd: scratch,
    env: learnerEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(child);
  let truncated = false;
  let shown = 0;
  /** A line of the learner's output: kept for the result, and shown live, each within its limit. */
  const out = (text: string): void => {
    if (stdout.length + text.length + 1 <= MAX_OUTPUT) stdout += text + '\n';
    else if (!truncated) {
      truncated = true;
      stdout += '[output cut short: over ' + MAX_OUTPUT + ' characters]\n';
      emit(runId, { event: 'stdout', text: '[output cut short: over ' + MAX_OUTPUT + ' characters]' });
    }
    if (shown > MAX_OUTPUT) return;
    const line = text.length > MAX_EVENT_TEXT ? text.slice(0, MAX_EVENT_TEXT) + ' [line cut short]' : text;
    shown += line.length;
    emit(runId, { event: 'stdout', text: line });
  };

  const done = new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      status = 'timeout';
      killTree(child);
    }, config.run.timeout_ms);

    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      // A line that never ends is dropped rather than held without limit.
      if (buffer.length > MAX_LINE && !buffer.includes('\n')) buffer = '';
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const marker = line.indexOf(SENTINEL);
        if (marker === -1) {
          if (line.length) out(line);
          continue;
        }
        // Anything before the marker is genuine learner output on the same line.
        const pre = line.slice(0, marker);
        if (pre.length) out(pre);
        try {
          const evt = JSON.parse(line.slice(marker + SENTINEL.length));
          if (evt.event === 'frame') {
            if (typeof evt.data === 'string' && typeof evt.width === 'number' && typeof evt.height === 'number') {
              emit(runId, { event: 'frame', data: evt.data, width: evt.width, height: evt.height });
            }
          } else if (evt.event === 'stdout') {
            out(String(evt.text));
          } else if (evt.event === 'blocked') {
            blockedUrl = String(evt.url).slice(0, 2_000);
            status = 'blocked';
          } else if (evt.event === 'result') {
            screenshot = typeof evt.screenshot === 'string' && evt.screenshot.length <= MAX_FRAME ? evt.screenshot : null;
            if (evt.status === 'error') {
              // A blocked navigation CAUSES the error that follows it, so keep reporting the
              // block - it is the thing the learner can act on.
              if (status !== 'blocked') status = 'error';
              error = { message: stripAnsi(String(evt.message)).slice(0, MAX_EVENT_TEXT), stack: cleanStack(String(evt.stack ?? '')).slice(0, MAX_EVENT_TEXT) };
            } else if (status !== 'blocked') {
              status = 'ok';
            }
          }
        } catch {
          // A malformed event line is the runner's bug, not the learner's - keep going.
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf-8');
    });

    // A process that cannot start reports an error, and may never close: either ends the run, once.
    let finished = false;
    child.on('error', (e) => {
      if (status === 'ok') status = 'error';
      if (!error) error = { message: 'The run could not start: ' + e.message, stack: '' };
      finish();
    });
    child.on('close', () => finish());
    // Something the run started may keep its output open after it exits: two seconds on, the run
    // is over all the same, and its slot is free.
    child.on('exit', () => {
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish();
      }, 2_000).unref();
    });
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      children.delete(child);
      active--;
      // On Windows the browser can still hold a file in the scratch folder for a moment after the
      // child exits. Retry in the background (never blocking the app's windows), and never let
      // cleanup fail the run: a folder left behind goes with the OS temp cleanup.
      void fs.promises.rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
      if (status === 'ok' && stderr.trim() && !screenshot) status = 'error';
      emit(runId, { event: 'ended', status });
      // Long enough that pressing Detach a little while after a run finished still has a last
      // frame to show - the whole point of last-frame() above.
      setTimeout(() => streams.delete(runId), 5 * 60_000);
      resolve({
        run_id: runId,
        status,
        stdout: stdout.trim(),
        stderr: cleanStack(stderr),
        error,
        screenshot,
        duration_ms: Date.now() - started,
        blocked_url: blockedUrl,
      });
    };
  });

  emit(runId, { event: 'started' });
  return { run_id: runId, done };
}
