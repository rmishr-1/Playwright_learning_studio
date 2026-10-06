/**
 * The desktop app's main process: the launcher. The studio itself (its backend and its page) and the
 * course are not installed: they are downloaded at every start, encrypted, and opened in memory.
 *
 *   1. Refuses to run under a debugger in a release build.
 *   2. Asks for a licence until it has a valid one (licence.ts), in the launch window (setup.html).
 *   3. Downloads the studio's code and the course from Evoke's distribution repositories on GitHub
 *      (release.ts) and opens them with the licence's seal and the app's secret: the licence alone,
 *      or the app alone, opens nothing. Without the internet the studio does not open.
 *   4. Runs the studio's code (bundle-loader.ts), which starts its server on 127.0.0.1 with a new
 *      random token, and opens the studio in a window that holds the token as a cookie. Nothing else
 *      on the computer can use the API.
 *   5. At quit, stops the studio and takes the course's traces off the disk again (cleanup.ts).
 *
 * Every window is locked down: no Node in the page, context isolation, a sandbox, no DevTools in a
 * release build, no navigating away from the studio. Links elsewhere open in the learner's browser.
 */
import './env';
import { APP_DIR, RUNTIME_DIR, USER_DIR } from './env';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type WebContents,
  type WebPreferences,
} from 'electron';
import { fingerprint, machineCode, verify, type Licence, type LicenceFile, type Verdict } from './licence';
import { systemExe } from '../../backend/src/system-exe';
import { execFileSync } from 'node:child_process';
import { NetworkError, openReleases, publishedDay, type Opened } from './release';
import { ReleaseError, appSecretFingerprint, unpackContainer } from './release-format';
import { openFetchSession, type Fetcher } from './fetch-session';
import { RuntimeError, ensureRuntime, forgetPiece, isInstalled, type RuntimePiece } from './runtime-install';
import { checkRuntimePiece, checkUnpacked, type RuntimeFiles } from './integrity';
import * as originalFs from 'original-fs';
import { loadBundle } from './bundle-loader';
import { SetupError, runSetupSteps } from './setup-steps';
import { removeCourseLeftovers } from './cleanup';
import type { RunningStudio, StudioHostV1 } from '../../shared/studio-host';

declare const __STUDIO_RELEASE__: boolean;
declare const __STUDIO_BUILD__: {
  /** The variant's name (desktop/variants.json): "Evoke Training Studio", "Evoke Training Studio BU". */
  product: string;
  /** The variant's Windows identity, the same as its installer's shortcuts carry. */
  appId: string;
  version: string;
  publicKey: string;
  /** Set in a build made for one customer: the only licence it accepts. */
  onlyId: string | null;
  /** Fingerprints of licence files Evoke has withdrawn (desktop/revoked.json). */
  revoked: string[];
  /** The day the app was built (YYYY-MM-DD): no licence check counts a day before it. */
  built: string;
  /** The launcher API (shared/studio-host.ts): which channel of the app repository it reads. */
  api: number;
  /** Where the course and the studio's code are downloaded from (distribution.json); null in a development build without them. */
  dist: { content: string; app: string } | null;
  /** What this variant's Run scratch folders are called (backend/src/config.ts RUN_PREFIX). */
  runPrefix: string;
  /** The hash of the app secret built in, to check the halves against. */
  secretFingerprint: string | null;
  /**
   * Node and the browsers: carried in the app's resources (a full build), or downloaded on the first
   * start from their official servers (a standard build), checked against these pins
   * (runtime-sources.json, runtime-install.ts).
   */
  runtime: { mode: 'bundled' } | { mode: 'download'; allow: string[]; pieces: RuntimePiece[] };
};
/** The app secret, as two halves that XOR to it (scripts/build.ts); null in a development build without one. */
declare const __STUDIO_SECRET__: [string, string] | null;

const RELEASE = __STUDIO_RELEASE__;
const BUILD = __STUDIO_BUILD__;
/** The navy title bar's height, in pixels: Windows' buttons on it and the page's strip under them. */
const TITLE_BAR_HEIGHT = 28;
/** What the launcher keeps about releases: the manifests it accepted (no course), and the setup steps done. */
const STATE_DIR = path.join(USER_DIR, 'release-state');

// ---------------------------------------------------------------- start-up guards

// A release build takes no command-line arguments at all. Electron's and Chromium's switches can
// attach a debugger, route the app's traffic through a proxy, or write it all to a log file
// (--remote-debugging-port, --proxy-server, --log-net-log, ...), and any of those would hand out
// the token and the decrypted course. On Windows Chromium also reads /switch, so nothing is let
// through by its first character. The app never needs an argument: its shortcut passes none.
// Chromium's own parser is asked about the worst switches as well: that second check matters only
// if a switch ever reaches Chromium some other way than the command line.
const DANGEROUS_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'js-flags',
  'proxy-server',
  'proxy-pac-url',
  'proxy-bypass-list',
  'log-net-log',
  'net-log-capture-mode',
  'enable-logging',
  'v',
  'vmodule',
  'host-rules',
  'host-resolver-rules',
  'user-data-dir',
  'disable-web-security',
  'ignore-certificate-errors',
];
if (RELEASE && (process.argv.length > 1 || DANGEROUS_SWITCHES.some((s) => app.commandLine.hasSwitch(s)))) app.exit(1);
// The taskbar groups and pins windows by this ID: each variant keeps its own button, matching the
// shortcuts its installer made.
app.setAppUserModelId(BUILD.appId);
if (!app.requestSingleInstanceLock()) app.exit(0);

