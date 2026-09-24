/**
 * The desktop app's main process.
 *
 *   1. Refuses to run under a debugger in a release build.
 *   2. Asks for a licence until it has a valid one (licence.ts), then for acceptance of the licence
 *      agreement (EULA.txt), in the setup window (setup.html).
 *   3. Starts the backend inside this process, on 127.0.0.1, with a new random token, and opens the
 *      studio in a window that holds the token as a cookie. Nothing else on the computer can use
 *      the API.
 *
 * Every window is locked down: no Node in the page, context isolation, a sandbox, no DevTools in a
 * release build, no navigating away from the studio. Links elsewhere open in the learner's browser.
 */
import './env';
import { APP_DIR, USER_DIR } from './env';
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
import { startServer, type RunningServer } from '../../backend/src/server';
import { stopAll } from '../../backend/src/terminal';
import { stopRuns } from '../../backend/src/runner';
import { setBranding } from '../../backend/src/branding';
import { useLicence } from '../../backend/src/content';
import { machineCode, verify, type Licence, type Verdict } from './licence';

declare const __STUDIO_RELEASE__: boolean;
declare const __STUDIO_BUILD__: {
  product: string;
  version: string;
  publicKey: string;
  /** Set in a build made for one customer: the only licence it accepts. */
  onlyId: string | null;
  /** Fingerprints of licence files Evoke has withdrawn (desktop/revoked.json). */
  revoked: string[];
  /** The day the app was built (YYYY-MM-DD): no licence check counts a day before it. */
  built: string;
};

const RELEASE = __STUDIO_RELEASE__;
const BUILD = __STUDIO_BUILD__;
const COPYRIGHT = 'Copyright © 2026 Evoke Technologies. All rights reserved.';

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
const EULA_FILE = path.join(APP_DIR, 'EULA.txt');
const ACCEPTED_FILE = path.join(USER_DIR, 'eula-accepted.json');
const MACHINE = machineCode();

/**
 * Today, as far as the licence is concerned: never earlier than the latest day the app has seen, so
 * turning the computer's clock back does not bring an expired licence back to life. That day is
 * read from several marks: the day the app built into it was made, the day it records, and the
 * days its own files were last written, down into the progress and workspace folders, so deleting
 * or editing a few files does not reset it. (verify() also never counts a day before the licence
 * was issued.)
 */
const LAST_SEEN_FILE = path.join(USER_DIR, 'last-seen.json');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function licenceToday(): { today: string; now: string } {
  const now = new Date().toISOString().slice(0, 10);
  const marks: string[] = [];
  try {
    marks.push((JSON.parse(fs.readFileSync(LAST_SEEN_FILE, 'utf-8')) as { day: string }).day);
  } catch {
    // No record yet.
  }
  marks.push(BUILD.built);
  // The files the app writes, two folders deep (Progress/progress.json, Workspace/<name>/...), at
  // most a few hundred of them.
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

function check(text: string): Verdict {
  const { today, now } = licenceToday();
  const verdict = verify(text, BUILD.publicKey, { onlyId: BUILD.onlyId, machine: MACHINE, today, revoked: BUILD.revoked });
  // Said plainly when it is the clock, not the licence, that is wrong.
  if (!verdict.ok && verdict.expired && verdict.licence?.expires && now <= verdict.licence.expires) {
    return {
      ...verdict,
      reason:
        "This computer's clock says " + now + ', but the studio has already been used on ' + today + ', after the licence ' +
        'ended (' + verdict.licence.expires + '). Set the clock to the right date. If it was ever set ahead by mistake, ' +
        'ask Evoke for a renewed licence: the studio keeps the latest date it has seen.',
    };
  }
  return verdict;
}

/** The licence the learner added, else the one built into a customer's copy. */
function currentLicence(): Verdict {
  let verdict: Verdict = { ok: false, reason: '' };
  for (const file of [LICENCE_FILE, BUILT_IN_LICENCE]) {
    if (!fs.existsSync(file)) continue;
    verdict = check(fs.readFileSync(file, 'utf-8'));
    if (verdict.ok) return verdict;
  }
  return verdict;
}

const eulaText = (): string => fs.readFileSync(EULA_FILE, 'utf-8');
const eulaHash = (): string => crypto.createHash('sha256').update(eulaText()).digest('hex');

function eulaAccepted(licence: Licence): boolean {
  try {
    const saved = JSON.parse(fs.readFileSync(ACCEPTED_FILE, 'utf-8')) as { eula: string; licence: string };
    return saved.eula === eulaHash() && saved.licence === licence.id;
  } catch {
    return false;
  }
}

type SetupState = {
  step: 'licence' | 'eula';
  product: string;
  version: string;
  copyright: string;
  machine: string;
  reason: string;
  licensee: string | null;
  licenceId: string | null;
  eula: string;
};

function setupState(reason?: string): SetupState {
  const verdict = currentLicence();
  return {
    step: verdict.ok ? 'eula' : 'licence',
    product: BUILD.product,
    version: BUILD.version,
    copyright: COPYRIGHT,
    machine: MACHINE,
    reason: reason ?? (verdict.ok ? '' : verdict.reason),
    licensee: verdict.ok ? verdict.licence.licensee : null,
    licenceId: verdict.ok ? verdict.licence.id : null,
    eula: verdict.ok ? eulaText() : '',
  };
}

const SAFE: WebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  devTools: !RELEASE,
  spellcheck: false,
};

