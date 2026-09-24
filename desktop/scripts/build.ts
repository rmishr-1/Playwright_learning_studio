/**
 * Builds the app into desktop/build/app, ready for electron-builder (package.ts) or `npm start`:
 *
 *   main.js, setup-preload.js   the main process with the backend inside, bundled (and, in a
 *                               release build, obfuscated)
 *   web/                        Option C, built for the app (vite.web.config.mts)
 *   content.pack                the course, watermarked and encrypted (pack-content.ts)
 *   setup.html, logo.png, EULA.txt, licence.lic (a customer's build only)
 *   node_modules/               only what the learner's code runs on: Playwright and TypeScript
 *
 * and desktop/build/legal (EULA.txt, THIRD-PARTY-NOTICES.txt), which is installed beside the app.
 *
 *   npm run build                                  release build, for any valid Evoke licence
 *   npm run build -- --licence licences/X.lic      release build for one customer, who adds the licence
 *   ... --licence licences/X.lic --carry            for one customer, carrying their licence
 *   ... --dev --public-key <file>                   built for another public key (the tests' own);
 *                                                  a release is only ever built for Evoke's
 *   npm run build -- --dev                         readable, with DevTools, for working on the app
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
import { packContent } from './pack-content';
import { packageDirOf, withDependencies, writeNotices } from './notices';
import { checkedPublicKey } from './signing-key';
import { systemExe } from '../../backend/src/system-exe';
import { readRevoked } from './revoke-licence';

export const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const BUILD = path.join(DESKTOP, 'build');
const APP = path.join(BUILD, 'app');
const LEGAL = path.join(BUILD, 'legal');

export const PRODUCT = 'QA Practice Training Studio';
export const VERSION = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf-8')) as { version: string }).version;
const BANNER =
  '/*! ' + PRODUCT + ' ' + VERSION + '. Copyright (c) 2026 Evoke Technologies. All rights reserved. Proprietary and ' +
  'confidential: use is subject to the licence agreement; copying, reverse engineering and redistribution are ' +
  'prohibited. Third-party components are under their own licences, see THIRD-PARTY-NOTICES.txt. */';

/** The packages the learner's code runs on, at the versions the studio is built and tested with. */
const RUNTIME_PACKAGES = ['@playwright/test', 'playwright', 'playwright-core', 'typescript', 'typescript-learner'];
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

export type BuildInfo = { release: boolean; licence: Licence | null; mark: string };

function step(text: string): void {
  console.log('\n> ' + text);
}

function installedVersion(name: string): string {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf-8')) as { name: string; version: string };
  // typescript-learner is TypeScript 7 installed under another name.
  return p.name === name ? p.version : 'npm:' + p.name + '@' + p.version;
}

