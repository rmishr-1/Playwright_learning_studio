/**
 * The Studio Tools window: one place to see the state of this computer (key, licences, apps,
 * what is published, git) and to run any of the studio's double-click jobs, in a real terminal
 * inside the window. The job runs under cmd.exe in a ConPTY (node-pty), so everything the .bat
 * files do when double-clicked - questions, [Y/n], the key's passphrase read without echo - works
 * exactly as it does in a console. One job at a time: they share desktop/build and release/.
 *
 * Runs from the staged copy tools/launch.ts makes (config.json beside this file says where the
 * studio is). The page is locked down as the launcher's windows are: no Node, context isolation,
 * a sandbox, a preload with a fixed set of calls, each checked to come from this window's page.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile, spawn as spawnProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type WebPreferences } from 'electron';
import * as pty from 'node-pty';
import { systemExe } from '../../backend/src/system-exe';
import { jobById, type Job } from './jobs';
import type { Folder, Form, Info, PickFile, RunResult } from './bridge-types';
import type { Status } from './status-types';

type Config = { root: string; desktop: string; electron: string; builtAt: string };
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8')) as Config;
const ROOT = CONFIG.root;
const DESKTOP = CONFIG.desktop;
const INDEX = path.join(__dirname, 'index.html');
const INDEX_URL = pathToFileURL(INDEX).href;

const SAFE: WebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  devTools: true,
  spellcheck: false,
  preload: path.join(__dirname, 'preload.js'),
};

/** What a form value may put on a command line: no quote, and none of cmd's own characters. */
const ARG = /^[^"%!^&|<>\r\n]{0,200}$/;
const CODE = /^[A-Za-z0-9]{2,8}(-full)?$/;

let win: BrowserWindow | null = null;
let current: { job: Job; pty: pty.IPty; startedAt: number } | null = null;

// ---------------------------------------------------------------- the window

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'Evoke Training Studio: Studio Tools',
    backgroundColor: '#f4f6fa',
    show: false,
    webPreferences: SAFE,
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (!current || !win) return;
    const answer = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Stop it and close', 'Keep it running'],
      defaultId: 1,
      cancelId: 1,
      message: '"' + current.job.title + '" is still running.',
      detail: 'Closing the window stops it where it is.',
    });
    if (answer === 1) e.preventDefault();
    else stopCurrent();
  });
  win.on('closed', () => {
    win = null;
  });
  void win.loadFile(INDEX);
}

// ---------------------------------------------------------------- running a job

/** A job's environment: a double-click's, with the window's own traces removed. */
function jobEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ELECTRON_RUN_AS_NODE|ELECTRON_NO_ATTACH_CONSOLE|npm_.*|INIT_CWD|NODE_OPTIONS)$/i.test(k)) continue;
    env[k] = v;
  }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path';
  env[pathKey] = (env[pathKey] ?? '')
    .split(';')
    .filter((p) => !/node_modules[\\/]\.bin/i.test(p))
    .join(';');
  env.STUDIO_TOOLS = '1';
  return env;
}

const quote = (a: string): string => (/[ \t]/.test(a) ? '"' + a + '"' : a);

/** cmd.exe's command line for a job. With /s, cmd strips the outer quotes and runs what is inside. */
function commandLine(job: Job, args: string[]): { line: string; cwd: string; shown: string } {
  if (job.command.kind === 'bat') {
    const file = path.join(ROOT, ...job.command.file.split('/'));
    if (!fs.existsSync(file)) throw new Error(job.command.file + ' is not in the studio folder.');
    const inner = '"' + file + '"' + args.map((a) => ' ' + quote(a)).join('');
    return { line: '/d /s /c "' + inner + '"', cwd: path.dirname(file), shown: inner };
  }
  const inner = 'npm run ' + job.command.script + (args.length ? ' --' + args.map((a) => ' ' + quote(a)).join('') : '');
  return { line: '/d /s /c "' + inner + '"', cwd: DESKTOP, shown: inner };
}

