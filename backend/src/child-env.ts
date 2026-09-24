/**
 * What a process the studio starts may see and run.
 *
 * The learner's code (a Run, a Terminal command, a check) gets only the environment variables a
 * program needs on Windows, and the browsers need to start, plus what the studio passes itself.
 * Anything else the studio was started with (credentials, tokens, a code-signing certificate in
 * CSC_LINK, cloud keys) stays out: an allowlist, because a list of what to remove always misses one.
 *
 * Windows' own tools are run by their full path: by bare name, Windows looks in the current
 * folder first, where a planted reg.exe or taskkill.exe would run instead.
 *
 * Every learner process also loads a small guard first (NODE_OPTIONS --require, so the test
 * runner's workers load it too): Node then finds packages only inside the studio's own folders
 * (the packages it ships, and the Terminal's workspaces). Node's usual search climbs through every
 * parent folder's node_modules up to C:\node_modules, which any account on the computer can
 * create, and tries global folders in the user's profile; a package planted there under a name
 * Playwright or a lesson asks for would otherwise run as the learner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DATA, WORKSPACE_ROOT, onDisk } from './config';
export { systemExe } from './system-exe';

/** The guard every learner process loads first. Plain CommonJS; it is written, not bundled. */
const GUARD = `// Written by the Learning Studio, and replaced when it starts. Loaded first in every process that
// runs the learner's code: packages are found only inside the folders in STUDIO_MODULE_ROOTS.
'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
// Real paths, so a short (8.3) name, a different case or a junction is compared as the folder it is.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const roots = JSON.parse(process.env.STUDIO_MODULE_ROOTS || '[]').map((r) => real(r).toLowerCase() + path.sep);
const inside = (p) => roots.some((r) => (real(p).toLowerCase() + path.sep).startsWith(r));
// require(): search only node_modules folders inside the roots, and none of Node's global folders.
const nodeModulePaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  return nodeModulePaths.call(this, from).filter((p) => inside(path.dirname(p)));
};
const globals = new Set(Module.globalPaths);
const lookup = Module._resolveLookupPaths;
Module._resolveLookupPaths = function (request, parent) {
  const paths = lookup.call(this, request, parent);
  return Array.isArray(paths) ? paths.filter((p) => !globals.has(p)) : paths;
};
// import (and require again, as Node 24 runs both through these hooks): a package, named rather than
// given as a path, may resolve only to a file inside the roots.
const bare = (s) => !/^(\\.{1,2}([\\\\/]|$)|[\\\\/]|[a-zA-Z]:[\\\\/]|file:|node:|data:)/.test(s) && !Module.isBuiltin(s);
if (typeof Module.registerHooks === 'function') {
  Module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      if (bare(specifier) && result.url && result.url.startsWith('file:') && !inside(fileURLToPath(result.url))) {
        const e = new Error("Cannot find package '" + specifier + "': packages are used only from the studio's own folders.");
        e.code = 'ERR_MODULE_NOT_FOUND';
        throw e;
      }
      return result;
    },
  });
}
`;

const GUARD_FILE = path.join(DATA, 'Runtime', 'module-guard.cjs');

/** The folders packages may come from: the one holding the shipped node_modules, and the workspaces. */
function moduleRoots(): string[] {
  const packagesHome = path.resolve(onDisk(require.resolve('playwright/package.json')), '..', '..', '..');
  return [packagesHome, WORKSPACE_ROOT];
}

let guardWritten = false;
function guardFile(): string {
  if (!guardWritten) {
    fs.mkdirSync(path.dirname(GUARD_FILE), { recursive: true });
    fs.writeFileSync(GUARD_FILE, GUARD);
    guardWritten = true;
  }
  return GUARD_FILE;
}

const KEEP = new Set(
  [
    'ALLUSERSPROFILE',
    'APPDATA',
    'COMMONPROGRAMFILES',
    'COMMONPROGRAMFILES(X86)',
    'COMMONPROGRAMW6432',
    'COMPUTERNAME',
    'COMSPEC',
    'HOMEDRIVE',
    'HOMEPATH',
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'PATH',
    'PATHEXT',
    'PLAYWRIGHT_BROWSERS_PATH',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION',
    'PROGRAMDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMW6432',
    'PUBLIC',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TZ',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
  ].map((k) => k.toUpperCase()),
);

/**
 * The environment for a learner's process: the allowlist above, the module guard, and what the
 * studio adds. ws (inside Playwright) is also told not to look for its optional native helpers.
 */
export function learnerEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && KEEP.has(key.toUpperCase())) env[key] = value;
  }
  return {
    ...env,
    // Forward slashes: inside NODE_OPTIONS, Node reads a backslash in quotes as an escape.
    NODE_OPTIONS: '--require "' + guardFile().split(path.sep).join('/') + '"',
    STUDIO_MODULE_ROOTS: JSON.stringify(moduleRoots()),
    WS_NO_BUFFER_UTIL: '1',
    WS_NO_UTF_8_VALIDATE: '1',
    ...extra,
  };
}
