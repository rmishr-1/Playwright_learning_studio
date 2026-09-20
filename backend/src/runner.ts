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
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from './config';
import type { RunRequest, RunResult, RunStreamEvent } from '../../shared/contracts/run';

/**
 * Prefix the child uses to mark a structured event on stdout. Anything without it is the
 * learner's own console output and is forwarded as-is.
 */
const SENTINEL = '__STUDIO_EVT__';

type Listener = (e: RunStreamEvent) => void;

/** Frames arrive before the client may have attached, so buffer until it does. */
const streams = new Map<string, { listeners: Set<Listener>; buffered: RunStreamEvent[] }>();
let active = 0;

/**
 * Rendering a certificate to PDF also launches a browser, so it shares this cap rather than
 * having its own - otherwise a burst of certificate downloads can exhaust the box while the
 * run queue still believes it has headroom.
 */
export async function withBrowserSlot<T>(fn: () => Promise<T>): Promise<T | { queue_full: true }> {
  if (active >= config.run.max_concurrent) return { queue_full: true };
  active++;
  try {
    return await fn();
  } finally {
    active--;
  }
}

export function attachStream(runId: string, listener: Listener): () => void {
  const s = streams.get(runId);
  if (!s) return () => {};
  for (const e of s.buffered) listener(e);
  s.buffered.length = 0;
  s.listeners.add(listener);
  return () => s.listeners.delete(listener);
}

function emit(runId: string, event: RunStreamEvent): void {
  const s = streams.get(runId);
  if (!s) return;
  if (s.listeners.size === 0) {
    // Cap the buffer: a long run with no viewer must not grow without bound.
    if (s.buffered.length < 200) s.buffered.push(event);
    return;
  }
  for (const l of s.listeners) l(event);
}

/**
 * The course writes `import { launch, show } from "../_shared/deno-helpers.ts"`. That path does
 * not exist here and the notebooks target Deno, so the import is rewritten to the runner's own
 * harness. Without this, every example copied out of the theory fails on line 1.
 */
function rewriteHarnessImports(code: string): string {
  return code.replace(
    /^\s*import\s+\{([^}]*)\}\s+from\s+["'](?:\.\.\/)*_shared\/deno-helpers(?:\.ts)?["'];?\s*$/gm,
    '// harness: {$1} are provided by the studio runner',
  );
}

