/**
 * Builds one variant of the app (variants.json) and its Windows installer, into desktop/release/:
 * <Name-With-Dashes>-Setup-<version>.exe. Each variant has its own name and appId, so its installer
 * installs beside the others, never over them.
 *
 *   npm run package -- --variant internal          "Evoke Training Studio", for any valid Evoke licence
 *                                                  (never for a customer: any licence opens it)
 *   npm run package -- --internal                  the same
 *   npm run package -- --variant BU                a customer's, "Evoke Training Studio BU": it accepts
 *                                                  only their licence, which is sent apart from it, and
 *                                                  its course carries that licence's watermark
 *   npm run package -- --licence licences/X.lic    the variant that licence belongs to
 *   ... --carry                                    the installer carries the licence (it then opens
 *                                                  for anyone who has it)
 *   ... --zip                                      a zip of the app instead of an installer
 *   ... --full                                     carries Node and the browsers (about 490 MB):
 *                                                  for a customer whose network blocks their download.
 *                                                  Without it (standard, about 100 MB) the first
 *                                                  start downloads them from their official servers
 *                                                  (src/runtime-install.ts, runtime-sources.json)
 *   ... --unsigned                                 without a code-signing certificate (see below)
 *
 * Most of the time use build-variant.ts, which does this and puts what to send in
 * deliveries/<code>/; new-customer.ts adds a customer's variant and licence, then builds it.
 *
 * Needs `npm run runtime` once first (Node and the browsers: a full build ships them, and a
 * standard build's pins are checked against them, which the tests run on).
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
 * that the electron npm package's checksums.json gives it, read from that package's tarball after
 * checking the tarball against package-lock.json. electron-builder is then handed that zip (electronDist) and downloads no Electron itself:
 * no copy left in a cache, no mirror named in the environment, and no checksum file fetched from
 * the same release as the zip is ever trusted.
 *
 * A signed build must be signed by Evoke: the certificate's name (its CN) must begin "Evoke
 * Technologies", and no environment variable may swap in another signing program or change that.
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
import { DESKTOP, VERSION, build } from './build';
import { INTERNAL_CODE, artifactBase, licencePath, variantByCode, variantByLicenceId, type Variant } from './variants';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { systemExe } from '../../backend/src/system-exe';
import { signature, verifyManifest } from './runtime';
import { uninstallScript } from './uninstaller';

/** Electron's own releases: the only place its zip is taken from. */
const ELECTRON_RELEASES = 'https://github.com/electron/electron/releases/download/';

/** Downloads a file to disk, following GitHub's redirect to its download host. */
async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('Could not download ' + url + ' (' + response.status + ').');
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), fs.createWriteStream(file));
}

/**
 * Electron's checksums, from its npm tarball checked against desktop/package-lock.json: never from
 * node_modules, where anything on this computer could have changed the file since npm ci.
 */
function electronChecksums(version: string): Record<string, string> {
  const lock = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package-lock.json'), 'utf-8')) as {
    packages: Record<string, { version: string; integrity?: string }>;
  }).packages['node_modules/electron'];
  if (lock?.version !== version || !lock.integrity?.startsWith('sha512-')) throw new Error('desktop/package-lock.json does not pin electron ' + version + '.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-electron-sums-'));
  try {
    const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const packed = JSON.parse(
      execFileSync(process.execPath, [npm, 'pack', 'electron@' + version, '--pack-destination', work, '--prefer-offline', '--ignore-scripts', '--json'], {
        cwd: work,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    ) as { filename: string }[];
    const tgz = path.join(work, path.basename(packed[0].filename));
    const got = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
    if (got !== lock.integrity) throw new Error('The electron ' + version + ' package does not match desktop/package-lock.json.');
    execFileSync(systemExe('tar.exe'), ['-xzf', tgz, '-C', work, 'package/checksums.json'], { stdio: 'inherit' });
    return JSON.parse(fs.readFileSync(path.join(work, 'package', 'checksums.json'), 'utf-8')) as Record<string, string>;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
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

/**
 * assets/installer.nsh replaces electron-builder's check for a running copy of the app with one that
 * tells the variants apart, copied from electron-builder 26.15.3, and patchExtractStatus edits its
 * unpack macro from the same version. Another version may have changed the originals: compare
 * them, update the copy and the edit, then this version.
 */
const INSTALLER_MACRO_FOR = '26.15.3';
function checkInstallerMacroVersion(): void {
  const lib = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'app-builder-lib', 'package.json'), 'utf-8')) as { version: string };
  if (lib.version !== INSTALLER_MACRO_FOR) {
    throw new Error(
      'electron-builder is ' + lib.version + ', but assets/installer.nsh was copied from ' + INSTALLER_MACRO_FOR + '. Compare it with ' +
        'node_modules/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh, update it, then INSTALLER_MACRO_FOR.',
    );
  }
}

