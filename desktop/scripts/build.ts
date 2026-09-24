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
 *   npm run build -- --licence licences/X.lic      release build for one customer, carrying the licence
 *   ... --licence licences/X.lic --no-carry         for one customer, who adds the licence themselves
 *   npm run build -- --dev                         readable, with DevTools, for working on the app
 *   npm run build -- --dev --obfuscate             obfuscated like a release, but with DevTools and a
 *                                                  debugger allowed, so test:app can drive the
 *                                                  release's code (a release refuses Playwright)
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { verify, type Licence } from '../src/licence';
import { packContent } from './pack-content';
import { packageDirOf, withDependencies, writeNotices } from './notices';

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
  /** A customer's build carries their licence, unless this is false: then they add it themselves. */
  carryLicence?: boolean;
}): Promise<BuildInfo> {
  const obfuscate = opts.obfuscate ?? opts.release;
  const publicKeyFile = path.join(DESKTOP, 'src', 'licence-public.pem');
  if (!fs.existsSync(publicKeyFile)) throw new Error('No licence key yet. Run `npm run licence:keygen` once.');
  const publicKey = fs.readFileSync(publicKeyFile, 'utf-8');

  let licence: Licence | null = null;
  if (opts.licenceFile) {
    const text = fs.readFileSync(opts.licenceFile, 'utf-8');
    const parsed = JSON.parse(text) as { licence?: Licence };
    const verdict = verify(text, publicKey, { onlyId: null, machine: parsed.licence?.machine ?? '' });
    if (!verdict.ok) throw new Error(opts.licenceFile + ': ' + verdict.reason);
    licence = verdict.licence;
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
  const packed = packContent(path.join(APP, 'content.pack'), mark);
  console.log('  ' + packed.files + ' files, ' + packed.marks + ' watermarks (' + mark + '), encrypted');

  step('The main process and backend');
  const result = await esbuild.build({
    entryPoints: { main: path.join(DESKTOP, 'src', 'main.ts'), 'setup-preload': path.join(DESKTOP, 'src', 'setup-preload.ts') },
    outdir: APP,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', ...RUNTIME_PACKAGES, 'bufferutil', 'utf-8-validate'],
    define: {
      __STUDIO_RELEASE__: JSON.stringify(opts.release),
      __STUDIO_BUILD__: JSON.stringify({ product: PRODUCT, version: VERSION, publicKey, onlyId: licence?.id ?? null }),
      __STUDIO_PACK_KEY__: JSON.stringify(packed.key),
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
  if (licence && opts.licenceFile && opts.carryLicence !== false) fs.copyFileSync(opts.licenceFile, path.join(APP, 'licence.lic'));
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
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  execFileSync(process.execPath, [npm, 'install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'], {
    cwd: APP,
    stdio: 'inherit',
  });

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
    carryLicence: !process.argv.includes('--no-carry'),
    licenceFile: i === -1 ? null : path.resolve(process.argv[i + 1]),
  }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
