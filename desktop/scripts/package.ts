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
 * Electron itself, the largest part of the app, is downloaded here, fresh for every package, from
 * Electron's own releases on GitHub, into a folder of this run's own, and must match the SHA-256
 * that desktop/node_modules/electron/checksums.json gives it (package-lock.json vouches for that
 * file). electron-builder is then handed that zip (electronDist) and downloads no Electron itself:
 * no copy left in a cache, no mirror named in the environment, and no checksum file fetched from
 * the same release as the zip is ever trusted.
 *
 * A signed build must be signed by Evoke: the signer's name must contain STUDIO_SIGNER (by default
 * "Evoke"), and no environment variable may swap in another signing program.
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
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { build as electronBuild, Platform, type Configuration } from 'electron-builder';
import { DESKTOP, PRODUCT, VERSION, build } from './build';
import * as crypto from 'node:crypto';
import { signature, verifyManifest } from './runtime';

/** Electron's own releases: the only place its zip is taken from. */
const ELECTRON_RELEASES = 'https://github.com/electron/electron/releases/download/';

/** Downloads a file to disk, following GitHub's redirect to its download host. */
async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('Could not download ' + url + ' (' + response.status + ').');
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), fs.createWriteStream(file));
}

const sha256Of = (file: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });

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
  // Nothing in the environment may point electron-builder at another Electron, another download
  // host, or another signing program.
  for (const key of Object.keys(process.env)) {
    if (/electron|signtool|signcode|^custom_|^use_system_|^app_builder_tmp_dir$/i.test(key)) delete process.env[key];
  }
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-electron-'));
  process.env.ELECTRON_BUILDER_CACHE = cache;
  const electronDist = path.join(cache, electronZip);
  console.log('\n> Electron ' + electronVersion + ', from its own releases');
  await download(ELECTRON_RELEASES + 'v' + electronVersion + '/' + electronZip, electronDist);
  const got = await sha256Of(electronDist);
  if (got !== known[electronZip]) {
    fs.rmSync(cache, { recursive: true, force: true });
    throw new Error(electronZip + ' does not match its checksum in desktop/node_modules/electron/checksums.json (' + got + '). It will not be shipped.');
  }
  console.log('  ' + electronZip + ' matches its checksum');
  const release = path.join(DESKTOP, 'release');
  fs.rmSync(release, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  const config: Configuration = {
    appId: 'com.evoketechnologies.qapractice.studio',
    productName: PRODUCT,
    copyright: 'Copyright © 2026 Evoke Technologies. All rights reserved.',
    electronVersion,
    // The zip downloaded and checked above: electron-builder downloads no Electron of its own.
    electronDist: electronDist,
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
    const signer = process.env.STUDIO_SIGNER || 'Evoke';
    const exes = [path.join(release, 'win-unpacked', 'QA Practice Training Studio.exe'), ...out.filter((f) => f.endsWith('.exe'))];
    for (const exe of exes) {
      if (!fs.existsSync(exe)) throw new Error(exe + ' is missing, so its signature cannot be checked. Nothing made here may be sent.');
      const s = signature(exe);
      if (s.status !== 'Valid') throw new Error(exe + ' is not validly signed (' + s.status + '). Nothing made here may be sent.');
      if (!s.signer.toLowerCase().includes(signer.toLowerCase())) {
        throw new Error(exe + ' is signed by ' + s.signer + ', not by ' + signer + '. Nothing made here may be sent.');
      }
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