Menu.setApplicationMenu(null);

/**
 * The setup window's page and logo come out of app.asar through the app's own studio:// address.
 * A file:// page cannot read inside app.asar once the GrantFileProtocolExtraPrivileges fuse is off
 * (the window would stay blank), and only these two files can be asked for.
 */
const SETUP_ORIGIN = 'studio://app';
const SETUP_FILES: Record<string, string> = { '/setup.html': 'text/html; charset=utf-8', '/logo.png': 'image/png' };
/** The setup windows' contents, the only ones that may show studio:// pages. */
const setupContents = new Set<number>();
protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true } }]);

function serveSetupFiles(): void {
  protocol.handle('studio', (request) => {
    const { host, pathname } = new URL(request.url);
    const type = SETUP_FILES[pathname];
    if (host !== 'app' || !type) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(path.join(APP_DIR, pathname.slice(1)))), { headers: { 'content-type': type } });
  });
}

// ---------------------------------------------------------------- licence and agreement

const LICENCE_FILE = path.join(USER_DIR, 'licence.lic');
const BUILT_IN_LICENCE = path.join(APP_DIR, 'licence.lic');
const MACHINE = machineCode();

/**
 * Today, as far as the licence is concerned: never earlier than the latest day the app has seen, so
 * turning the computer's clock back does not bring an expired licence back to life. That day is
 * read from several marks: the day the app built into it was made, the day it records, and the
 * days its own files were last written (two folders deep, but never the workspaces, where the
 * learner's own code writes), so deleting or editing a few files does not reset it. (verify() also never counts a day before the licence
 * was issued.)
 */
const LAST_SEEN_FILE = path.join(USER_DIR, 'last-seen.json');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The day the newest release this start downloaded was published: no clock is earlier than that. */
let publishedFloor = '';
function licenceToday(): { today: string; now: string } {
  const now = new Date().toISOString().slice(0, 10);
  const marks: string[] = [publishedFloor];
  try {
    marks.push((JSON.parse(fs.readFileSync(LAST_SEEN_FILE, 'utf-8')) as { day: string }).day);
  } catch {
    // No record yet.
  }
  marks.push(BUILD.built);
  // The files the app itself writes: the ones it always has first, then others two folders deep,
  // at most a few hundred. Never the workspaces: the learner's own code writes there, and a date it
  // set would lock them out.
  // eula-accepted.json: written by earlier versions, which asked for the agreement to be accepted.
  for (const known of ['Progress/progress.json', 'Local State', 'Preferences', 'eula-accepted.json', 'licence.lic']) {
    try {
      marks.push(fs.statSync(path.join(USER_DIR, known)).mtime.toISOString().slice(0, 10));
    } catch {
      // Not there yet.
    }
  }
  let seen = 0;
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (++seen > 400) return;
      if (depth === 0 && e.name.toLowerCase() === 'workspace') continue;
      const full = path.join(dir, e.name);
      try {
        marks.push(fs.statSync(full).mtime.toISOString().slice(0, 10));
      } catch {
        continue;
      }
      if (e.isDirectory() && depth < 2 && !e.isSymbolicLink()) walk(full, depth + 1);
    }
  };
  walk(USER_DIR, 0);
  const today = marks.filter((d) => DAY.test(d)).reduce((a, b) => (b > a ? b : a), now);
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(LAST_SEEN_FILE, JSON.stringify({ day: today }));
  } catch {
    // Not being able to record the day must not stop the app.
  }
  return { today, now };
}

/** Licence files Evoke has withdrawn since this copy was built, as the latest release lists them. */
let releaseRevoked: string[] = [];

function check(text: string): Verdict {
  const { today, now } = licenceToday();
  const verdict = verify(text, BUILD.publicKey, { onlyId: BUILD.onlyId, machine: MACHINE, today, revoked: [...BUILD.revoked, ...releaseRevoked] });
  // The seal is half of what opens the course: a licence without one (issued before seals) opens nothing.
  if (verdict.ok && !verdict.licence.seal) {
    return { ok: false, reason: 'This licence was issued before the current course system and cannot open it. Please request a new licence file from Evoke.', licence: verdict.licence };
  }
  // Said plainly when it is the clock, not the licence, that is wrong.
  if (!verdict.ok && verdict.expired && verdict.licence?.expires && now <= verdict.licence.expires) {
    return {
      ...verdict,
      reason:
        "This computer's clock says " + now + ', but the application has already been used on ' + today + ', which is after this licence ' +
        'expired (' + verdict.licence.expires + '). Please set the clock to the correct date. If it was previously set ahead in error, please ' +
        'request a renewed licence from Evoke; the application retains the latest date it has observed.',
    };
  }
  return verdict;
}

/** The licence the learner added, else the one built into a customer's copy, with its file's fingerprint. */
function currentLicence(): Verdict & { fingerprint?: string } {
  let verdict: Verdict = { ok: false, reason: '' };
  for (const file of [LICENCE_FILE, BUILT_IN_LICENCE]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf-8');
    verdict = check(text);
    if (verdict.ok) return { ...verdict, fingerprint: fingerprint(JSON.parse(text) as LicenceFile) };
  }
  return verdict;
}

