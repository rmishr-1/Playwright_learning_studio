/**
 * Tells the studio where everything is inside the installed app. Imported first by main.ts; the
 * studio's code reads these variables as it loads (backend/src/config.ts), which is only after it
 * has been downloaded, so they are always set by then.
 *
 *   <runtime>/node/node.exe       the Node that runs the learner's code
 *   <runtime>/ms-playwright/      Chromium, Firefox and WebKit
 *   %APPDATA%/<product>/          progress, the Terminal's workspaces, the licence
 *
 * <runtime> is the app's resources folder in a full build, which carries them. A standard build
 * downloads them on its first start (runtime-install.ts) into %LOCALAPPDATA%\<product>\runtime: not
 * the install folder, which an update replaces, and not %APPDATA%, which may roam with the Windows
 * profile.
 *
 * The course and the studio's page are not here: they are downloaded at every start and handed to
 * the studio in memory (STUDIO_CONTENT_SOURCE=memory: it never looks for a Data\Content folder).
 *
 * Run from desktop/build/app without packaging (npm start), the runtime comes from desktop/runtime.
 */
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

declare const __STUDIO_BUILD__: { runPrefix: string; product: string; runtime: { mode: 'bundled' | 'download' } };

/** %LOCALAPPDATA%: Windows' own folder for this user's large, local-only data. */
function localAppData(): string {
  const given = process.env.LOCALAPPDATA;
  return given && path.isAbsolute(given) ? given : path.join(app.getPath('home'), 'AppData', 'Local');
}

/**
 * A folder's final path, made if need be. Started from inside a packaged (MSIX) app, Windows
 * redirects a new %LOCALAPPDATA% folder into that app's private storage, behind a path its
 * side-by-side loader cannot follow: Chromium and Firefox then fail to start from it ("side-by-side
 * configuration is incorrect"). The final path works for every process.
 */
function finalPath(dir: string): string {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return fs.realpathSync.native(dir);
  } catch {
    return dir;
  }
}

/** Where Node and the browsers are: see above. */
export const RUNTIME_DIR = !app.isPackaged
  ? path.resolve(app.getAppPath(), '..', '..', 'runtime')
  : __STUDIO_BUILD__.runtime.mode === 'download'
    ? finalPath(path.join(localAppData(), __STUDIO_BUILD__.product, 'runtime'))
    : process.resourcesPath;
export const APP_DIR = app.getAppPath();
export const USER_DIR = app.getPath('userData');

process.env.STUDIO_DATA_DIR = USER_DIR;
process.env.STUDIO_CONTENT_SOURCE = 'memory';
process.env.STUDIO_RUN_PREFIX = __STUDIO_BUILD__.runPrefix;
process.env.STUDIO_NODE_PATH = path.join(RUNTIME_DIR, 'node', 'node.exe');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(RUNTIME_DIR, 'ms-playwright');
// Nothing from the launch environment may redirect where the studio keeps or finds things.
delete process.env.STUDIO_WORKSPACE_ROOT;
delete process.env.STUDIO_CONTENT_DIR;
delete process.env.STUDIO_CONTENT_PACK;
delete process.env.STUDIO_WEB_DIR;
delete process.env.STUDIO_PORT;
delete process.env.NODE_OPTIONS;
delete process.env.ELECTRON_RUN_AS_NODE;
// Express hides error details in production. ws's optional native add-ons are never loaded: a
// module found outside app.asar would run inside the app, beyond its integrity check.
process.env.NODE_ENV = 'production';
process.env.WS_NO_BUFFER_UTIL = '1';
process.env.WS_NO_UTF_8_VALIDATE = '1';
