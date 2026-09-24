/**
 * Builds the app and its Windows installer: desktop/release/<product> Setup <version>[-<licence>].exe
 *
 *   npm run package                                an internal installer, for any valid Evoke licence
 *   npm run package -- --licence licences/X.lic    an installer for one customer: it accepts only
 *                                                  that licence, which is sent apart from it, and its
 *                                                  course carries that licence's watermark
 *   ... --carry                                    the installer carries the licence (it then opens
 *                                                  for anyone who has it)
 *   ... --zip                                      a zip of the app instead of an installer
 *
 * new-customer.ts issues a licence and makes a customer's zip in one go.
 *
 * Needs `npm run runtime` once first (Node and the browsers the app ships).
 *
 * Code signing: set CSC_LINK (the .pfx certificate, or its path) and CSC_KEY_PASSWORD and the app
 * and installer are signed. Without them the installer is unsigned, and Windows SmartScreen warns
 * whoever runs it. Sign every installer that leaves Evoke.
 *
 * The Electron fuses below switch off the ways of running the app as something else: as plain
 * Node, with a debugger, with NODE_OPTIONS, or with its code loaded from outside app.asar; and
 * the app refuses to start if app.asar has been changed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build as electronBuild, Platform, type Configuration } from 'electron-builder';
import { DESKTOP, PRODUCT, VERSION, build } from './build';
import { verifyManifest } from './runtime';

/**
 * Builds the app and packs it: an installer (nsis), or a zip of the app that runs where it is
 * unzipped (zip). Returns the files it made.
 */
export async function packageApp(opts: {
  licenceFile: string | null;
  carryLicence?: boolean;
  target?: 'nsis' | 'zip';
}): Promise<string[]> {
  for (const need of ['runtime/node/node.exe', 'runtime/ms-playwright']) {
    if (!fs.existsSync(path.join(DESKTOP, need))) throw new Error('Missing ' + need + '. Run `npm run runtime` first.');
  }
  // What ships from desktop/runtime is exactly what `npm run runtime` gathered and checked.
  verifyManifest();
  const target = opts.target ?? 'nsis';
  const info = await build({ release: true, licenceFile: opts.licenceFile, carryLicence: opts.carryLicence });
  const electronVersion = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf-8')) as { version: string }).version;
  const suffix = info.licence ? info.licence.id : 'internal';

  const config: Configuration = {
    appId: 'com.evoketechnologies.qapractice.studio',
    productName: PRODUCT,
    copyright: 'Copyright © 2026 Evoke Technologies. All rights reserved.',
    electronVersion,
    directories: { app: 'build/app', output: 'release', buildResources: 'assets' },
    npmRebuild: false,
    nodeGypRebuild: false,
    asar: true,
    // The app's own screens are in English: Electron's other 54 languages are left out.
    electronLanguages: ['en-US'],
    // Node (outside the app) runs the learner's code, and it cannot read inside app.asar.
    asarUnpack: ['node_modules/**'],
    files: ['**/*'],
    extraResources: [
      { from: 'runtime/node', to: 'node' },
      { from: 'runtime/ms-playwright', to: 'ms-playwright' },
      { from: 'build/legal', to: 'legal' },
    ],
    electronFuses: {
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      loadBrowserProcessSpecificV8Snapshot: false,
      grantFileProtocolExtraPrivileges: false,
    },
    // With a certificate given (CSC_LINK), an unsigned result is a failure, not a warning.
    forceCodeSigning: Boolean(process.env.CSC_LINK),
    win: {
      target: [{ target, arch: ['x64'] }],
      // Short, because Windows unzips into a folder of the zip's name, and the browsers' deepest
      // files are 149 characters in: a long folder name takes paths past Windows' 260 limit.
      artifactName: (target === 'zip' ? 'QA-Studio-' : 'QA-Practice-Training-Studio-') + VERSION + '-' + suffix + '.${ext}',
      icon: 'assets/icon.png',
      executableName: 'QA Practice Training Studio',
      legalTrademarks: 'Evoke Technologies',
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      license: 'build/legal/EULA.txt',
      shortcutName: PRODUCT,
      artifactName: 'QA-Practice-Training-Studio-Setup-' + VERSION + '-' + suffix + '.${ext}',
      deleteAppDataOnUninstall: false,
    },
  };

  console.log('\n> The ' + (target === 'zip' ? 'zip' : 'installer') + ': about 5 minutes, compressing the browsers');
  const out = await electronBuild({ targets: Platform.WINDOWS.createTarget(), config, projectDir: DESKTOP });
  for (const f of out) console.log('  ' + f);
  return out.filter((f) => !f.endsWith('.blockmap'));
}

if (require.main === module) {
  const i = process.argv.indexOf('--licence');
  packageApp({
    licenceFile: i === -1 ? null : path.resolve(process.argv[i + 1]),
    carryLicence: process.argv.includes('--carry'),
    target: process.argv.includes('--zip') ? 'zip' : 'nsis',
  }).catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
}