/**
 * What the launch window shows: the licence step, the download's progress, or a problem the
 * learner can retry (no internet, GitHub busy) or must take to Evoke.
 */
type SetupState = {
  step: 'licence' | 'working' | 'problem';
  product: string;
  version: string;
  machine: string;
  /** licence: why the licence there is refused, if one is. */
  reason: string;
  /** working: what is happening; problem: what went wrong. */
  message: string;
  /** problem: what to do about it. */
  detail: string;
};

const SAFE: WebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  devTools: !RELEASE,
  spellcheck: false,
};

type LaunchWindow = {
  /** Shows progress. */
  working(message: string): void;
  /** Asks for a licence file until a valid one is chosen. */
  askLicence(reason: string): Promise<Licence>;
  /** Shows a problem; resolves when the learner presses Retry. */
  problem(message: string, detail: string): Promise<void>;
  /** Closes the window, once the studio's own window is there: with no window at all for a moment, the app would quit. */
  close(): void;
};

/** The launch window: one window from the licence to the studio opening. Closing it quits. */
function openLaunchWindow(): LaunchWindow {
  const win = new BrowserWindow({
    width: 780,
    height: 680,
    minWidth: 560,
    minHeight: 480,
    title: BUILD.product,
    backgroundColor: '#f4f6fa',
    show: false,
    webPreferences: { ...SAFE, preload: path.join(APP_DIR, 'setup-preload.js') },
  });
  setupContents.add(win.webContents.id);
  let done = false;
  let state: SetupState = {
    step: 'working',
    product: BUILD.product,
    version: BUILD.version,
    machine: MACHINE,
    reason: '',
    message: 'Starting',
    detail: '',
  };
  let onLicence: ((l: Licence) => void) | null = null;
  let onRetry: (() => void) | null = null;
  const set = (next: Partial<SetupState>): SetupState => {
    state = { ...state, ...next };
    if (!win.isDestroyed()) win.webContents.send('setup:update', state);
    return state;
  };

  // Only the launch page, in the launch window, may call these.
  const fromSetup = (e: Electron.IpcMainInvokeEvent): boolean =>
    e.sender.id === win.webContents.id && (e.senderFrame?.url ?? '') === SETUP_ORIGIN + '/setup.html';
  const channels = ['setup:state', 'setup:choose', 'setup:copy-machine', 'setup:retry', 'setup:quit'];
  const handle = (channel: string, fn: () => unknown): void =>
    ipcMain.handle(channel, (e) => {
      if (!fromSetup(e)) throw new Error('Not allowed.');
      return fn();
    });
  handle('setup:state', () => state);
  handle('setup:choose', async () => {
    if (state.step !== 'licence') return state;
    const picked = await dialog.showOpenDialog(win, {
      title: 'Choose your licence file',
      filters: [{ name: 'Licence', extensions: ['lic', 'json'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths[0]) return state;
    const text = fs.readFileSync(picked.filePaths[0], 'utf-8');
    const verdict = check(text);
    if (!verdict.ok) return set({ reason: verdict.reason });
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(LICENCE_FILE, text);
    const saved = currentLicence();
    if (!saved.ok) return set({ reason: saved.reason });
    const resolve = onLicence;
    onLicence = null;
    set({ step: 'working', message: 'Starting', reason: '' });
    resolve?.(saved.licence);
    return state;
  });
  handle('setup:copy-machine', () => clipboard.writeText(MACHINE));
  handle('setup:retry', () => {
    if (state.step !== 'problem') return state;
    const resolve = onRetry;
    onRetry = null;
    set({ step: 'working', message: 'Starting', detail: '' });
    resolve?.();
    return state;
  });
  handle('setup:quit', () => app.quit());
  win.on('closed', () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
    if (!done) app.quit();
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(SETUP_ORIGIN + '/setup.html');

  return {
    working: (message) => void set({ step: 'working', message, detail: '' }),
    askLicence: (reason) =>
      new Promise((resolve) => {
        onLicence = resolve;
        set({ step: 'licence', reason, message: '', detail: '' });
      }),
    problem: (message, detail) =>
      new Promise((resolve) => {
        onRetry = resolve;
        set({ step: 'problem', message, detail });
      }),
    close: () => {
      done = true;
      if (!win.isDestroyed()) win.close();
    },
  };
}

// ---------------------------------------------------------------- the course and the studio's code

/** The app secret, from its halves, checked against the hash built beside them. */
function appSecret(): Buffer | null {
  if (!__STUDIO_SECRET__) return null;
  const [a, b] = __STUDIO_SECRET__.map((h) => Buffer.from(h, 'hex'));
  const secret = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) secret[i] = a[i] ^ b[i];
  if (appSecretFingerprint(secret) !== BUILD.secretFingerprint) throw new Error('This copy of the studio is damaged. Install it again.');
  return secret;
}

/** Text files of a folder, by their path in it: the course as `npm run build:content` writes it. */
function readFolder(dir: string, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) for (const [p, t] of readFolder(path.join(dir, e.name), prefix + e.name + '/')) out.set(p, t);
    else if (e.name.endsWith('.json')) out.set(prefix + e.name, fs.readFileSync(path.join(dir, e.name), 'utf-8'));
  }
  return out;
}

/**
 * A test server on 127.0.0.1 a development build may be pointed at, in place of GitHub
 * (STUDIO_DIST_BASE) or the runtime's official servers (STUDIO_RUNTIME_BASE). A release never is.
 */
const localBase = (name: string): string | null =>
  !RELEASE && /^http:\/\/127\.0\.0\.1:\d{1,5}\/$/.test(process.env[name] ?? '') ? process.env[name]! : null;
const DIST_OVERRIDE = localBase('STUDIO_DIST_BASE');
const RUNTIME_OVERRIDE = localBase('STUDIO_RUNTIME_BASE');

/** Where the course and the studio's code are downloaded from. */
const distBase = (): { content: string; app: string } | null =>
  DIST_OVERRIDE ? { content: DIST_OVERRIDE + 'content/', app: DIST_OVERRIDE + 'app/' } : BUILD.dist;

/** What a standard build downloads on its first start: none for a full build. */
function runtimePieces(): RuntimePiece[] {
  if (BUILD.runtime.mode !== 'download') return [];
  return BUILD.runtime.pieces.map((p) => (RUNTIME_OVERRIDE ? { ...p, urls: [RUNTIME_OVERRIDE + p.name + '.zip'] } : p));
}

/** The one session the launcher downloads with (fetch-session.ts), made once. */
let fetcherMade: Promise<Fetcher> | null = null;
function fetcher(): Promise<Fetcher> {
  if (!fetcherMade) {
    const base = distBase();
    const runtime = BUILD.runtime.mode === 'download' ? (RUNTIME_OVERRIDE ? [RUNTIME_OVERRIDE] : BUILD.runtime.allow) : [];
    fetcherMade = openFetchSession(base ? [base.content, base.app] : [], runtime, DIST_OVERRIDE !== null || RUNTIME_OVERRIDE !== null).catch((e: unknown) => {
      fetcherMade = null;
      throw e;
    });
  }
  return fetcherMade;
}

const MB = 1024 * 1024;
const PIECE_NAMES: Record<string, string> = {
  chromium: 'Chromium',
  chromium_headless_shell: 'Chromium (headless)',
  firefox: 'Firefox',
  webkit: 'WebKit',
  ffmpeg: 'ffmpeg',
  winldd: 'winldd',
};
const pieceName = (p: RuntimePiece): string => (p.kind === 'node' ? 'Node.js' : (PIECE_NAMES[p.name.replace(/-\d+$/, '')] ?? p.name));

/**
 * A standard build's first start, or the first after an update that pins other versions: Node and
 * the browsers, downloaded from their official servers and checked (runtime-install.ts). Pieces
 * already in place are kept, so Retry carries on where a failed start stopped.
 */
async function installRuntime(launch: LaunchWindow): Promise<void> {
  const pieces = runtimePieces();
  // A piece installed earlier that has changed since (integrity.ts) is downloaded and checked again.
  let repair = false;
  if (CHECK_FILES) {
    const files = runtimeFiles();
    for (const piece of pieces) {
      const want = files[piece.name];
      if (want && isInstalled(RUNTIME_DIR, piece) && (await checkRuntimePiece(originalFs, RUNTIME_DIR, want)) !== null) {
        forgetPiece(RUNTIME_DIR, piece);
        repair = true;
      }
    }
  }
  if (!pieces.length || pieces.every((p) => isInstalled(RUNTIME_DIR, p))) return;
  const once = repair ? '' : ' (first start only)';
  const { download } = await fetcher();
  let shown = 0;
  await ensureRuntime(RUNTIME_DIR, pieces, download, {
    onProgress: (p) => {
      const now = Date.now();
      if (p.phase === 'download' && now - shown < 250 && p.bytes < p.piece.size) return;
      shown = now;
      launch.working(
        p.phase === 'unpack'
          ? (repair ? 'Repairing ' : 'Installing ') + pieceName(p.piece) + once
          : 'Downloading required components' + once + ': ' + Math.floor(p.done / MB) + ' MB of ' + Math.ceil(p.total / MB) + ' MB',
      );
    },
  });
}

/** Whether this start checks the files outside app.asar (integrity.ts): a release, as installed. */
const CHECK_FILES = RELEASE && app.isPackaged;

/** What Node and the browsers are checked against: runtime-files.json, inside app.asar (scripts/build.ts). */
function runtimeFiles(): RuntimeFiles {
  return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'runtime-files.json'), 'utf-8')) as RuntimeFiles;
}

