/**
 * Tells the backend where everything is inside the installed app. Imported first by main.ts,
 * because the backend reads these variables as it loads.
 *
 *   resources/node/node.exe       the Node that runs the learner's code
 *   resources/ms-playwright/      Chromium, Firefox and WebKit
 *   app.asar/content.pack         the course, encrypted
 *   app.asar/web/                 the built Option C page
 *   %APPDATA%/<product>/          progress, the Terminal's workspaces, the licence
 *
 * Run from desktop/build/app without packaging (npm start), the runtime comes from desktop/runtime.
 */
import { app } from 'electron';
import * as path from 'node:path';

export const RESOURCES = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath(), '..', '..', 'runtime');
export const APP_DIR = app.getAppPath();
export const USER_DIR = app.getPath('userData');

process.env.STUDIO_DATA_DIR = USER_DIR;
process.env.STUDIO_CONTENT_PACK = path.join(APP_DIR, 'content.pack');
process.env.STUDIO_WEB_DIR = path.join(APP_DIR, 'web');
process.env.STUDIO_NODE_PATH = path.join(RESOURCES, 'node', 'node.exe');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(RESOURCES, 'ms-playwright');
// The learner's processes must not inherit anything that would turn Node into something else.
delete process.env.NODE_OPTIONS;
delete process.env.ELECTRON_RUN_AS_NODE;