/**
 * electron-builder unpacks the app with no text on the "Installing" page. This edits its unpack
 * macro (templates/nsis/include/extractAppPackage.nsh, extractUsing7za, from the same 26.15.3) so
 * the status line names each file as it goes in ("Installing <file>..."), then "Completing the
 * installation..." while the files are copied into place. NSIS cannot redefine a macro and no hook
 * runs between its definition and its use, so the template itself is edited; `npm ci` undoes it and
 * every build applies it again. assets/installer.nsh moves the line under the progress bar.
 */
const STATUS_MARK = '; studio: file status';
const FILE_STATUS = 'Installing %s...';
const FINISH_STATUS = 'Completing the installation...';
/** The wording earlier builds patched in, replaced by the above where a template still has it. */
const OLD_STATUS: [string, string][] = [
  ['"Downloading %s..."', '"' + FILE_STATUS + '"'],
  ['DetailPrint "Finishing installation..."', 'DetailPrint "' + FINISH_STATUS + '"'],
];
function patchExtractStatus(): void {
  const file = path.join(DESKTOP, 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'include', 'extractAppPackage.nsh');
  let text = fs.readFileSync(file, 'utf-8');
  if (text.includes(STATUS_MARK)) {
    const reworded = OLD_STATUS.reduce((t, [from, to]) => t.split(from).join(to), text);
    if (reworded !== text) fs.writeFileSync(file, reworded);
    return;
  }
  const extract = (indent: string): string =>
    indent + 'SetDetailsPrint textonly\n' + indent + 'Nsis7z::ExtractWithDetails "${FILE}" "' + FILE_STATUS + '"\n';
  const edits: [string, string][] = [
    [
      '  Nsis7z::Extract "${FILE}"\n  Pop $R0\n  SetOutPath $R0\n',
      '  ' + STATUS_MARK + '\n' + extract('  ') + '  Pop $R0\n  SetOutPath $R0\n  DetailPrint "' + FINISH_STATUS + '"\n',
    ],
    ['    Nsis7z::Extract "${FILE}"\n    Goto DoneExtract7za\n', extract('    ') + '    Goto DoneExtract7za\n'],
    ['  DoneExtract7za:\n!macroend', '  DoneExtract7za:\n  SetDetailsPrint none\n!macroend'],
  ];
  for (const [from, to] of edits) {
    if (text.split(from).length !== 2) {
      throw new Error(
        'Cannot add the file status line: ' + file + ' is not the one from electron-builder ' + INSTALLER_MACRO_FOR +
          '. Compare its extractUsing7za with patchExtractStatus in scripts/package.ts and update both.',
      );
    }
    text = text.replace(from, () => to);
  }
  fs.writeFileSync(file, text);
}

/**
 * The English wording of electron-builder's own installer and uninstaller messages, in formal
 * language throughout (its originals include "If it doesn't close, try closing it manually" and
 * "Will reinstall/upgrade."). They are read from templates/nsis/messages.yml and
 * assistedMessages.yml (26.15.3) as the installer is built, so each English entry is set there, the
 * same way patchExtractStatus edits its template; `npm ci` undoes it and every build applies it
 * again. A message that is not where 26.15.3 has it stops the build.
 */