/**
 * The first program file outside app.asar that has changed since the app was installed, or null:
 * the packages the learner's code runs on, and in a full build Node and the browsers too (a
 * standard build checks those as it starts them, installRuntime).
 */
async function changedAppFile(): Promise<string | null> {
  if (!CHECK_FILES) return null;
  const unpacked = await checkUnpacked(originalFs, path.join(process.resourcesPath, 'app.asar'));
  if (unpacked) return path.join('resources', 'app.asar.unpacked', ...unpacked.split('/'));
  if (BUILD.runtime.mode === 'download') return null;
  for (const piece of Object.values(runtimeFiles())) {
    const wrong = await checkRuntimePiece(originalFs, RUNTIME_DIR, piece);
    if (wrong) return path.join('resources', ...wrong.split('/'));
  }
  return null;
}

/** What went wrong setting up Node and the browsers, said so the learner (or their IT team) knows what to do. */
function explainRuntime(e: unknown): { message: string; detail: string } {
  const size = Math.ceil(runtimePieces().reduce((sum, p) => sum + p.size, 0) / MB);
  if (e instanceof RuntimeError) {
    if (e.code === 'space') return { message: 'There is not enough free disk space.', detail: e.message + ' Please free some disk space, then select Retry.' };
    if (e.code === 'checksum') {
      return {
        message: 'A download could not be verified.',
        detail:
          e.message + ' Please select Retry to download it again. If the problem persists, please contact your IT department, as downloads on this ' +
          'network may be altered in transit.',
      };
    }
    return { message: 'The required components could not be installed.', detail: e.message + ' Please select Retry.' };
  }
  if (e instanceof NetworkError) {
    if (e.code === 'certificate') {
      return {
        message: 'The connection could not be verified.',
        detail: 'A device on this network is intercepting secure connections. Please contact your IT department. (' + e.message + ')',
      };
    }
    return {
      message: 'The required components could not be downloaded.',
      detail:
        'On its first start, the application downloads the components it needs to run the course (approximately ' + size + ' MB). The internet could ' +
        'not be reached. Please check the connection, then select Retry; completed downloads are retained. On a corporate network, your IT department ' +
        'may need to allow the websites listed in the installation guide provided by Evoke. (' + e.message + ')',
    };
  }
  return { message: 'The application could not start.', detail: (e as Error)?.message ?? String(e) };
}

