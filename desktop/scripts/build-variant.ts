/**
 * Builds one variant of the app (variants.json) and puts what to send in desktop/deliveries/<code>/.
 * Every variant has its own name, program, install folder, data folder and uninstall entry, so all
 * of them install and run side by side on one computer.
 *
 *   build-app.bat, or npm run build-variant  lists the variants and asks which to build
 *   npm run build-variant -- internal       "Evoke Training Studio": Evoke's own, opens with any valid
 *                                           Evoke licence. Never send it to a customer.
 *   npm run build-variant -- BU             "Evoke Training Studio BU": the customer's, opens only with
 *                                           their licence. A course update or a new feature needs no
 *                                           new build: publish it (publish-course.bat, publish-app.bat)
 *   ... --zip                               a zip that runs where it is unzipped (with Uninstall.bat),
 *                                           instead of an installer
 *   ... --full                              carries Node and the browsers (about 490 MB), for a
 *                                           customer whose network blocks their download; into
 *                                           deliveries/<code>-full/. Without it (standard, about
 *                                           100 MB), the first start downloads them from their
 *                                           official servers
 *   ... --unsigned                          build without a code-signing certificate, without asking
 *   ... --carry                             the app carries the licence (anyone with it can open it)
 *   ... --no-open                           do not open the folder when done
 *
 * A new customer's variant is added by new-customer.ts, which then builds it here. For a customer,
 * deliveries/<code>/ holds:
 *
 *   Evoke-Training-Studio-BU-Setup-<version>.exe   the installer (or the zip, with --zip)
 *   <customer> licence.lic                         their licence
 *   READ ME FIRST.txt                              how to install, start and remove it
 *   SHA256SUMS.txt                                 the fingerprints of the two above
 *
 * The folder appears only when complete: it is made as <code>.partial and renamed at the end,
 * replacing the variant's previous delivery. Takes about 10 minutes, most of it compressing the
 * browsers.
 */
import { execFileSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { LicenceFile } from '../src/licence';
import { systemExe } from '../../backend/src/system-exe';
import { DESKTOP, VERSION } from './build';
import { hasCertificate, packageApp } from './package';
import { INTERNAL_CODE, licencePath, readVariants, variantByCode, type Variant } from './variants';

export type BuildVariantOptions = {
  /** A zip that runs where it is unzipped, instead of an installer. */
  zip?: boolean;
  /** Carry Node and the browsers, instead of downloading them on the first start. */
  full?: boolean;
  /** Building without a code-signing certificate is already agreed: do not ask. */
  unsigned?: boolean;
  /** The app carries the customer's licence. */
  carry?: boolean;
  /** Do not open the delivery folder when done. */
  noOpen?: boolean;
};

/**
 * With no code-signing certificate set, asks whether to build an unsigned copy anyway. Without a
 * console to ask in, the answer is no: --unsigned must say so.
 */
async function confirmUnsigned(): Promise<boolean> {
  console.log('\n  No code-signing certificate is set (see desktop/README.md, "Code signing"), so this copy');
  console.log('  will not be signed: Windows will warn whoever runs it ("Windows protected your PC"), and');
  console.log('  nothing proves the app came from Evoke.');
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('  Build it unsigned? [y/N] ', resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** What Windows shows for this copy, in the read-me's words. */
function signedLines(unsigned: boolean): string[] {
  return unsigned
    ? [
        '   This installer is not yet code-signed, so Windows may display "Windows protected your PC".',
        '   After verifying the fingerprint (see VERIFYING THE INSTALLER), select "More info", then',
        '   "Run anyway".',
      ]
    : [
        '   The installer is signed by Evoke Technologies. If Windows reports that it is not signed, do',
        '   not run it, and please contact Evoke Technologies.',
      ];
}

/** How much a standard build's first start downloads, from runtime-sources.json, in MB. */
function firstStartMb(): number {
  const sources = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'runtime-sources.json'), 'utf-8')) as { pieces: { size: number }[] };
  return Math.ceil(sources.pieces.reduce((sum, p) => sum + p.size, 0) / 1024 / 1024 / 10) * 10;
}