/**
 * Shows the setup window until there is a valid licence and the agreement is accepted. The window
 * stays open until `close` is called, once the studio's own window is there: with no window at
 * all for a moment, the app would quit.
 */
function runSetup(): Promise<{ licence: Licence; close: () => void }> {
  return new Promise((resolve) => {
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
    let done = false;
    setupContents.add(win.webContents.id);
    // Only the setup page, in the setup window, may call these.
    const fromSetup = (e: Electron.IpcMainInvokeEvent): boolean =>
      e.sender.id === win.webContents.id && (e.senderFrame?.url ?? '') === SETUP_ORIGIN + '/setup.html';
    const handle = (channel: string, fn: () => unknown): void =>
      ipcMain.handle(channel, (e) => {
        if (!fromSetup(e)) throw new Error('Not allowed.');
        return fn();
      });
    handle('setup:state', () => setupState());
    handle('setup:choose', async () => {
      const picked = await dialog.showOpenDialog(win, {
        title: 'Choose your licence file',
        filters: [{ name: 'Licence', extensions: ['lic', 'json'] }],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths[0]) return setupState();
      const text = fs.readFileSync(picked.filePaths[0], 'utf-8');
      const verdict = check(text);
      if (!verdict.ok) return setupState(verdict.reason);
      fs.mkdirSync(USER_DIR, { recursive: true });
      fs.writeFileSync(LICENCE_FILE, text);
      return setupState();
    });
    handle('setup:copy-machine', () => clipboard.writeText(MACHINE));
    handle('setup:accept', () => {
      const verdict = currentLicence();
      if (!verdict.ok) return setupState();
      fs.writeFileSync(
        ACCEPTED_FILE,
        JSON.stringify({ eula: eulaHash(), licence: verdict.licence.id, accepted_at: new Date().toISOString() }, null, 2),
      );
      done = true;
      for (const channel of ['setup:state', 'setup:choose', 'setup:copy-machine', 'setup:accept', 'setup:quit']) {
        ipcMain.removeHandler(channel);
      }
      win.hide();
      resolve({ licence: verdict.licence, close: () => win.close() });
      return null;
    });
    handle('setup:quit', () => app.quit());
    win.on('closed', () => {
      if (!done) app.quit();
    });
    win.once('ready-to-show', () => win.show());
    void win.loadURL(SETUP_ORIGIN + '/setup.html');
  });
}

// ---------------------------------------------------------------- the studio

let server: RunningServer | null = null;

/**
 * The port is chosen at random the first time and kept, because the page keeps its settings
 * (theme, layout) per address. Any free port does if that one is taken.
 */
async function startBackend(token: string): Promise<RunningServer> {
  const portFile = path.join(USER_DIR, 'port.json');
  let port = 0;
  try {
    port = (JSON.parse(fs.readFileSync(portFile, 'utf-8')) as { port: number }).port;
  } catch {
    port = 20000 + crypto.randomInt(30000);
  }
  const webDir = process.env.STUDIO_WEB_DIR ?? null;
  let started: RunningServer;
  try {
    started = await startServer({ port, token, webDir });
  } catch {
    started = await startServer({ port: 0, token, webDir });
  }
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(portFile, JSON.stringify({ port: started.port }));
  return started;
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
      '\n\n' +
      COPYRIGHT +
      '\nThis software and its course content are licensed, not sold, under the licence agreement you accepted.' +
      ' Copying, sharing or extracting them is not permitted.' +
      '\n\nThird-party software notices: ' +
      path.join(process.resourcesPath, 'legal', 'THIRD-PARTY-NOTICES.txt'),
  });
}

