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
import { setBranding } from '../../backend/src/branding';
import { machineCode, verify, type Licence, type Verdict } from './licence';

declare const __STUDIO_RELEASE__: boolean;
declare const __STUDIO_BUILD__: {
  product: string;
  version: string;
  publicKey: string;
  /** Set in a build made for one customer: the only licence it accepts. */
  onlyId: string | null;
};

const RELEASE = __STUDIO_RELEASE__;
const BUILD = __STUDIO_BUILD__;
const COPYRIGHT = 'Copyright © 2026 Evoke Technologies. All rights reserved.';

// ---------------------------------------------------------------- start-up guards

if (RELEASE) {
  const debugging =
    ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk', 'inspect-port', 'js-flags'].some((s) =>
      app.commandLine.hasSwitch(s),
    ) || process.argv.some((a) => /^--(inspect|remote-debugging|js-flags|debug)/.test(a));
  if (debugging) app.exit(1);
}
if (!app.requestSingleInstanceLock()) app.exit(0);

Menu.setApplicationMenu(null);

/**
 * The setup window's page and logo come out of app.asar through the app's own studio:// address.
 * A file:// page cannot read inside app.asar once the GrantFileProtocolExtraPrivileges fuse is off
 * (the window would stay blank), and only these two files can be asked for.
 */
const SETUP_ORIGIN = 'studio://app';
const SETUP_FILES: Record<string, string> = { '/setup.html': 'text/html; charset=utf-8', '/logo.png': 'image/png' };
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

const check = (text: string): Verdict => verify(text, BUILD.publicKey, { onlyId: BUILD.onlyId, machine: MACHINE });

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
    ipcMain.handle('setup:state', () => setupState());
    ipcMain.handle('setup:choose', async () => {
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
    ipcMain.handle('setup:copy-machine', () => clipboard.writeText(MACHINE));
    ipcMain.handle('setup:accept', () => {
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
    ipcMain.handle('setup:quit', () => app.quit());
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

// ---------------------------------------------------------------- every window

let studioOrigin = '';
const sameOrigin = (url: string): boolean => studioOrigin !== '' && (url === studioOrigin || url.startsWith(studioOrigin + '/'));

function openOutside(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function lockDown(contents: WebContents): void {
  // Pop-outs (the detached live view starts as about:blank) and the test report open in the app;
  // anything else opens in the learner's own browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (url === '' || url === 'about:blank' || sameOrigin(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: SAFE } };
    }
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (sameOrigin(url) || url.startsWith(SETUP_ORIGIN + '/')) return;
    e.preventDefault();
    openOutside(url);
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
  void server?.close();
});

app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  serveSetupFiles();
  // The studio asks for nothing: no camera, microphone, location or notifications. Copy buttons
  // may write to the clipboard.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen'),
  );
  const verdict = currentLicence();
  const setup = verdict.ok && eulaAccepted(verdict.licence) ? { licence: verdict.licence, close: () => {} } : await runSetup();
  try {
    await openStudio(setup.licence);
    setup.close();
  } catch (e) {
    dialog.showErrorBox(BUILD.product, 'The studio could not start: ' + (e as Error).message);
    app.quit();
  }
});