function run(req: { jobId: string; form: Form; cols: number; rows: number }): RunResult {
  if (current) return { error: '"' + current.job.title + '" is still running. One job at a time: they share the build folders.' };
  const job = jobById(req.jobId);
  if (!job) return { error: 'Unknown job.' };
  const form: Form = {};
  for (const [k, v] of Object.entries(req.form ?? {})) {
    if (typeof v === 'boolean') form[k] = v;
    else if (typeof v === 'string' && ARG.test(v)) form[k] = v;
    else return { error: 'The value for "' + k + '" contains a character a command line cannot carry (quotes, %, !, ^, &, |, <, >).' };
  }
  let args: string[];
  try {
    args = job.args(form);
  } catch (e) {
    return { error: (e as Error).message };
  }
  for (const a of args) if (!ARG.test(a)) return { error: 'An argument contains a character a command line cannot carry.' };
  let cmd: ReturnType<typeof commandLine>;
  try {
    cmd = commandLine(job, args);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const cols = Math.max(20, Math.min(400, Math.floor(req.cols) || 120));
  const rows = Math.max(5, Math.min(200, Math.floor(req.rows) || 30));
  let child: pty.IPty;
  try {
    child = pty.spawn(systemExe('cmd.exe'), cmd.line, { name: 'xterm-256color', cols, rows, cwd: cmd.cwd, env: jobEnv(), useConpty: true });
  } catch (e) {
    return { error: 'The terminal could not start: ' + (e as Error).message };
  }
  const startedAt = Date.now();
  current = { job, pty: child, startedAt };
  win?.webContents.send('tools:started', { jobId: job.id, commandLine: cmd.shown, startedAt: new Date(startedAt).toISOString() });
  child.onData((data) => win?.webContents.send('tools:data', data));
  child.onExit(({ exitCode }) => {
    // Output can still be on its way: let it reach the page before the exit line.
    setImmediate(() => {
      if (current?.pty === child) current = null;
      win?.webContents.send('tools:exit', { jobId: job.id, code: exitCode, durationMs: Date.now() - startedAt });
    });
  });
  return { ok: true, commandLine: cmd.shown };
}

/** Stops the job and everything it started (cmd.exe's whole tree), as the studio's Terminal does. */
function stopCurrent(): void {
  const c = current;
  if (!c) return;
  const done = (): void => {
    try {
      c.pty.kill();
    } catch {
      // Already gone.
    }
  };
  const killer = spawnProcess(systemExe('taskkill.exe'), ['/pid', String(c.pty.pid), '/T', '/F'], { windowsHide: true });
  killer.on('error', done);
  killer.on('exit', done);
}

// ---------------------------------------------------------------- status

function readStatus(github: boolean): Promise<Status | { error: string }> {
  if (current) return Promise.resolve({ error: 'busy' });
  const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const script = path.join(DESKTOP, 'tools', 'status.ts');
  if (!fs.existsSync(tsx)) return Promise.resolve({ error: 'The packages are not installed (run Set up): ' + tsx + ' is missing.' });
  const inner = 'node "' + tsx + '" "' + script + '" --json' + (github ? ' --github' : '');
  return new Promise((resolve) => {
    execFile(
      systemExe('cmd.exe'),
      ['/d', '/s', '/c', '"' + inner + '"'],
      { cwd: DESKTOP, env: jobEnv(), windowsHide: true, windowsVerbatimArguments: true, maxBuffer: 8 * 1024 * 1024, timeout: github ? 90_000 : 60_000 },
      (err, stdout, stderr) => {
        const text = String(stdout ?? '');
        const line = text.split(/\r?\n/).find((l) => l.startsWith('{'));
        if (line) {
          try {
            resolve(JSON.parse(line) as Status);
            return;
          } catch {
            // Fall through.
          }
        }
        resolve({ error: 'The status could not be read.' + (err ? ' ' + err.message : '') + (stderr ? '\n' + String(stderr).slice(0, 2000) : '') });
      },
    );
  });
}

// ---------------------------------------------------------------- IPC, only from this window's page

const fromPage = (e: Electron.IpcMainInvokeEvent): boolean => !!win && e.sender.id === win.webContents.id && (e.senderFrame?.url ?? '') === INDEX_URL;

function handle<T>(channel: string, fn: (arg: T) => unknown): void {
  ipcMain.handle(channel, (e, arg: T) => {
    if (!fromPage(e)) throw new Error('Not allowed.');
    return fn(arg);
  });
}

function folderOf(req: { what: Folder; code?: string }): string | null {
  switch (req.what) {
    case 'root':
      return ROOT;
    case 'desktop':
      return DESKTOP;
    case 'licences':
      return path.join(DESKTOP, 'licences');
    case 'key-dir':
      return process.env.STUDIO_KEY_DIR || path.join(os.homedir(), '.evoke-studio');
    case 'deliveries':
      return req.code && CODE.test(req.code) ? path.join(DESKTOP, 'deliveries', req.code) : path.join(DESKTOP, 'deliveries');
    default:
      return null;
  }
}

function registerIpc(): void {
  handle<void>('tools:info', (): Info => ({
    root: ROOT,
    desktop: DESKTOP,
    electron: process.versions.electron,
    windowsBuild: Number(os.release().split('.')[2]) || 0,
    builtAt: CONFIG.builtAt,
  }));
  handle<void>('tools:status', () => readStatus(false));
  handle<void>('tools:check-github', async () => {
    const s = await readStatus(true);
    return 'error' in s ? s : (s.github ?? { error: 'GitHub was not asked.' });
  });
  handle<{ jobId: string; form: Form; cols: number; rows: number }>('tools:run', (req) => run(req));
  handle<string>('tools:input', (data) => {
    if (current && typeof data === 'string') current.pty.write(data);
  });
  handle<{ cols: number; rows: number }>('tools:resize', (size) => {
    if (!current) return;
    const cols = Math.max(20, Math.min(400, Math.floor(size.cols) || 120));
    const rows = Math.max(5, Math.min(200, Math.floor(size.rows) || 30));
    try {
      current.pty.resize(cols, rows);
    } catch {
      // The job has just ended.
    }
  });
  handle<void>('tools:stop', () => stopCurrent());
  handle<PickFile>('tools:pick-file', async (req) => {
    if (!win) return null;
    const filters = (req.filters ?? []).map((f) => ({ name: String(f.name), extensions: f.extensions.map(String) }));
    if (req.mode === 'save') {
      const r = await dialog.showSaveDialog(win, { title: req.title, filters, defaultPath: req.defaultPath });
      return r.canceled || !r.filePath ? null : r.filePath;
    }
    const r = await dialog.showOpenDialog(win, { title: req.title, filters, properties: ['openFile'] });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
  });
  handle<{ what: Folder; code?: string }>('tools:open-folder', async (req) => {
    const dir = folderOf(req);
    if (dir && fs.existsSync(dir)) await shell.openPath(dir);
  });
}

// ---------------------------------------------------------------- the app

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('before-quit', () => stopCurrent());
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
  });
}