const INSTALLER_MESSAGES: Record<string, Record<string, string>> = {
  'messages.yml': {
    win7Required: 'This application requires Windows 7 or later.',
    x64WinRequired: 'This application requires a 64-bit edition of Windows.',
    appRunning: '${PRODUCT_NAME} is currently running.\nClick OK to close it and continue.\nIf it does not close, please close it manually.',
    appCannotBeClosed: '${PRODUCT_NAME} could not be closed.\nPlease close it manually, then click Retry to continue.',
    installing: 'Installing. Please wait...',
    areYouSureToUninstall: 'Are you sure you want to uninstall ${PRODUCT_NAME}?',
    decompressionFailed: 'The installation files could not be extracted. Please run the installer again.',
    uninstallFailed: 'The previous version could not be removed. Please run the installer again.',
    appClosing: 'Closing ${PRODUCT_NAME}...',
  },
  'assistedMessages.yml': {
    chooseInstallationOptions: 'Installation Options',
    chooseUninstallationOptions: 'Uninstallation Options',
    whichInstallationShouldBeRemoved: 'Please select the installation to remove.',
    whoShouldThisApplicationBeInstalledFor: 'Please select the users for whom this application will be installed.',
    selectUserMode: 'Please select whether this application will be available to all users of this computer or only to you.',
    whichInstallationRemove: 'This application is installed both for all users and for the current user.\nPlease select the installation to remove.',
    freshInstallForAll: 'New installation for all users (administrator credentials will be requested).',
    freshInstallForCurrent: 'New installation for the current user only.',
    onlyForMe: 'Only for &me',
    forAll: 'For &all users of this computer',
    loginWithAdminAccount: 'Please sign in with an administrator account to continue.',
    perUserInstallExists: 'An installation for the current user already exists.',
    perUserInstall: 'An installation exists for the current user.',
    perMachineInstallExists: 'An installation for all users already exists.',
    perMachineInstall: 'An installation exists for all users.',
    reinstallUpgrade: 'The existing installation will be updated.',
    uninstall: 'The existing installation will be removed.',
  },
};
export function patchInstallerMessages(): void {
  for (const [name, messages] of Object.entries(INSTALLER_MESSAGES)) {
    const file = path.join(DESKTOP, 'node_modules', 'app-builder-lib', 'templates', 'nsis', name);
    let text = fs.readFileSync(file, 'utf-8');
    for (const [key, english] of Object.entries(messages)) {
      // The message's first entry, its English one: "<key>:" and on the next line "  en: <text>".
      const entry = new RegExp('^(' + key + ':\\r?\\n[ \\t]+en: ).*$', 'm');
      if (!entry.test(text)) {
        throw new Error(
          'Cannot set the installer message ' + key + ': ' + file + ' is not the one from electron-builder ' + INSTALLER_MACRO_FOR +
            '. Compare it with INSTALLER_MESSAGES in scripts/package.ts and update both.',
        );
      }
      // A JSON string is a valid YAML double-quoted one: its \n is a new line there too.
      text = text.replace(entry, (_all, head: string) => head + JSON.stringify(english));
    }
    fs.writeFileSync(file, text);
  }
}

/** Whether a code-signing certificate is given, by any of the ways above. */
export const hasCertificate = (): boolean => signing() !== null;

/**
 * Electron's files the app never loads, left out of every package (and of the tests' packed copy):
 * Microsoft's DirectX shader compiler, which Chromium loads only for WebGPU. Nothing in the app
 * uses WebGPU. The learner's browsers keep their own copies, in their pinned folders.
 */
export const LEFT_OUT = ['dxil.dll', 'dxcompiler.dll'];

/**
 * Builds the app and packs it: an installer (nsis), or a zip of the app that runs where it is
 * unzipped (zip). Returns the files it made.
 */