/**
 * The studio's code and the course for this start. A development build made with a local bundle
 * (build.ts devLocal) opens them from this computer; every other build downloads them. A development
 * build may be pointed at a test server on 127.0.0.1 (STUDIO_DIST_BASE); a release never.
 */
async function fetchStudio(licence: Licence, licenceFingerprint: string, progress: (text: string) => void): Promise<Opened> {
  if (!RELEASE) {
    const local = path.join(APP_DIR, 'dev-local.json');
    if (fs.existsSync(local)) {
      const where = JSON.parse(fs.readFileSync(local, 'utf-8')) as { bundle: string; content: string };
      const stamp = { format: 1, version: 1, published: new Date().toISOString().slice(0, 19) + 'Z', release: { id: '0'.repeat(32), payload: 1, kek: 1 } };
      return {
        app: { manifest: { ...stamp, kind: 'app', channel: 'api-' + BUILD.api, blob: { path: 'blobs/' + '0'.repeat(64) + '.bin', sha256: '0'.repeat(64), size: 1 }, grants: {}, revoked: [], minApp: null, setup: [], retired: null }, files: unpackContainer(fs.readFileSync(where.bundle)) },
        content: { manifest: { ...stamp, kind: 'content', channel: 'content', blob: { path: 'blobs/' + '0'.repeat(64) + '.bin', sha256: '0'.repeat(64), size: 1 }, grants: {}, revoked: [], minApp: null, setup: [], retired: null }, files: readFolder(where.content) },
      } as Opened;
    }
  }
  const base = distBase();
  if (!base) throw new Error('This build does not say where to download the course from.');
  const secret = appSecret();
  if (!secret) throw new Error('This build cannot open the course.');
  try {
    return await openReleases({
      base,
      publicKey: BUILD.publicKey,
      seal: licence.seal ?? '',
      licenceFingerprint,
      secret,
      api: BUILD.api,
      stateDir: STATE_DIR,
      get: (await fetcher()).get,
      progress,
    });
  } finally {
    secret.fill(0);
  }
}

/** What went wrong at the start, said so the learner knows what to do. Withdrawn licences go back to the licence step. */
function explain(e: unknown, licence: Licence): { message: string; detail: string } {
  if (e instanceof NetworkError) {
    switch (e.code) {
      case 'rate-limited':
        return {
          message: 'The service is temporarily busy.',
          detail: 'The latest course could not be downloaded because the service is busy. Please wait a few minutes, then select Retry.',
        };
      case 'certificate':
        return {
          message: 'The connection could not be verified.',
          detail: 'A device on this network is intercepting secure connections. Please contact your IT department. (' + e.message + ')',
        };
      case 'not-found':
        return { message: 'The course could not be located.', detail: 'Please try again in a few minutes. If the problem persists, please contact Evoke.' };
      case 'timeout':
        return { message: 'The download took too long.', detail: 'The connection may be slow. Please select Retry to try again.' };
      default:
        return { message: 'The application requires an internet connection to start.', detail: '' };
    }
  }
  if (e instanceof ReleaseError) {
    switch (e.code) {
      case 'no-access':
        return { message: 'This licence does not have access to the course yet.', detail: 'Please ask Evoke to grant licence ' + licence.id + ' access, then select Retry.' };
      case 'retired':
      case 'too-old':
        return {
          message: 'Install the new version of the application.',
          detail: (e.code === 'retired' ? e.message + ' ' : '') + 'This version can no longer open the course. Your progress is retained when you install the new version.',
        };
      default:
        return {
          message: 'The download could not be verified.',
          detail: 'The downloaded files do not match what Evoke published (' + e.message + '). Please select Retry. If the problem persists, please contact Evoke.',
        };
    }
  }
  if (e instanceof SetupError) return { message: 'The application could not complete its setup.', detail: e.message + ' Please select Retry.' };
  return { message: 'The application could not start.', detail: (e as Error)?.message ?? String(e) };
}