export async function build(opts: {
  release: boolean;
  licenceFile: string | null;
  obfuscate?: boolean;
  /**
   * A customer's build carries their licence only when this is true. By default they add it
   * themselves, so the app alone opens nothing; with a seal in the licence it cannot even be
   * decrypted without it.
   */
  carryLicence?: boolean;
  /** The public key to build in, when not Evoke's (the tests use their own). */
  publicKeyFile?: string | null;
  /** Build for a licence that has no seal (issued before seals existed): its course opens without it. */
  allowUnsealed?: boolean;
}): Promise<BuildInfo> {
  const obfuscate = opts.obfuscate ?? opts.release;
  // esbuild compiles the code that ships: no other esbuild binary may stand in for it.
  for (const key of ['ESBUILD_BINARY_PATH', 'ESBUILD_WORKER_THREADS']) {
    if (process.env[key]) throw new Error(key + ' is set, which would make esbuild use another binary to build the app. Unset it.');
  }
  if (opts.release && opts.publicKeyFile) throw new Error('A release is built only for Evoke\'s public key: --public-key goes with --dev.');
  const publicKey = checkedPublicKey(opts.publicKeyFile ?? undefined);
  const revoked = readRevoked().revoked.map((r) => r.fingerprint);

  let licence: Licence | null = null;
  if (opts.licenceFile) {
    const text = fs.readFileSync(opts.licenceFile, 'utf-8');
    const parsed = JSON.parse(text) as { licence?: Licence };
    const verdict = verify(text, publicKey, { onlyId: null, machine: parsed.licence?.machine ?? '', revoked });
    if (!verdict.ok) throw new Error(opts.licenceFile + ': ' + verdict.reason);
    licence = verdict.licence;
    if (!licence.seal && !opts.allowUnsealed) {
      throw new Error(
        opts.licenceFile + ' has no seal, so its build would open without the licence. Reissue it with ' +
          '`npm run licence:issue -- --id ' + licence.id + ' --licensee "' + licence.licensee + '" --new-seal`, or add --allow-unsealed.',
      );
    }
  }
  const mark = licence?.id ?? 'EVK-INTERNAL';
  console.log(PRODUCT + ' ' + VERSION + ', ' + (opts.release ? 'release' : 'development') + ' build' +
    (licence ? ' for ' + licence.licensee + ' (' + licence.id + ')' : ', for any valid licence'));

  fs.rmSync(BUILD, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(APP, { recursive: true });
  fs.mkdirSync(LEGAL, { recursive: true });

  step('The page (Option C)');
  const webPackages = path.join(BUILD, 'web-packages.json');
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.web.config.mts'], {
    cwd: DESKTOP,
    stdio: 'inherit',
    env: {
      ...process.env,
      STUDIO_WEB_OUT: path.join(APP, 'web'),
      STUDIO_RELEASE: obfuscate ? '1' : '0',
      STUDIO_BANNER: obfuscate ? BANNER : '',
      STUDIO_PRODUCT: PRODUCT,
      STUDIO_WEB_PACKAGES: webPackages,
    },
  });

  step('The course');
  const seal = licence?.seal ?? null;
  const packed = packContent(path.join(APP, 'content.pack'), mark, seal);
  console.log('  ' + packed.files + ' files, ' + packed.marks + ' watermarks (' + mark + '), encrypted' + (seal ? ', sealed to the licence' : ''));

  step('The main process and backend');
  const result = await esbuild.build({
    entryPoints: { main: path.join(DESKTOP, 'src', 'main.ts'), 'setup-preload': path.join(DESKTOP, 'src', 'setup-preload.ts') },
    outdir: APP,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', ...RUNTIME_PACKAGES],
    // ws's optional native add-ons are never looked for: a module found outside app.asar would run
    // inside the app, beyond its integrity check.
    alias: { bufferutil: path.join(DESKTOP, 'src', 'stubs', 'absent.js'), 'utf-8-validate': path.join(DESKTOP, 'src', 'stubs', 'absent.js') },
    define: {
      __STUDIO_RELEASE__: JSON.stringify(opts.release),
      __STUDIO_BUILD__: JSON.stringify({
        product: PRODUCT,
        version: VERSION,
        publicKey,
        onlyId: licence?.id ?? null,
        revoked,
        built: new Date().toISOString().slice(0, 10),
      }),
      __STUDIO_PACK_KEY__: JSON.stringify(packed.key),
      __STUDIO_PACK_SEALED__: JSON.stringify(seal !== null),
    },
    minify: obfuscate,
    legalComments: 'none',
    sourcemap: false,
    metafile: true,
    logLevel: 'warning',
  });

  const mainJs = path.join(APP, 'main.js');
  if (obfuscate) {
    step('Obfuscating the main process');
    const started = Date.now();
    const obfuscated = JavaScriptObfuscator.obfuscate(fs.readFileSync(mainJs, 'utf-8'), {
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
    fs.writeFileSync(mainJs, BANNER + '\n' + obfuscated);
    console.log('  ' + Math.round(obfuscated.length / 1024) + ' KB in ' + Math.round((Date.now() - started) / 1000) + 's');
  }

  step('App files');
  fs.copyFileSync(path.join(DESKTOP, 'src', 'setup.html'), path.join(APP, 'setup.html'));
  fs.copyFileSync(path.join(ROOT, 'frontend-c', 'public', 'evoke-logo.png'), path.join(APP, 'logo.png'));
  fs.copyFileSync(path.join(DESKTOP, 'legal', 'EULA.txt'), path.join(APP, 'EULA.txt'));
  fs.copyFileSync(path.join(DESKTOP, 'legal', 'EULA.txt'), path.join(LEGAL, 'EULA.txt'));
  if (licence && opts.licenceFile && opts.carryLicence === true) fs.copyFileSync(opts.licenceFile, path.join(APP, 'licence.lic'));
  const dependencies = Object.fromEntries(
    ['@playwright/test', 'playwright', 'typescript', 'typescript-learner'].map((n) => [n, installedVersion(n)]),
  );
  fs.writeFileSync(
    path.join(APP, 'package.json'),
    JSON.stringify(
      {
        name: 'qa-practice-training-studio',
        productName: PRODUCT,
        version: VERSION,
        description: PRODUCT,
        author: 'Evoke Technologies',
        license: 'UNLICENSED',
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
  const backendDirs = Object.keys(result.metafile.inputs)
    .map((f) => packageDirOf(path.resolve(DESKTOP, f)))
    .filter((d): d is string => d !== null);
  const webDirs = (JSON.parse(fs.readFileSync(webPackages, 'utf-8')) as string[])
    .map((f) => packageDirOf(path.resolve(DESKTOP, f)))
    .filter((d): d is string => d !== null);
  const runtimeDirs = withDependencies(['@playwright/test', 'typescript', 'typescript-learner'].map((n) => path.join(APP, 'node_modules', n)));
  const count = writeNotices(
    path.join(LEGAL, 'THIRD-PARTY-NOTICES.txt'),
    [
      { title: 'In the app: the page', dirs: [...new Set(webDirs)] },
      { title: 'In the app: the backend', dirs: [...new Set(backendDirs)] },
      { title: 'Run by the learner\'s code: Playwright and TypeScript', dirs: runtimeDirs },
    ],
    PRODUCT,
  );
  console.log('  ' + count + ' packages');
  fs.rmSync(webPackages, { force: true });

  return { release: opts.release, licence, mark };
}

if (require.main === module) {
  const i = process.argv.indexOf('--licence');
  build({
    release: !process.argv.includes('--dev'),
    obfuscate: process.argv.includes('--obfuscate') || undefined,
    carryLicence: process.argv.includes('--carry'),
    allowUnsealed: process.argv.includes('--allow-unsealed'),
    publicKeyFile: process.argv.includes('--public-key') ? path.resolve(process.argv[process.argv.indexOf('--public-key') + 1]) : null,
    licenceFile: i === -1 ? null : path.resolve(process.argv[i + 1]),
  }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