export async function packageApp(opts: {
  /** Which app (variants.json): its name, appId and, for a customer, the licence it is sealed to. */
  variant: Variant;
  carryLicence?: boolean;
  target?: 'nsis' | 'zip';
  /** Package without a certificate. */
  unsigned?: boolean;
  /** Carry Node and the browsers, instead of downloading them on the first start. */
  full?: boolean;
}): Promise<string[]> {
  const variant = opts.variant;
  const licenceFile = licencePath(variant);
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
  checkInstallerMacroVersion();
  if (target === 'nsis') {
    patchExtractStatus();
    patchInstallerMessages();
  }
  const full = opts.full === true;
  await build({ release: true, licenceFile, carryLicence: opts.carryLicence, variant, runtime: full ? 'bundled' : 'download' });
  const electronVersion = (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf-8')) as { version: string }).version;
  const product = variant.name;
  const base = artifactBase(variant);

  // Electron: from its own releases only, fresh, and checked against the lockfile's checksums.
  const electronZip = 'electron-v' + electronVersion + '-win32-x64.zip';
  const known = electronChecksums(electronVersion);
  if (!/^[0-9a-f]{64}$/.test(known[electronZip] ?? '')) throw new Error('Electron ' + electronVersion + ' lists no checksum for ' + electronZip + '.');
  // Nothing in the environment may point electron-builder at another Electron, another download
  // host, or another signing program.
  for (const key of Object.keys(process.env)) {
    if (/electron|signtool|signcode|^custom_|^use_system_|^app_builder_tmp_dir$/i.test(key)) delete process.env[key];
  }
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-electron-'));
  process.env.ELECTRON_BUILDER_CACHE = cache;
  // 7-Zip level 5, not electron-builder's 9: still one solid stream, so the browsers' shared files
  // are stored once, in a fraction of level 9's time on 1.7 GB for a few percent more size.
  process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = '5';
  const electronDist = path.join(cache, electronZip);
  console.log('\n> Electron ' + electronVersion + ', from its own releases');
  await download(ELECTRON_RELEASES + 'v' + electronVersion + '/' + electronZip, electronDist);
  const got = await sha256Of(electronDist);
  if (got !== known[electronZip]) {
    fs.rmSync(cache, { recursive: true, force: true });
    throw new Error(electronZip + ' does not match the checksum in the electron ' + electronVersion + ' package package-lock.json vouches for (' + got + '). It will not be shipped.');
  }
  console.log('  ' + electronZip + ' matches its checksum');
  const release = path.join(DESKTOP, 'release');
  fs.rmSync(release, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  // The variant's identity. appId names the installer's registry entries (its uninstall entry in
  // Windows' Apps list), and productName and executableName its program, install folder and data
  // folder, so each variant installs beside the others instead of over them.
  const config: Configuration = {
    appId: variant.appId,
    productName: product,
    // No copyright line in the program's or the installer's file properties. Empty, not left out:
    // left out, electron-builder writes "Copyright © <year> <author>" of its own.
    copyright: '',
    electronVersion,
    // The zip downloaded and checked above: electron-builder downloads no Electron of its own.
    electronDist: electronDist,
    // Electron's own sample app, which a zip given this way still carries, is left out, and so are
    // the files the app never loads (LEFT_OUT).
    afterPack: async (context) => {
      for (const f of ['default_app.asar']) fs.rmSync(path.join(context.appOutDir, 'resources', f), { force: true });
      for (const f of LEFT_OUT) fs.rmSync(path.join(context.appOutDir, f), { force: true });
      // A zip has no uninstaller of its own (the installer brings one): Uninstall.bat, which
      // removes exactly what is in the app's folder now.
      if (target === 'zip') {
        const entries = fs.readdirSync(context.appOutDir).sort();
        fs.writeFileSync(path.join(context.appOutDir, 'Uninstall.bat'), uninstallScript(product, entries, { downloadsRuntime: !full }));
      }
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
    // A full build carries Node and the browsers; a standard one downloads them on its first start.
    extraResources: [
      ...(full ? [{ from: 'runtime/node', to: 'node' }, { from: 'runtime/ms-playwright', to: 'ms-playwright' }] : []),
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
      // Windows unzips into a folder of the zip's name, and the browsers' deepest files are 149
      // characters in: variants.ts keeps names short enough to stay under Windows' 260 limit.
      artifactName: base + '-' + VERSION + (full ? '-full' : '') + '.${ext}',
      icon: 'assets/icon.ico',
      // The program is named after the variant: Uninstall.bat and the installer find it by name.
      executableName: product,
      ...(sign ?? {}),
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      // Always the user's own %LOCALAPPDATA%\Programs: a folder chosen elsewhere (under C:\, say)
      // could be changed by every account on the computer, and the app refuses to start from one.
      allowToChangeInstallationDirectory: false,
      shortcutName: product,
      artifactName: base + '-Setup-' + VERSION + (full ? '-full' : '') + '.${ext}',
      deleteAppDataOnUninstall: false,
      // electron-builder's elevate.exe is for electron-updater; the app never asks for an
      // administrator's rights, so it is not shipped.
      packElevateHelper: false,
      // No update download on top of an installed copy: the app has no auto-update, and each
      // version is sent as a new installer. electron-builder's default prepares for one anyway, with
      // a block map of the installer (about two-thirds of a build's time) and compression in small
      // independent pieces (a 1 MB dictionary, not solid), which cannot share what the browsers have
      // in common. Turn it back on only with auto-update.
      differentialPackage: false,
      // assets/installer.nsh: tells a running copy of this variant from one of another.
      include: 'installer.nsh',
    },
  };

  console.log('\n> The ' + (target === 'zip' ? 'zip' : 'installer') + (full ? ': about 5 minutes, compressing the browsers' : ' (standard: Node and the browsers download on its first start)'));
  let out: string[];
  try {
    out = await electronBuild({ targets: Platform.WINDOWS.createTarget(), config, projectDir: DESKTOP });
  } finally {
    delete process.env.ELECTRON_BUILDER_CACHE;
    delete process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL;
    fs.rmSync(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  for (const f of out) console.log('  ' + f);
  // Signed means signed: the app's own program and every installer made carry a valid signature.
  if (sign) {
    const signer = /^CN="?Evoke Technologies\b/i;
    const exes = [path.join(release, 'win-unpacked', product + '.exe'), ...out.filter((f) => f.endsWith('.exe'))];
    for (const exe of exes) {
      if (!fs.existsSync(exe)) throw new Error(exe + ' is missing, so its signature cannot be checked. Nothing made here may be sent.');
      const s = signature(exe);
      if (s.status !== 'Valid') throw new Error(exe + ' is not validly signed (' + s.status + '). Nothing made here may be sent.');
      if (!signer.test(s.signer)) {
        throw new Error(exe + ' is signed by ' + s.signer + ', not by Evoke Technologies. Nothing made here may be sent.');
      }
    }
  }
  return out.filter((f) => !f.endsWith('.blockmap'));
}

/** The variant a command line names: --variant <code>, --internal, or --licence <file> (by its licence id). */
function variantFromArgs(argv: string[]): Variant {
  const v = argv.indexOf('--variant');
  if (v !== -1) return variantByCode(argv[v + 1] ?? '');
  if (argv.includes('--internal')) return variantByCode(INTERNAL_CODE);
  const i = argv.indexOf('--licence');
  if (i !== -1) {
    const file = path.resolve(argv[i + 1] ?? '');
    const id = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { licence?: { id?: string } }).licence?.id ?? '';
    const found = variantByLicenceId(id);
    if (!found) throw new Error(id + ' has no variant in variants.json. Add the customer with new-customer.bat, which gives them one.');
    if (path.resolve(licencePath(found) ?? '') !== file) {
      throw new Error(file + ' is not the licence variants.json names for "' + found.name + '" (' + found.licence + ').');
    }
    return found;
  }
  throw new Error('Name the app: --variant <code> (see variants.json), or --internal for the copy any licence opens.');
}

if (require.main === module) {
  Promise.resolve()
    .then(() =>
      packageApp({
        variant: variantFromArgs(process.argv),
        carryLicence: process.argv.includes('--carry'),
        target: process.argv.includes('--zip') ? 'zip' : 'nsis',
        unsigned: process.argv.includes('--unsigned'),
        full: process.argv.includes('--full'),
      }),
    )
    .catch((e) => {
      console.error(e instanceof Error ? e.stack : e);
      process.exit(1);
    });
}