// ---------------------------------------------------------------- the studio

let instance: RunningStudio | null = null;
let versions = { app: 0, content: 0 };

/**
 * The port is chosen at random the first time and kept, because the page keeps its settings
 * (theme, layout) per address. The studio takes any free port if that one is taken.
 */
function keptPort(): number {
  try {
    const port = (JSON.parse(fs.readFileSync(path.join(USER_DIR, 'port.json'), 'utf-8')) as { port: number }).port;
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch {
    // None kept yet.
  }
  return 20000 + crypto.randomInt(30000);
}

function about(win: BrowserWindow, licence: Licence): void {
  void dialog.showMessageBox(win, {
    type: 'info',
    title: 'About ' + BUILD.product,
    message: BUILD.product + ' ' + BUILD.version,
    detail:
      'Licensed to ' +
      licence.licensee +
      '\nLicence ' +
      licence.id +
      (licence.expires ? ', valid until ' + licence.expires : '') +
      '\nMachine code ' +
      MACHINE +
      '\nApplication release ' + versions.app + ', course release ' + versions.content +
      '\n\nThird-party software notices: ' +
      path.join(process.resourcesPath, 'legal', 'THIRD-PARTY-NOTICES.txt'),
  });
}

/** Runs the downloaded studio and opens its window. */
async function openStudio(licence: Licence, opened: Opened, launch: LaunchWindow): Promise<void> {
  const files = opened.app.files;
  const code = files.get('studio-app.js');
  if (!code) throw new Error('The studio that was downloaded is incomplete.');
  const bundle = loadBundle(code.toString('utf-8'), APP_DIR);
  const shared = {
    api: 1 as const,
    release: RELEASE,
    launcher: { product: BUILD.product, appId: BUILD.appId, version: BUILD.version, built: BUILD.built },
    licence: { id: licence.id, licensee: licence.licensee, logo: licence.logo ?? null, expires: licence.expires },
    content: { version: opened.content.manifest.version, published: opened.content.manifest.published, files: opened.content.files },
    log: (level: 'info' | 'warn' | 'error', message: string) => (level === 'error' ? console.error : console.log)('[studio] ' + message),
  };
  await runSetupSteps(opened.app.manifest.setup, bundle, { ...shared, progress: (text) => launch.working(text) }, STATE_DIR, files, path.join(USER_DIR, 'Workspace'));

  launch.working('Opening the studio');
  const web = new Map<string, Uint8Array>();
  for (const [p, b] of files) if (p.startsWith('web/')) web.set(p.slice(4), b);
  const token = crypto.randomBytes(32).toString('hex');
  const host: StudioHostV1 = { ...shared, web, token, port: keptPort() };
  instance = await bundle.start(host);
  versions = { app: opened.app.manifest.release.payload, content: opened.content.manifest.release.payload };
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(path.join(USER_DIR, 'port.json'), JSON.stringify({ port: instance.port }));
  const origin = 'http://127.0.0.1:' + instance.port;
  await session.defaultSession.cookies.set({
    url: origin,
    name: 'studio_token',
    value: token,
    httpOnly: true,
    sameSite: 'strict',
  });

  // The window's title bar is left blank, in every build: the build's own name stays its program,
  // installer, shortcuts and setup window, and the licensee is in the About box (F1).
  const title = '';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title,
    backgroundColor: '#f4f6fa',
    // The title bar in the header's navy (the same in every theme). Windows cannot recolour its own
    // title bar, so it is hidden and the page draws one in its place: a slim strip (TITLE_BAR_HEIGHT)
    // above the header, with Windows' minimise, maximise and close buttons on it in the same navy.
    // The strip is what moves the window (frontend-c: App.tsx and styles.css, "the desktop app's
    // title bar").
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e1f45', symbolColor: '#ffffff', height: TITLE_BAR_HEIGHT },
    show: false,
    webPreferences: SAFE,
  });
  // The window keeps its own title, whatever the page sets.
  win.on('page-title-updated', (e) => e.preventDefault());
  studioOrigin = origin;
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F1') about(win, licence);
  });
  // The page draws the navy title bar strip (its .titlebar), at the height of the buttons above;
  // only this app sets it, so the strip has no height anywhere else.
  win.webContents.on('dom-ready', () => {
    void win.webContents.insertCSS(':root { --desktop-titlebar-height: ' + TITLE_BAR_HEIGHT + 'px; }');
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  await win.loadURL(origin + '/');
}

/** Tells the learner, when the studio opens, that their licence ends within two weeks. */
function warnOfExpiry(licence: Licence): void {
  if (!licence.expires) return;
  const days = Math.round((Date.parse(licence.expires + 'T00:00:00Z') - Date.parse(licenceToday().today + 'T00:00:00Z')) / 86_400_000);
  if (days > 14) return;
  const win = BrowserWindow.getAllWindows()[0];
  const message = {
    type: 'info' as const,
    title: BUILD.product,
    message: days <= 0 ? 'Your licence expires today.' : 'Your licence expires in ' + days + (days === 1 ? ' day' : ' days') + ', on ' + licence.expires + '.',
    detail: 'Please request a renewed licence from your training contact or from Evoke to continue using the application after this date.',
  };
  void (win ? dialog.showMessageBox(win, message) : dialog.showMessageBox(message));
}

// ---------------------------------------------------------------- every window

let studioOrigin = '';
/** The studio's own address, over http or, for the live view, ws. */
const sameOrigin = (url: string): boolean => {
  if (studioOrigin === '') return false;
  const u = url.replace(/^ws:/, 'http:');
  return u === studioOrigin || u.startsWith(studioOrigin + '/');
};

function openOutside(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

/**
 * Zoom, as a browser has it: Ctrl with +, - and 0, and Ctrl with the mouse wheel (a touchpad pinch
 * sends the same). The app has no menu, which is where Electron keeps those shortcuts, so every
 * window handles them itself. From 50% to 200%, a tenth at a time; Ctrl+0 is 100% again.
 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
function zoomBy(contents: WebContents, step: number | null): void {
  const next = step === null ? 1 : Math.round((contents.getZoomFactor() + step) * 10) / 10;
  contents.setZoomFactor(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
}

function allowZoom(contents: WebContents): void {
  contents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') zoomBy(contents, ZOOM_STEP);
    else if (input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract') zoomBy(contents, -ZOOM_STEP);
    else if (input.key === '0' || input.code === 'Numpad0') zoomBy(contents, null);
    else return;
    e.preventDefault();
  });
  contents.on('zoom-changed', (_e, direction) => zoomBy(contents, direction === 'in' ? ZOOM_STEP : -ZOOM_STEP));
}

function lockDown(contents: WebContents): void {
  allowZoom(contents);
  // Pop-outs (the detached live view starts as about:blank) open in the app; anything else, the
  // test report included (it is served apart from the studio, see server.ts), opens in the
  // learner's own browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (url === '' || url === 'about:blank' || sameOrigin(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: SAFE } };
    }
    openOutside(url);
    return { action: 'deny' };
  });
  // The studio's windows stay on the studio; the setup window on its own page.
  const stay = (e: { preventDefault: () => void }, url: string): void => {
    if (sameOrigin(url) || (url.startsWith(SETUP_ORIGIN + '/') && setupContents.has(contents.id))) return;
    e.preventDefault();
    openOutside(url);
  };
  contents.on('will-navigate', stay);
  contents.on('will-redirect', stay);
  contents.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame && !sameOrigin(e.url) && !e.url.startsWith('about:') && !e.url.startsWith('blob:') && !e.url.startsWith('data:')) e.preventDefault();
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
  if (RELEASE) {
    contents.on('devtools-opened', () => contents.closeDevTools());
  }
}

app.on('web-contents-created', (_e, contents) => lockDown(contents));

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

/**
 * Quitting: the studio is stopped (its server, every Run and Terminal command; at most 5 seconds),
 * the windows' cache is cleared, and the course's traces leave the disk (cleanup.ts). Then the app
 * quits for real.
 */
let cleanedUp = false;
let quitting = false;
function cleanUpNow(): void {
  try {
    removeCourseLeftovers(USER_DIR, BUILD.runPrefix);
  } catch {
    // Whatever is left, the next start takes.
  }
}
app.on('before-quit', (e) => {
  if (cleanedUp) return;
  e.preventDefault();
  if (quitting) return;
  quitting = true;
  void (async () => {
    try {
      await Promise.race([instance?.stop(), new Promise((r) => setTimeout(r, 5000))]);
    } catch {
      // Stopping failed: the process ends anyway, and its children with it.
    }
    instance = null;
    try {
      await session.defaultSession.clearCache();
    } catch {
      // Nothing cached, or it cannot be cleared now: the next start clears it (lockSession).
    }
    cleanUpNow();
    cleanedUp = true;
    app.quit();
  })();
});
// Windows signing out or shutting down does not wait for the above: the files go at once.
app.on('browser-window-created', (_e, win) => win.on('session-end', cleanUpNow));

app.on('window-all-closed', () => app.quit());

/**
 * The session every window uses: no proxy (so nothing can route the studio's traffic elsewhere),
 * no cache of what earlier versions kept, no request to anything but the studio and the app's own
 * pages (nothing the studio shows may reach out: only the launcher downloads, in a session of its own, fetch-session.ts), no studio token sent anywhere
 * but the studio, and no permissions beyond the clipboard.
 */
async function lockSession(): Promise<void> {
  const s = session.defaultSession;
  await s.setProxy({ mode: 'direct' });
  await s.clearCache();
  const local = (url: string): boolean =>
    sameOrigin(url) || url.startsWith(SETUP_ORIGIN + '/') || /^(data|blob|about):/.test(url) || (!RELEASE && /^(devtools|chrome-extension):/.test(url));
  s.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !local(details.url) }));
  s.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!sameOrigin(details.url)) {
      for (const name of Object.keys(headers)) if (name.toLowerCase() === 'cookie') delete headers[name];
    }
    callback({ requestHeaders: headers });
  });
  const allowedPermission = (permission: string): boolean => permission === 'clipboard-sanitized-write' || permission === 'fullscreen';
  s.setPermissionRequestHandler((_wc, permission, callback) => callback(allowedPermission(permission)));
  s.setPermissionCheckHandler((_wc, permission) => allowedPermission(permission));
}

