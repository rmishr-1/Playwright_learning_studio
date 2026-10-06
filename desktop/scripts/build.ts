/**
 * Builds the two halves of the studio (see shared/studio-host.ts):
 *
 * The launcher, into desktop/build/app, ready for electron-builder (package.ts) or `npm start`.
 * It is what is installed: the licence, the windows, the security, and the code that downloads the
 * course and the studio's code at every start and opens them in memory (src/release.ts).
 *
 *   main.js, setup-preload.js   the launcher, bundled (and, in a release build, obfuscated), with
 *                               the distribution repositories and the app secret built in
 *   setup.html, logo.png, licence.lic (a customer's build only)
 *   node_modules/               only what the learner's code runs on: Playwright and TypeScript
 *
 * and desktop/build/legal (THIRD-PARTY-NOTICES.txt), which is installed beside the app.
 * No course and no page: those are published (publish.ts), never installed.
 *
 * The bundle, into desktop/build/bundle/app.sbx (buildBundle): the backend (studio-app.js) and the
 * page (web/), in one container, for publish.ts to encrypt and publish to the app repository.
 *
 * The app's name and appId come from its variant (variants.json): "internal" unless --variant says
 * otherwise. package.ts and build-variant.ts pick the variant and its licence for a real build.
 *
 *   npm run build                                  release build of the launcher, for any valid Evoke licence
 *   npm run build -- --variant BU --licence licences/X.lic
 *                                                  release build of a customer's variant, who adds the licence
 *   ... --licence licences/X.lic --carry            for one customer, carrying their licence
 *   ... --dev --public-key <file>                   built for another public key (the tests' own);
 *                                                  a release is only ever built for Evoke's
 *   npm run build -- --dev                         readable, with DevTools, for working on the app: it
 *                                                  also builds the bundle and opens it, with the course
 *                                                  in Data/Content, without downloading anything
 *   npm run build -- --dev --obfuscate             obfuscated like a release, but with DevTools and a
 *                                                  debugger allowed, so test:app can drive the
 *                                                  release's code (a release refuses Playwright)
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { verify, type Licence } from '../src/licence';
import { packageDirOf, withDependencies, writeNotices } from './notices';
import { checkedPublicKey, loadAppSecret } from './signing-key';
import { distribution, rawBase, readDistribution, type Distribution } from './distribution';
import { appSecretFingerprint, packContainer } from '../src/release-format';
import { runtimeFilesFrom } from '../src/integrity';
import { LAUNCHER_API } from '../../shared/studio-host';
import { checkedRuntimeSources } from './runtime';
import { systemExe } from '../../backend/src/system-exe';
import { readRevoked } from './revoke-licence';
import { internalVariant, packageName, variantByCode, type Variant } from './variants';

export const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const BUILD = path.join(DESKTOP, 'build');
const APP = path.join(BUILD, 'app');
const LEGAL = path.join(BUILD, 'legal');
/** Where buildBundle writes the studio's code bundle. */
export const BUNDLE_DIR = path.join(BUILD, 'bundle');
export const BUNDLE_FILE = path.join(BUNDLE_DIR, 'app.sbx');

export const VERSION = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf-8')) as { version: string }).version;
const banner = (product: string): string => '/*! ' + product + ' ' + VERSION + '. Third-party software notices: THIRD-PARTY-NOTICES.txt. */';

/** The packages the learner's code runs on, at the versions the studio is built and tested with. */
export const RUNTIME_PACKAGES = ['@playwright/test', 'playwright', 'playwright-core', 'typescript', 'typescript-learner'];
/**
 * What they need, with their dependencies. Each is taken from its npm tarball, checked against the
 * integrity package-lock.json records for it, never from node_modules, where anything on this
 * computer could have changed a file since `npm ci`.
 */
const RUNTIME_COPY = [...RUNTIME_PACKAGES, '@typescript/typescript-win32-x64'];

type LockEntry = { name?: string; version: string; integrity?: string };