/** Written into the scratch dir and executed by node. */
function buildProgram(code: string): string {
  const allowed = JSON.stringify(config.run.allowed_origins);
  // The program runs from a temp directory, so ordinary resolution would not find playwright.
  // Resolve it here, in the parent, and bake in the absolute path.
  const playwrightPath = JSON.stringify(require.resolve('playwright'));
  return `
const { chromium } = require(${playwrightPath});
const SENTINEL = ${JSON.stringify(SENTINEL)};

const ALLOWED = ${allowed};
const BASE_URL = 'https://test-automation-banking.vercel.app/';
const USERS = [
  { name: 'Leela', email: 'leela@gmail.com', password: 'Leela@123' },
  { name: 'Katy', email: 'katy@gmail.com', password: 'Katy@12354' },
  { name: 'Jyosthna', email: 'jyosthna@gmail.com', password: 'Jyos@123' },
];

const send = (o) => { try { process.stdout.write(SENTINEL + JSON.stringify(o) + '\\n'); } catch {} };

let _browser = null;
let _page = null;
let _lastShot = null;

function originOf(url) { try { return new URL(url).origin; } catch { return null; } }
function allowed(url) {
  const o = originOf(url);
  if (!o) return false;
  return ALLOWED.some((a) => o === a || o.startsWith(a));
}

async function launch(headless = true) {
  _browser = await chromium.launch({ headless: true });
  const context = await _browser.newContext({ viewport: { width: 1280, height: 720 } });

  // Fail-closed navigation gate, at the network layer so it catches redirects too, not just
  // explicit goto() calls. It gates TOP-LEVEL DOCUMENT navigation only: once the main frame is
  // on an allowed app, that app's own fonts, scripts and images are allowed to load, otherwise
  // every demo site renders broken and every run reports itself blocked.
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('about:')) return route.continue();
    const isTopLevel = request.isNavigationRequest() && request.frame().parentFrame() === null;
    if (!isTopLevel || allowed(url)) return route.continue();
    send({ event: 'blocked', url });
    return route.abort();
  });

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

async function login(page, user) {
  const u = user || USERS[0];
  await page.goto(BASE_URL);
  await page.getByPlaceholder('Enter Email').fill(u.email);
  await page.getByPlaceholder('Enter Password').fill(u.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/dashboard');
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

export type StartedRun = { run_id: string; done: Promise<RunResult> };

/**
 * Registers a stream and returns its id. The client attaches the WebSocket to this id and
 * only then POSTs /api/run - otherwise the browser has already navigated by the time the
 * socket is open and the first frames are lost.
 */
export function prepareRun(): string {
  const runId = crypto.randomUUID();
  streams.set(runId, { listeners: new Set(), buffered: [] });
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
  if (!streams.has(runId)) streams.set(runId, { listeners: new Set(), buffered: [] });
  active++;

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-run-'));
  const program = path.join(scratch, 'run.js');
  fs.writeFileSync(program, buildProgram(rewriteHarnessImports(req.code)));

  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let screenshot: string | null = null;
  let status: RunResult['status'] = 'ok';
  let error: RunResult['error'] = null;
  let blockedUrl: string | null = null;

  // Chromium needs a real Windows environment (SystemRoot, TEMP, LOCALAPPDATA) to start at
  // all, so the child gets the parent's env minus the secrets. Env is not the security
  // boundary here - the separate process, the timeout and the navigation allowlist are.
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (/ANTHROPIC|API_KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete childEnv[key];
  }

  const child = spawn(process.execPath, [program], {
    cwd: scratch,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const done = new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      status = 'timeout';
      child.kill('SIGKILL');
    }, config.run.timeout_ms);

    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const marker = line.indexOf(SENTINEL);
        if (marker === -1) {
          if (line.length) {
            stdout += line + '\n';
            emit(runId, { event: 'stdout', text: line });
          }
          continue;
        }
        // Anything before the marker is genuine learner output on the same line.
        const pre = line.slice(0, marker);
        if (pre.length) {
          stdout += pre + '\n';
          emit(runId, { event: 'stdout', text: pre });
        }
        try {
          const evt = JSON.parse(line.slice(marker + SENTINEL.length));
          if (evt.event === 'frame') {
            emit(runId, { event: 'frame', data: evt.data, width: evt.width, height: evt.height });
          } else if (evt.event === 'stdout') {
            stdout += evt.text + '\n';
            emit(runId, { event: 'stdout', text: evt.text });
          } else if (evt.event === 'blocked') {
            blockedUrl = evt.url;
            status = 'blocked';
          } else if (evt.event === 'result') {
            screenshot = evt.screenshot ?? null;
            if (evt.status === 'error') {
              // A blocked navigation CAUSES the error that follows it, so keep reporting the
              // block - it is the thing the learner can act on.
              if (status !== 'blocked') status = 'error';
              error = { message: stripAnsi(evt.message), stack: cleanStack(evt.stack ?? '') };
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
      stderr += chunk.toString('utf-8');
    });

    child.on('close', () => {
      clearTimeout(timer);
      active--;
      fs.rmSync(scratch, { recursive: true, force: true });
      if (status === 'ok' && stderr.trim() && !screenshot) status = 'error';
      emit(runId, { event: 'ended', status });
      setTimeout(() => streams.delete(runId), 30_000);
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
    });
  });

  emit(runId, { event: 'started' });
  return { run_id: runId, done };
}