async function openStudio(licence: Licence): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  // The page shows the customer's logo, when their licence carries one, beside the theme switch.
  setBranding({ licensee: licence.licensee, logo: licence.logo ?? null });
  // The seal opens a pack made for this customer; the ID marks every lesson the app serves.
  useLicence({ seal: licence.seal ?? null, mark: licence.id });
  server = await startBackend(token);
  const origin = 'http://127.0.0.1:' + server.port;
  await session.defaultSession.cookies.set({
    url: origin,
    name: 'studio_token',
    value: token,
    httpOnly: true,
    sameSite: 'strict',
  });

  const title = BUILD.product + ' — Licensed to ' + licence.licensee;
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title,
    backgroundColor: '#f4f6fa',
    show: false,
    webPreferences: SAFE,
  });
  // The page's own title would replace the licensee's name.
  win.on('page-title-updated', (e) => e.preventDefault());
  studioOrigin = origin;
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F1') about(win, licence);
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
    message: days <= 0 ? 'Your licence ends today.' : 'Your licence ends in ' + days + (days === 1 ? ' day' : ' days') + ', on ' + licence.expires + '.',
    detail: 'Ask your training contact, or Evoke, for a renewed licence to keep using the studio after that.',
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

function lockDown(contents: WebContents): void {
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

app.on('before-quit', () => {
  stopAll();
  stopRuns();
  void server?.close();
  void session.defaultSession.clearCache();
});

app.on('window-all-closed', () => app.quit());

/**
 * The session every window uses: no proxy (so nothing can route the studio's traffic elsewhere),
 * no cache of what earlier versions kept, no request to anything but the studio and the app's own
 * pages (the app works offline, and nothing it shows may reach out), no studio token sent anywhere
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

void app.whenReady().then(async () => {
  serveSetupFiles();
  await lockSession();
  const verdict = currentLicence();
  const setup = verdict.ok && eulaAccepted(verdict.licence) ? { licence: verdict.licence, close: () => {} } : await runSetup();
  try {
    await openStudio(setup.licence);
    setup.close();
    warnOfExpiry(setup.licence);
    // A licence can expire, or be seen to have expired, while the app is open: the learner is told,
    // and has ten minutes to finish what they are doing before the studio closes.
    let closing = false;
    setInterval(() => {
      const now = currentLicence();
      if (now.ok || closing) return;
      closing = true;
      const win = BrowserWindow.getAllWindows()[0];
      const message = { type: 'warning' as const, title: BUILD.product, message: now.reason, detail: 'The studio will close in 10 minutes. Your progress is saved.' };
      void (win ? dialog.showMessageBox(win, message) : dialog.showMessageBox(message));
      setTimeout(() => app.quit(), 10 * 60 * 1000);
    }, 60 * 60 * 1000);
  } catch (e) {
    dialog.showErrorBox(BUILD.product, 'The studio could not start: ' + (e as Error).message);
    app.quit();
  }
});