/** Copies a package into the app from its tarball, after checking the tarball's integrity. */
function packageFromLock(name: string, into: string, work: string): void {
  const lock = (JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8')) as { packages: Record<string, LockEntry> })
    .packages['node_modules/' + name];
  if (!lock?.integrity?.startsWith('sha512-')) throw new Error(name + ' has no sha512 integrity in package-lock.json.');
  const spec = (lock.name ?? name) + '@' + lock.version;
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const dir = path.join(work, name.replace(/[@/]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  const packed = JSON.parse(
    execFileSync(process.execPath, [npm, 'pack', spec, '--pack-destination', dir, '--prefer-offline', '--ignore-scripts', '--json'], {
      cwd: work,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  ) as { filename: string }[];
  const tgz = path.join(dir, path.basename(packed[0].filename));
  const got = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  if (got !== lock.integrity) throw new Error(spec + ' does not match the integrity in package-lock.json. It will not be shipped.');
  execFileSync(systemExe('tar.exe'), ['-xzf', tgz, '-C', dir], { stdio: 'inherit' });
  fs.cpSync(path.join(dir, 'package'), into, { recursive: true });
}

export type BuildInfo = { release: boolean; licence: Licence | null; mark: string; variant: Variant };

function step(text: string): void {
  console.log('\n> ' + text);
}

function installedVersion(name: string): string {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf-8')) as { name: string; version: string };
  // typescript-learner is TypeScript 7 installed under another name.
  return p.name === name ? p.version : 'npm:' + p.name + '@' + p.version;
}

/** esbuild compiles the code that ships: no other esbuild binary may stand in for it. */
function checkEsbuild(): void {
  for (const key of ['ESBUILD_BINARY_PATH', 'ESBUILD_WORKER_THREADS']) {
    if (process.env[key]) throw new Error(key + ' is set, which would make esbuild use another binary to build the app. Unset it.');
  }
}

/** The obfuscation every release's own code gets (the launcher's main.js, the bundle's studio-app.js). */
function obfuscateFile(file: string, product: string): void {
  const started = Date.now();
  const obfuscated = JavaScriptObfuscator.obfuscate(fs.readFileSync(file, 'utf-8'), {
    target: 'node',
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.2,
    numbersToExpressions: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'function',
    splitStrings: true,
    splitStringsChunkLength: 8,
    deadCodeInjection: false,
    selfDefending: false,
    renameGlobals: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    sourceMap: false,
  }).getObfuscatedCode();
  fs.writeFileSync(file, banner(product) + '\n' + obfuscated);
  console.log('  ' + path.basename(file) + ': ' + Math.round(obfuscated.length / 1024) + ' KB in ' + Math.round((Date.now() - started) / 1000) + 's');
}

/** ws's optional native add-ons are never looked for: a module found outside app.asar would run beyond its integrity check. */
const NO_NATIVE_WS = {
  bufferutil: path.join(DESKTOP, 'src', 'stubs', 'absent.js'),
  'utf-8-validate': path.join(DESKTOP, 'src', 'stubs', 'absent.js'),
};

/** What a Run's scratch folders are called in one variant: its own, so no variant's clean-up reaches another's. */
export const runPrefix = (appId: string): string => 'studio-run-' + crypto.createHash('sha256').update(appId).digest('hex').slice(0, 8) + '-';

/** The page's name: the same for every variant, because one bundle is published for all of them. */
const PAGE_PRODUCT = 'Evoke Training Studio';

/**
 * Builds the studio's code bundle: the backend (backend/src/studio-app.ts, with the packages the
 * learner's code runs on left to the launcher's node_modules) and the page, in one container,
 * build/bundle/app.sbx. `version` is the bundle's own counter (the app manifest's release.payload).
 */
export async function buildBundle(opts: { release: boolean; obfuscate?: boolean; version: number }): Promise<{ file: string; files: number; bytes: number }> {
  const obfuscate = opts.obfuscate ?? opts.release;
  checkEsbuild();
  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const work = path.join(BUNDLE_DIR, 'work');
  const web = path.join(work, 'web');
  fs.mkdirSync(web, { recursive: true });

  step('The page (Option C)');
  const webPackages = path.join(work, 'web-packages.json');
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.web.config.mts'], {
    cwd: DESKTOP,
    stdio: 'inherit',
    env: {
      ...process.env,
      STUDIO_WEB_OUT: web,
      STUDIO_RELEASE: obfuscate ? '1' : '0',
      STUDIO_BANNER: obfuscate ? banner(PAGE_PRODUCT) : '',
      STUDIO_PRODUCT: PAGE_PRODUCT,
      STUDIO_WEB_PACKAGES: webPackages,
    },
  });

  step('The backend');
  // The bundle is plain Node: Electron is the launcher's, and a bundle that reached for it would be
  // reaching past the contract (shared/studio-host.ts).
  const noElectron: esbuild.Plugin = {
    name: 'no-electron',
    setup(b) {
      b.onResolve({ filter: /^electron(\/.*)?$/ }, (args) => ({ errors: [{ text: 'The studio bundle may not import electron (' + args.importer + ').' }] }));
    },
  };
  const result = await esbuild.build({
    entryPoints: { 'studio-app': path.join(ROOT, 'backend', 'src', 'studio-app.ts') },
    outdir: work,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: [...RUNTIME_PACKAGES],
    alias: NO_NATIVE_WS,
    plugins: [noElectron],
    define: { __STUDIO_BUNDLE_VERSION__: JSON.stringify(opts.version) },
    minify: obfuscate,
    legalComments: 'none',
    sourcemap: false,
    metafile: true,
    logLevel: 'warning',
  });
  const appJs = path.join(work, 'studio-app.js');
  if (obfuscate) {
    step('Obfuscating the backend');
    obfuscateFile(appJs, PAGE_PRODUCT);
  }

  step('Notices');
  const backendDirs = Object.keys(result.metafile.inputs)
    .map((f) => packageDirOf(path.resolve(DESKTOP, f)))
    .filter((d): d is string => d !== null);
  const webDirs = (JSON.parse(fs.readFileSync(webPackages, 'utf-8')) as string[])
    .map((f) => packageDirOf(path.resolve(DESKTOP, f)))
    .filter((d): d is string => d !== null);
  const notices = path.join(work, 'THIRD-PARTY-NOTICES.txt');
  const count = writeNotices(
    notices,
    [
      { title: 'In the studio: the page', dirs: [...new Set(webDirs)] },
      { title: 'In the studio: the backend', dirs: [...new Set(backendDirs)] },
    ],
    PAGE_PRODUCT,
  );
  console.log('  ' + count + ' packages');

  step('The bundle');
  const files = new Map<string, Uint8Array>([
    ['studio-app.js', fs.readFileSync(appJs)],
    ['THIRD-PARTY-NOTICES.txt', fs.readFileSync(notices)],
  ]);
  const walk = (dir: string, prefix: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + e.name + '/');
      else files.set(prefix + e.name, fs.readFileSync(path.join(dir, e.name)));
    }
  };
  walk(web, 'web/');
  if (!files.has('web/index.html')) throw new Error('The page was not built (no index.html).');
  const container = packContainer(files);
  fs.writeFileSync(BUNDLE_FILE, container);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('  ' + files.size + ' files, ' + Math.round(container.length / 1024) + ' KB, version ' + opts.version);
  return { file: BUNDLE_FILE, files: files.size, bytes: container.length };
}

/** The app secret as two halves that XOR to it: neither is the secret where it lies in main.js. */
function halves(secret: Buffer): [string, string] {
  const a = crypto.randomBytes(32);
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) b[i] = secret[i] ^ a[i];
  return [a.toString('hex'), b.toString('hex')];
}

