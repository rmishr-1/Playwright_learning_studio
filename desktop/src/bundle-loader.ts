/**
 * Runs the studio's code bundle (studio-app.js, downloaded and opened by release.ts) in the
 * launcher's process, from memory: it is never written to disk.
 *
 * It is compiled only after its release has been verified (signature, hash, decryption), as if it
 * were <app.asar>\studio-app.js, so its __dirname is the app's own folder, as the backend expects.
 * It gets a require() of its own, which allows only:
 *
 *   - Node's built-in modules (never electron: the bundle is plain Node, shared/studio-host.ts)
 *   - resolving the packages the launcher installs (<app>\node_modules: Playwright, TypeScript),
 *     whose paths the backend hands to the learner's processes
 *   - loading a .json file from those packages
 *
 * so a bundle cannot reach for a module planted anywhere else on the computer.
 */
import Module, { builtinModules } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';
import type { StudioBundleV1 } from '../../shared/studio-host';

type ModuleInternals = Module & { paths: string[]; filename: string };
const ModuleStatics = Module as unknown as {
  _resolveFilename(request: string, parent: Module, isMain?: boolean, options?: { paths?: string[] }): string;
};

const BUILTIN = new Set(builtinModules.flatMap((m) => [m, 'node:' + m]));

export function loadBundle(code: string, appDir: string): StudioBundleV1 {
  const file = path.join(appDir, 'studio-app.js');
  const packages = path.join(appDir, 'node_modules') + path.sep;
  const m = new Module(file, module) as ModuleInternals;
  m.filename = file;
  m.paths = [path.join(appDir, 'node_modules')];

  const resolve = (request: string): string => {
    if (BUILTIN.has(request)) return request;
    const found = ModuleStatics._resolveFilename(request, m);
    if (!found.startsWith(packages)) throw new Error('The studio may not load ' + request + ' from ' + found + '.');
    return found;
  };
  const guardedRequire = ((request: string): unknown => {
    if (request === 'electron' || request.startsWith('electron/')) throw new Error('The studio may not load electron.');
    if (BUILTIN.has(request)) return m.require(request);
    const found = resolve(request);
    if (!found.toLowerCase().endsWith('.json')) throw new Error('The studio may not load ' + request + '.');
    return m.require(found);
  }) as NodeJS.Require;
  guardedRequire.resolve = ((request: string) => resolve(request)) as NodeJS.RequireResolve;
  guardedRequire.cache = {};
  guardedRequire.main = undefined;

  const fn = vm.compileFunction(code, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: file });
  fn.call(m.exports, m.exports, guardedRequire, m, file, appDir);
  const exported = m.exports as { default?: StudioBundleV1 } & Partial<StudioBundleV1>;
  const bundle = (exported.default ?? exported) as StudioBundleV1;
  if (!bundle || bundle.api !== 1 || typeof bundle.start !== 'function') throw new Error('The studio that was downloaded is not for this version of the app.');
  return bundle;
}