/** READ ME FIRST.txt: an installation guide, in formal language, that makes no legal claims. */
export function readMe(v: Variant, artifact: string, licenceName: string | null, licence: LicenceFile['licence'] | null, unsigned: boolean, zip: boolean, full: boolean): string {
  const name = v.name;
  const head = licence
    ? [
        name + ' ' + VERSION,
        'Installation Guide',
        '',
        'Prepared for ' + licence.licensee + ' (licence ' + licence.id + (licence.expires ? ', valid until ' + licence.expires : '') + ').',
      ]
    : [
        name + ' ' + VERSION,
        'Installation Guide',
        '',
        'For internal use within Evoke Technologies only. This edition opens with any valid Evoke',
        'licence file and must not be distributed outside Evoke Technologies.',
      ];
  const requirements = [
    'SYSTEM REQUIREMENTS',
    '- Windows 10 or Windows 11, 64-bit.',
    '- An internet connection each time the application starts. The application downloads the latest',
    '  course content, in encrypted form, from GitHub (raw.githubusercontent.com). No personal',
    '  information or user data is transmitted.',
    ...(full
      ? ['- Approximately 1.5 GB of free disk space.']
      : [
          '- On its first start, the application also downloads Node.js and the browsers used by the',
          '  course (approximately ' + firstStartMb() + ' MB, once) from their publishers\' official servers.',
          '- Approximately 2 GB of free disk space.',
        ]),
  ];
  const network = full
    ? [
        'NETWORK ACCESS',
        'This installer includes Node.js and the browsers used by the course. If your organisation',
        'restricts internet access, only the following address needs to be accessible:',
        '   raw.githubusercontent.com                  course content (each start)',
      ]
    : [
        'NETWORK ACCESS',
        'If your organisation restricts internet access, please ask your IT department to allow the',
        'following addresses:',
        '   raw.githubusercontent.com                  course content (each start)',
        '   nodejs.org                                 Node.js (first start only)',
        '   storage.googleapis.com                     Chromium (first start only)',
        '   playwright.download.prss.microsoft.com     Firefox and WebKit (first start only)',
        '   cdn.playwright.dev                         alternative address for the browsers',
        'If these downloads are not permitted on your network, please request the full installer from',
        'Evoke Technologies, which includes Node.js and the browsers.',
      ];
  const verify = [
    'VERIFYING THE INSTALLER',
    'Before installing, please confirm that the ' + (zip ? 'archive' : 'installer') + ' is authentic. Open a Command Prompt in the',
    'folder that contains it and run:',
    '   certutil -hashfile "' + artifact + '" SHA256',
    'The result must match the fingerprint provided to you separately by Evoke Technologies.',
  ];
  const licenceStep = licenceName
    ? '3. Select "Choose licence file..." and open "' + licenceName + '". The application then starts.'
    : '3. Select "Choose licence file..." and open your Evoke licence file (.lic). The application then starts.';
  const install = zip
    ? [
        'INSTALLATION',
        '1. Right-click ' + artifact + ', select "Extract All", and enter the following destination folder:',
        '      %LOCALAPPDATA%\\Programs\\' + name,
        '   The application does not start from a folder that other users of this computer can modify,',
        '   such as a folder created directly under C:\\.',
        '2. In the extracted folder, double-click "' + name + '.exe".',
        ...signedLines(unsigned),
        licenceStep,
      ]
    : [
        'INSTALLATION',
        '1. Double-click ' + artifact + ' and select "Install".',
        ...signedLines(unsigned),
        '   The application is installed for the current user only, without administrator rights, in:',
        '      %LOCALAPPDATA%\\Programs\\' + name,
        '   Shortcuts are added to the Start menu and to the desktop.',
        '2. Start "' + name + '" from the Start menu or the desktop.',
        licenceStep,
      ];
  const licenceNote = licence
    ? [
        'LICENCE FILE',
        'This installation can be activated only with the licence file supplied with it. Please keep the',
        'licence file in a secure location.',
        '',
      ]
    : [];
  const updates = [
    'COURSE UPDATES',
    'Course updates are applied automatically when the application starts. Days with new or updated',
    'content are marked "New" or "Updated" on the course page. Your progress and saved work are retained.',
    'This application can be installed alongside other editions of Evoke Training Studio on the same',
    'computer; each edition keeps its own progress.',
  ];
  const remove = zip
    ? [
        'UNINSTALLATION',
        'Close the application, then double-click "Uninstall.bat" in the installation folder. You will be',
        'asked whether your progress, saved work and licence file should also be deleted; they are',
        'retained unless you choose otherwise.',
      ]
    : [
        'UNINSTALLATION',
        'Open Settings > Apps > Installed apps, select "' + name + '", then select Uninstall.',
        ...(full ? [] : ['Node.js and the browsers downloaded on the first start are removed with the application.']),
        'Your progress, saved work and licence file are retained in:',
        '   %APPDATA%\\' + name,
        'To remove them as well, delete that folder after uninstalling.',
      ];
  return [...head, '', ...requirements, '', ...network, '', ...verify, '', ...install, '', ...licenceNote, ...updates, '', ...remove, ''].join('\r\n');
}