export async function build(opts: {
  release: boolean;
  licenceFile: string | null;
  obfuscate?: boolean;
  /**
   * A customer's build carries their licence only when this is true. By default they add it
   * themselves, so the app alone opens nothing.
   */
  carryLicence?: boolean;
  /** The public key to build in, when not Evoke's (the tests use their own). */
  publicKeyFile?: string | null;
  /**
   * Which app this is (variants.json): its name and appId. The internal variant by default, which
   * is what `npm start` and the tests build.
   */
  variant?: Variant;
  /**
   * The app secret to build in (release-format.ts). A release always has Evoke's, from the signing
   * key; a development build has none unless a test passes the one its own key gives.
   */
  appSecret?: Buffer | null;
  /**
   * Development only: also build the bundle, and have the launcher open it, and the course in
   * Data/Content, from this computer instead of downloading them (build/app/dev-local.json).
   */
  devLocal?: boolean;
  /**
   * Where the packaged app finds Node and the browsers: 'bundled' in its own resources (a full
   * build, and the tests' packed copies, which link desktop/runtime there), or 'download': fetched
   * on the first start from the official servers runtime-sources.json pins (a standard build).
   */
  runtime?: 'bundled' | 'download';
}): Promise<BuildInfo> {
  const variant = opts.variant ?? internalVariant();
  const product = variant.name;
  const obfuscate = opts.obfuscate ?? opts.release;
  checkEsbuild();
  if (opts.release && opts.publicKeyFile) throw new Error('A release is built only for Evoke\'s public key: --public-key goes with --dev.');
  if (opts.release && opts.devLocal) throw new Error('A release always downloads the course and the studio: a local bundle goes with --dev.');
  if (opts.release && opts.appSecret) throw new Error('A release is built only with Evoke\'s app secret.');
  const publicKey = checkedPublicKey(opts.publicKeyFile ?? undefined);
  const revoked = readRevoked().revoked.map((r) => r.fingerprint);
  // Where the launcher downloads from. A release needs both repositories; a development build
  // takes them when they are named (or none: it is then opened locally, or by a test).
  let dist: Distribution | null;
  if (opts.release) dist = distribution();
  else {
    const named = readDistribution();
    dist = named.content && named.app ? { content: named.content, app: named.app } : null;
  }

  let licence: Licence | null = null;
  if (opts.licenceFile) {
    const text = fs.readFileSync(opts.licenceFile, 'utf-8');
    const parsed = JSON.parse(text) as { licence?: Licence };
    const verdict = verify(text, publicKey, { onlyId: null, machine: parsed.licence?.machine ?? '', revoked });
    if (!verdict.ok) throw new Error(opts.licenceFile + ': ' + verdict.reason);
    licence = verdict.licence;
    // The seal is half of what opens the course (release-format.ts): a licence without one opens nothing.
    if (!licence.seal) {
      throw new Error(
        opts.licenceFile + ' has no seal, so it cannot open the course. Reissue it with ' +
          '`npm run licence:issue -- --id ' + licence.id + ' --licensee "' + licence.licensee + '" --new-seal`.',
      );
    }
  }
  // A customer's variant is built only with that customer's licence.
  if (variant.licenceId && licence?.id !== variant.licenceId) {
    throw new Error('"' + product + '" is built for licence ' + variant.licenceId + ', not ' + (licence?.id ?? 'none') + '.');
  }
  // A standard build carries the pins of what its first start downloads, checked against this
  // checkout's Playwright and the pins desktop/runtime (what the tests run on) was checked with.
  const sources = opts.runtime === 'download' ? checkedRuntimeSources() : null;
  const runtime = sources ? { mode: 'download' as const, allow: sources.allow, pieces: sources.pieces } : { mode: 'bundled' as const };
  // Asked for last: it may need the key's passphrase, which is not worth typing for a build that stops anyway.
  const secret = opts.release ? await loadAppSecret() : opts.appSecret ?? null;
  const mark = licence?.id ?? 'EVK-INTERNAL';
  console.log(product + ' ' + VERSION + ', ' + (opts.release ? 'release' : 'development') + ' build' +
    (licence ? ' for ' + licence.licensee + ' (' + licence.id + ')' : ', for any valid licence') +
    (sources ? ', downloading Node and the browsers on its first start' : ''));

  for (const dir of [APP, LEGAL]) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(APP, { recursive: true });
  fs.mkdirSync(LEGAL, { recursive: true });

  step('The launcher');
  const result = await esbuild.build({
    entryPoints: { main: path.join(DESKTOP, 'src', 'main.ts'), 'setup-preload': path.join(DESKTOP, 'src', 'setup-preload.ts') },
    outdir: APP,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // original-fs: Electron's fs without its app.asar handling, to read app.asar's header (integrity.ts).
    external: ['electron', 'original-fs', ...RUNTIME_PACKAGES],
    alias: NO_NATIVE_WS,
    define: {
      __STUDIO_RELEASE__: JSON.stringify(opts.release),
      __STUDIO_BUILD__: JSON.stringify({
        product,
        appId: variant.appId,
        version: VERSION,
        publicKey,
        onlyId: licence?.id ?? null,
        revoked,
        built: new Date().toISOString().slice(0, 10),
        api: LAUNCHER_API,
        dist: dist ? { content: rawBase(dist.content), app: rawBase(dist.app) } : null,
        runPrefix: runPrefix(variant.appId),
        secretFingerprint: secret ? appSecretFingerprint(secret) : null,
        runtime,
      }),
      __STUDIO_SECRET__: JSON.stringify(secret ? halves(secret) : null),
    },
    minify: obfuscate,
    legalComments: 'none',
    sourcemap: false,
    metafile: true,
    logLevel: 'warning',
  });

  if (obfuscate) {
    step('Obfuscating the launcher');
    obfuscateFile(path.join(APP, 'main.js'), product);
  }

  step('App files');
  // The setup window's title comes from its page (only the main window keeps its own title).
  fs.writeFileSync(
    path.join(APP, 'setup.html'),
    fs.readFileSync(path.join(DESKTOP, 'src', 'setup.html'), 'utf-8').replace(/<title>[^<]*<\/title>/, '<title>' + product + '</title>'),
  );
  fs.copyFileSync(path.join(ROOT, 'frontend-c', 'public', 'evoke-logo.png'), path.join(APP, 'logo.png'));
  // What every start checks Node and the browsers against (integrity.ts). desktop/runtime, which
  // packaging has just checked against its manifest and the pins, holds the same files a standard
  // build downloads.
  const runtimeManifest = path.join(DESKTOP, 'runtime', 'MANIFEST.sha256');
  if (fs.existsSync(runtimeManifest)) {
    const files = runtimeFilesFrom(path.join(DESKTOP, 'runtime'), fs.readFileSync(runtimeManifest, 'utf-8'));
    const unlisted = (sources?.pieces ?? []).filter((p) => !files[p.name]).map((p) => p.name);
    if (unlisted.length) throw new Error('desktop/runtime does not have ' + unlisted.join(', ') + '. Run `npm run runtime -- --fresh`.');
    fs.writeFileSync(path.join(APP, 'runtime-files.json'), JSON.stringify(files) + '\n');
  } else if (opts.release) {
    throw new Error('desktop/runtime has no manifest. Run `npm run runtime` first.');
  }
  if (licence && opts.licenceFile && opts.carryLicence === true) fs.copyFileSync(opts.licenceFile, path.join(APP, 'licence.lic'));
  const dependencies = Object.fromEntries(
    ['@playwright/test', 'playwright', 'typescript', 'typescript-learner'].map((n) => [n, installedVersion(n)]),
  );
  fs.writeFileSync(
    path.join(APP, 'package.json'),
    JSON.stringify(
      {
        name: packageName(variant),
        // Electron keeps the app's data in %APPDATA%\<productName>, and holds its one-copy-running
        // lock there: a variant of its own name has its own of both.
        productName: product,
        version: VERSION,
        // Windows shows this as the program's description (Task Manager, for one).
        description: product,
        author: 'Evoke Technologies',
        private: true,
        main: 'main.js',
        dependencies,
      },
      null,
      2,
    ) + '\n',
  );

  step('The packages the learner\'s code runs on');
  // Copied from the root install, which npm checked against package-lock.json's hashes, rather
  // than installed again: nothing is fetched, and no install script runs.
  const packs = path.join(BUILD, 'packs');
  for (const name of RUNTIME_COPY) packageFromLock(name, path.join(APP, 'node_modules', ...name.split('/')), packs);
  fs.rmSync(packs, { recursive: true, force: true });
  console.log('  ' + RUNTIME_COPY.join(', '));

  // A Run's own process uses one file of the typescript package, to turn the learner's TypeScript
  // into JavaScript. Its type definitions and language server are left out.
  const ts = path.join(APP, 'node_modules', 'typescript');
  for (const entry of fs.readdirSync(path.join(ts, 'lib'))) {
    if (entry !== 'typescript.js') fs.rmSync(path.join(ts, 'lib', entry), { recursive: true, force: true });
  }
  fs.rmSync(path.join(ts, 'bin'), { recursive: true, force: true });

  step('Notices');
  const launcherDirs = Object.keys(result.metafile.inputs)
    .map((f) => packageDirOf(path.resolve(DESKTOP, f)))
    .filter((d): d is string => d !== null);
  const runtimeDirs = withDependencies(['@playwright/test', 'typescript', 'typescript-learner'].map((n) => path.join(APP, 'node_modules', n)));
  const count = writeNotices(
    path.join(LEGAL, 'THIRD-PARTY-NOTICES.txt'),
    [
      { title: 'In the app', dirs: [...new Set(launcherDirs)] },
      { title: 'Run by the learner\'s code: Playwright and TypeScript', dirs: runtimeDirs },
    ],
    product,
  );
  console.log('  ' + count + ' packages (the studio\'s page and backend list theirs in the bundle they come in)');

  if (opts.devLocal) {
    await buildBundle({ release: false, obfuscate, version: 1 });
    // Read by a development launcher only (main.ts): a release never looks for it.
    fs.writeFileSync(
      path.join(APP, 'dev-local.json'),
      JSON.stringify({ bundle: BUNDLE_FILE, content: path.join(ROOT, 'Data', 'Content') }, null, 2) + '\n',
    );
  }

  return { release: opts.release, licence, mark, variant };
}

if (require.main === module) {
  const i = process.argv.indexOf('--licence');
  const v = process.argv.indexOf('--variant');
  build({
    variant: v === -1 ? undefined : variantByCode(process.argv[v + 1] ?? ''),
    release: !process.argv.includes('--dev'),
    obfuscate: process.argv.includes('--obfuscate') || undefined,
    carryLicence: process.argv.includes('--carry'),
    devLocal: process.argv.includes('--dev') && !process.argv.includes('--no-local'),
    publicKeyFile: process.argv.includes('--public-key') ? path.resolve(process.argv[process.argv.indexOf('--public-key') + 1]) : null,
    licenceFile: i === -1 ? null : path.resolve(process.argv[i + 1]),
  }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