/**
 * Whether accounts other than this one can change the app's own files: a folder made directly
 * under C:\ lets every signed-in account modify what is in it, and the app's Node, its packages and
 * its own program would then run whatever another account put there. Asked of Windows by SID, so
 * the answer does not depend on the language Windows is in. null when Windows could not be asked.
 */
function othersCanChange(dir: string): boolean | null {
  const script =
    '$acl = Get-Acl -LiteralPath $env:STUDIO_APP_DIR; ' +
    // Everyone, Authenticated Users, Users, Interactive, Network.
    "$broad = 'S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-4','S-1-5-2'; " +
    // Write data, append, write attributes (extended too), delete, change permissions or owner, and the generic write and all.
    '$write = 0x2 -bor 0x4 -bor 0x10 -bor 0x40 -bor 0x100 -bor 0x10000 -bor 0x40000 -bor 0x80000 -bor 0x10000000 -bor 0x40000000; ' +
    'foreach ($r in $acl.Access) { if ($r.AccessControlType -ne "Allow") { continue }; ' +
    'try { $sid = $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { continue }; ' +
    "if (($broad -contains $sid) -and ([int64]$r.FileSystemRights -band $write)) { 'SHARED'; exit } }; 'OWN'";
  try {
    const out = execFileSync(systemExe('WindowsPowerShell\\v1.0\\powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, STUDIO_APP_DIR: dir },
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 20_000,
    });
    return out.trim().endsWith('SHARED');
  } catch {
    return null;
  }
}

