/**
 * Tells the studio where everything is inside the installed app. Imported first by main.ts; the
 * studio's code reads these variables as it loads (backend/src/config.ts), which is only after it
 * has been downloaded, so they are always set by then.
 *
 *   resources/node/node.exe       the Node that runs the learner's code
 *   resources/ms-playwright/      Chromium, Firefox and WebKit
 *   %APPDATA%/<product>/          progress, the Terminal's workspaces, the licence
 *
 * The course and the studio's page are not here: they are downloaded at every start and handed to
 * the studio in memory (STUDIO_CONTENT_SOURCE=memory: it never looks for a Data\Content folder).
 *
 * Run from desktop/build/app without packaging (npm start), the runtime comes from desktop/runtime.
 */
import { app } from 'electron';
import * as path from 'node:path';

declare const __STUDIO_BUILD__: { runPrefix: string };

export const RESOURCES = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath(), '..', '..', 'runtime');
export const APP_DIR = app.getAppPath();
export const USER_DIR = app.getPath('userData');

process.env.STUDIO_DATA_DIR = USER_DIR;
process.env.STUDIO_CONTENT_SOURCE = 'memory';
process.env.STUDIO_RUN_PREFIX = __STUDIO_BUILD__.runPrefix;
process.env.STUDIO_NODE_PATH = path.join(RESOURCES, 'node', 'node.exe');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(RESOURCES, 'ms-playwright');
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
