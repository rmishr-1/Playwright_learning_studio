/**
 * Builds the app and its Windows installer: desktop/release/<product> Setup <version>[-<licence>].exe
 *
 *   npm run package -- --internal                  an internal installer, for any valid Evoke licence
 *                                                  (never for a customer: any licence opens it)
 *   npm run package -- --licence licences/X.lic    an installer for one customer: it accepts only
 *                                                  that licence, which is sent apart from it, and its
 *                                                  course carries that licence's watermark
 *   ... --carry                                    the installer carries the licence (it then opens
 *                                                  for anyone who has it)
 *   ... --zip                                      a zip of the app instead of an installer
 *   ... --unsigned                                 without a code-signing certificate (see below)
 *
 * new-customer.ts issues a licence and makes a customer's zip in one go.
 *
 * Needs `npm run runtime` once first (Node and the browsers the app ships).
 *
 * Code signing, by whichever way Evoke's certificate is held:
 *   CSC_LINK (or WIN_CSC_LINK) and CSC_KEY_PASSWORD      a .pfx file
 *   STUDIO_SIGN_SUBJECT                                   a certificate in Windows' store or on a
 *                                                         hardware token, by its subject name
 *   STUDIO_AZURE_ENDPOINT, STUDIO_AZURE_ACCOUNT,           Azure Trusted Signing (with the AZURE_*
 *   STUDIO_AZURE_PROFILE, STUDIO_AZURE_PUBLISHER          credentials it reads itself)
 * With one set, the app and installer are signed (SHA-256), anything left unsigned is a failure,
 * and every file made is checked to carry a valid signature. Without one, packaging stops unless
 * --unsigned says that is intended: an unsigned app makes Windows SmartScreen warn whoever runs it,
 * and nothing proves it came from Evoke. Sign every copy that leaves Evoke.
 *
 * Electron itself, the largest part of the app, is downloaded fresh for every package from
 * Electron's own releases, into a cache of this run's own, and checked against the SHA-256 that
 * desktop/node_modules/electron/checksums.json (which package-lock.json vouches for) gives it: no
 * copy left in a cache, and no mirror named in the environment, is used.
 *
 * desktop/release/ is emptied first, so nothing older is ever mistaken for this build.
 *
 * The Electron fuses below switch off the ways of running the app as something else: as plain
 * Node, with a debugger, with NODE_OPTIONS, or with its code loaded from outside app.asar; and
 * the app refuses to start if app.asar has been changed.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build as electronBuild, Platform, type Configuration } from 'electron-builder';
import { DESKTOP, PRODUCT, VERSION, build } from './build';
import { signature, verifyManifest } from './runtime';

type Signing = Pick<NonNullable<Configuration['win']>, 'signtoolOptions' | 'azureSignOptions'>;

/** How the app is to be signed, from the environment; null when no certificate is given. */
function signing(): Signing | null {
  const e = process.env;
  if (e.STUDIO_AZURE_ENDPOINT && e.STUDIO_AZURE_ACCOUNT && e.STUDIO_AZURE_PROFILE && e.STUDIO_AZURE_PUBLISHER) {
    return {
      azureSignOptions: {
        endpoint: e.STUDIO_AZURE_ENDPOINT,
        codeSigningAccountName: e.STUDIO_AZURE_ACCOUNT,
        certificateProfileName: e.STUDIO_AZURE_PROFILE,
        publisherName: e.STUDIO_AZURE_PUBLISHER,
      },
    };
  }
  if (e.STUDIO_SIGN_SUBJECT) return { signtoolOptions: { certificateSubjectName: e.STUDIO_SIGN_SUBJECT, signingHashAlgorithms: ['sha256'] } };
  if (e.CSC_LINK || e.WIN_CSC_LINK) return { signtoolOptions: { signingHashAlgorithms: ['sha256'] } };
  return null;
}

/** Whether a code-signing certificate is given, by any of the ways above. */
export const hasCertificate = (): boolean => signing() !== null;

/**
 * Builds the app and packs it: an installer (nsis), or a zip of the app that runs where it is
 * unzipped (zip). Returns the files it made.
 */