/** Builds a variant and puts it, with what goes with it, in deliveries/<code>/. Returns that folder. */
export async function buildVariant(code: string, opts: BuildVariantOptions = {}): Promise<string> {
  const v = variantByCode(code);
  const licenceFile = licencePath(v);
  const licence = licenceFile ? (JSON.parse(fs.readFileSync(licenceFile, 'utf-8')) as LicenceFile).licence : null;
  const zip = opts.zip === true;
  const full = opts.full === true;

  // Node and the browsers the app ships, the first time: downloaded fresh, never copied from this
  // computer's own Playwright folder, where running Playwright leaves files of its own (a Chromium
  // debug.log, say) that no longer match runtime-pins.json.
  if (!fs.existsSync(path.join(DESKTOP, 'runtime', 'MANIFEST.sha256'))) {
    console.log('\n> Downloading Node and the browsers the app ships (first time only, a few minutes)');
    execFileSync(process.execPath, [path.join(DESKTOP, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(__dirname, 'runtime.ts'), '--fresh'], {
      stdio: 'inherit',
    });
  }

  console.log('\n  Building "' + v.name + '"' + (licence ? ' for ' + licence.licensee : '') + ': about 10 minutes, the last 5 of');
  console.log('  them compressing, when the window shows little. Keep this window open until it says DONE.');
  const unsigned = !hasCertificate();
  if (unsigned && !opts.unsigned && !(await confirmUnsigned())) {
    throw new Error('No code-signing certificate is set, and building unsigned was not confirmed. Nothing was built.');
  }
  const made = await packageApp({ variant: v, carryLicence: opts.carry === true, target: zip ? 'zip' : 'nsis', unsigned, full });
  const artifact = made.find((f) => f.endsWith(zip ? '.zip' : '.exe'));
  if (!artifact) throw new Error('The build made no ' + (zip ? 'zip' : 'installer') + '.');

  // Made beside the old delivery, and swapped in only once complete.
  const deliveries = path.join(DESKTOP, 'deliveries');
  // A full build has a folder of its own: building one never replaces the standard delivery.
  const out = path.join(deliveries, v.code + (full ? '-full' : ''));
  const partial = out + '.partial';
  fs.rmSync(partial, { recursive: true, force: true });
  fs.mkdirSync(partial, { recursive: true });
  const artifactOut = path.join(partial, path.basename(artifact));
  fs.renameSync(artifact, artifactOut);
  const sent = [artifactOut];
  let licenceName: string | null = null;
  if (licenceFile && licence) {
    licenceName = licence.licensee.replace(/[\\/:*?"<>|]/g, '') + ' licence.lic';
    fs.copyFileSync(licenceFile, path.join(partial, licenceName));
    sent.push(path.join(partial, licenceName));
  }
  fs.writeFileSync(path.join(partial, 'READ ME FIRST.txt'), readMe(v, path.basename(artifactOut), licenceName, licence, unsigned, zip, full));
  // The fingerprints of what is sent, for whoever receives it to check.
  const sums = sent.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + '  ' + path.basename(f)).join('\r\n');
  fs.writeFileSync(path.join(partial, 'SHA256SUMS.txt'), sums + '\r\n');
  fs.rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.renameSync(partial, out);

  console.log('\n' + '='.repeat(70));
  console.log('  DONE. "' + v.name + '" is in ' + out);
  console.log('='.repeat(70));
  for (const f of fs.readdirSync(out)) {
    const size = fs.statSync(path.join(out, f)).size;
    console.log('  ' + f + (size > 1024 * 1024 ? '  (' + Math.round(size / 1024 / 1024) + ' MB)' : ''));
  }
  console.log('');
  if (v.code === INTERNAL_CODE) {
    console.log('  Evoke only: it opens with any valid Evoke licence, so it must never be sent to a customer.');
  } else {
    console.log('  Send the licence by a different route from the ' + (zip ? 'zip' : 'installer') + ' (for example the installer as a');
    console.log('  download link, the licence by email to the named contact), and the fingerprints in SHA256SUMS.txt');
    console.log('  by a third route, or read them out: the seal only protects the course while the two travel apart.');
  }
  console.log('  It opens only once the course and the studio are published for its licence (publish-access.bat).');
  if (!opts.noOpen) spawn(systemExe(path.join('..', 'explorer.exe')), [out], { detached: true, stdio: 'ignore' }).unref();
  return out;
}

/** With no variant named (build-app.bat): lists them and asks which, whether standard or full, and whether as a zip. */
async function choose(): Promise<{ code: string; zip: boolean; full: boolean }> {
  if (!process.stdin.isTTY) throw new Error('Name the variant to build, e.g. `npm run build-variant -- internal` (see variants.json).');
  const variants = readVariants();
  console.log('');
  console.log('  Build an app');
  console.log('');
  variants.forEach((v, i) => {
    console.log('  ' + String(i + 1).padStart(2) + '. ' + v.name + (v.licensee ? '  (for ' + v.licensee + ')' : '  (Evoke internal, any Evoke licence)'));
  });
  console.log('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (text: string): Promise<string> => new Promise((resolve) => rl.question(text, (a) => resolve(a.trim())));
  let picked: Variant | undefined;
  while (!picked) {
    const a = await ask('  Which one (1-' + variants.length + ', Enter = 1): ');
    picked = variants[a === '' ? 0 : Number(a) - 1];
    if (!picked) console.log('  Type a number from the list.');
  }
  console.log('');
  console.log('  Standard: about 100 MB. Its first start downloads Node and the browsers (about ' + firstStartMb() + ' MB)');
  console.log('            from their official servers. For most customers.');
  console.log('  Full:     about 490 MB, carrying them. For a customer whose network blocks those downloads.');
  const full = /^f/i.test(await ask('  Standard or full? (Enter = standard, f = full): '));
  const zip = /^z/i.test(await ask('  An installer, or a zip that runs where it is unzipped? (Enter = installer, z = zip): '));
  rl.close();
  return { code: picked.code, zip, full };
}

if (require.main === module) {
  const named = process.argv.slice(2).find((a) => !a.startsWith('--'));
  Promise.resolve()
    .then(async () => {
      const { code, zip, full } = named ? { code: named, zip: process.argv.includes('--zip'), full: process.argv.includes('--full') } : await choose();
      return buildVariant(code, {
        zip,
        full,
        unsigned: process.argv.includes('--unsigned'),
        carry: process.argv.includes('--carry'),
        noOpen: process.argv.includes('--no-open'),
      });
    })
    .catch((e) => {
      console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
      process.exit(1);
    });
}