void app.whenReady().then(async () => {
  if (RELEASE && othersCanChange(path.dirname(process.execPath)) === true) {
    dialog.showErrorBox(
      BUILD.product,
      'The application is located in a folder that other users of this computer can modify (' + path.dirname(process.execPath) + '), ' +
        'and will not start there. Please move the entire folder into your own Programs folder, for example ' +
        '%LOCALAPPDATA%\\Programs\\' + BUILD.product + ', and start it from there.',
    );
    app.quit();
    return;
  }
  // The same for the folder a standard build keeps Node and the browsers in: the learner's code runs on them.
  if (RELEASE && BUILD.runtime.mode === 'download') {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    if (othersCanChange(RUNTIME_DIR) === true) {
      dialog.showErrorBox(
        BUILD.product,
        'The folder in which the application stores Node and its browsers (' + RUNTIME_DIR + ') can be modified by other users of this computer, ' +
          'so the application will not start. Please ask your IT department to restrict it to your account, or delete it; the application will download it again.',
      );
      app.quit();
      return;
    }
  }
  // Whatever a crash or a power cut left on the disk last time.
  cleanUpNow();
  serveSetupFiles();
  await lockSession();
  const launch = openLaunchWindow();
  // The program files outside app.asar, which Electron does not check (integrity.ts).
  launch.working('Checking the application files');
  const changed = await changedAppFile();
  if (changed) {
    dialog.showErrorBox(
      BUILD.product,
      'The application files have been modified or are damaged (' + changed + '), so the application will not start. ' +
        'Please uninstall the application and install it again.',
    );
    app.quit();
    return;
  }
  let licence: Licence;
  for (;;) {
    // From the licence every time: Retry after a withdrawn licence, or a new one chosen, starts over.
    const verdict = currentLicence();
    licence = verdict.ok ? verdict.licence : await launch.askLicence(verdict.reason);
    const chosen = currentLicence();
    if (!chosen.ok || !chosen.fingerprint) continue;
    launch.working('Starting');
    // A standard build's first start: Node and the browsers, before anything needs them.
    try {
      await installRuntime(launch);
    } catch (e) {
      const { message, detail } = explainRuntime(e);
      await launch.problem(message, detail);
      continue;
    }
    let opened: Opened;
    try {
      opened = await fetchStudio(licence, chosen.fingerprint, (text) => launch.working(text));
    } catch (e) {
      if (e instanceof ReleaseError && e.code === 'withdrawn') {
        releaseRevoked = [chosen.fingerprint];
        continue;
      }
      const { message, detail } = explain(e, licence);
      await launch.problem(message, detail);
      continue;
    }
    // Evoke's latest withdrawals, and the day the release was published, count from now on.
    releaseRevoked = [...new Set(opened.app.manifest.revoked.concat(opened.content.manifest.revoked))];
    publishedFloor = publishedDay(opened);
    const again = currentLicence();
    if (!again.ok) continue;
    try {
      await openStudio(again.licence, opened, launch);
    } catch (e) {
      try {
        await instance?.stop();
      } catch {
        // It did not start far enough to stop.
      }
      instance = null;
      const { message, detail } = explain(e, licence);
      await launch.problem(message, detail);
      continue;
    }
    licence = again.licence;
    break;
  }
  launch.close();
  warnOfExpiry(licence);
  // A licence can expire, or be seen to have expired, while the app is open: the learner is told,
  // and has ten minutes to finish what they are doing before the studio closes.
  let closing = false;
  setInterval(() => {
    const now = currentLicence();
    if (now.ok || closing) return;
    closing = true;
    const win = BrowserWindow.getAllWindows()[0];
    const message = { type: 'warning' as const, title: BUILD.product, message: now.reason, detail: 'The application will close in 10 minutes. Your progress has been saved.' };
    void (win ? dialog.showMessageBox(win, message) : dialog.showMessageBox(message));
    setTimeout(() => app.quit(), 10 * 60 * 1000);
  }, 60 * 60 * 1000);
});