export async function packageApp(opts: {
  licenceFile: string | null;
  carryLicence?: boolean;
  target?: 'nsis' | 'zip';
  /** Build with no licence named: a copy any valid licence opens. */
  internal?: boolean;
  /** Package without a certificate. */
  unsigned?: boolean;
}): Promise<string[]> {
  if (!opts.licenceFile && !opts.internal) {
    throw new Error('Name the customer\'s licence (--licence licences/X.lic), or say --internal for a copy any licence opens.');
  }
  const sign = signing();
  if (!sign && !opts.unsigned) {
    throw new Error('No code-signing certificate is set (CSC_LINK, STUDIO_SIGN_SUBJECT or STUDIO_AZURE_*). Set one, or add --unsigned to package without one.');
  }
  for (const need of ['runtime/node/node.exe', 'runtime/ms-playwright']) {
    if (!fs.existsSync(path.join(DESKTOP, need))) throw new Error('Missing ' + need + '. Run `npm run runtime` first.');
  }
  // What ships from desktop/runtime is exactly what `npm run runtime` gathered and checked.
  verifyManifest();
  const target = opts.target ?? 'nsis';
  const info = await build({ release: true, licenceFile: opts.licenceFile, carryLicence: opts.carryLicence });
  const electronVersion = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf-8')) as { version: string }).version;
  const suffix = info.licence ? info.licence.id : 'internal';

  // Electron: from its own releases only, fresh, and checked against the lockfile's checksums.
  const electronZip = 'electron-v' + electronVersion + '-win32-x64.zip';
  const known = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'checksums.json'), 'utf-8')) as Record<string, string>;
  if (!/^[0-9a-f]{64}$/.test(known[electronZip] ?? '')) throw new Error('desktop/node_modules/electron/checksums.json has no checksum for ' + electronZip + '.');
  for (const key of Object.keys(process.env)) if (/electron/i.test(key)) delete process.env[key];
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-electron-'));
  process.env.ELECTRON_BUILDER_CACHE = cache;
  const release = path.join(DESKTOP, 'release');
  fs.rmSync(release, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  const config: Configuration = {
    appId: 'com.evoketechnologies.qapractice.studio',
    productName: PRODUCT,
    copyright: 'Copyright © 2026 Evoke Technologies. All rights reserved.',
    electronVersion,
    electronDownload: {
      mirrorOptions: { mirror: 'https://github.com/electron/electron/releases/download/' },
      checksums: { [electronZip]: known[electronZip] },
    },
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
    forceCodeSigning: sign !== null,
    win: {
      target: [{ target, arch: ['x64'] }],
      // Short, because Windows unzips into a folder of the zip's name, and the browsers' deepest
      // files are 149 characters in: a long folder name takes paths past Windows' 260 limit.
      artifactName: (target === 'zip' ? 'QA-Studio-' : 'QA-Practice-Training-Studio-') + VERSION + '-' + suffix + '.${ext}',
      icon: 'assets/icon.ico',
      executableName: 'QA Practice Training Studio',
      legalTrademarks: 'Evoke Technologies',
      ...(sign ?? {}),
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
  let out: string[];
  try {
    out = await electronBuild({ targets: Platform.WINDOWS.createTarget(), config, projectDir: DESKTOP });
  } finally {
    delete process.env.ELECTRON_BUILDER_CACHE;
    fs.rmSync(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  for (const f of out) console.log('  ' + f);
  // Signed means signed: the app's own program and every installer made carry a valid signature.
  if (sign) {
    const exes = [path.join(release, 'win-unpacked', 'QA Practice Training Studio.exe'), ...out.filter((f) => f.endsWith('.exe'))];
    for (const exe of exes) {
      if (!fs.existsSync(exe)) continue;
      const s = signature(exe);
      if (s.status !== 'Valid') throw new Error(exe + ' is not validly signed (' + s.status + '). Nothing made here may be sent.');
    }
  }
  return out.filter((f) => !f.endsWith('.blockmap'));
}

if (require.main === module) {
  const i = process.argv.indexOf('--licence');
  packageApp({
    licenceFile: i === -1 ? null : path.resolve(process.argv[i + 1]),
    carryLicence: process.argv.includes('--carry'),
    target: process.argv.includes('--zip') ? 'zip' : 'nsis',
    internal: process.argv.includes('--internal'),
    unsigned: process.argv.includes('--unsigned'),
  }).catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
}
