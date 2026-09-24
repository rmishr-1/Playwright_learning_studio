/**
 * Builds one variant of the app (variants.json) and puts what to send in desktop/deliveries/<code>/.
 * Every variant has its own name, program, install folder, data folder and uninstall entry, so all
 * of them install and run side by side on one computer.
 *
 *   npm run build-variant -- internal       "Evoke Training Studio": Evoke's own, opens with any valid
 *                                           Evoke licence. Never send it to a customer.
 *   npm run build-variant -- BU             "Evoke Training Studio BU": the customer's, opens only with
 *                                           their licence (after a course update, say)
 *   ... --zip                               a zip that runs where it is unzipped (with Uninstall.bat),
 *                                           instead of an installer
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
import { INTERNAL_CODE, licencePath, variantByCode, type Variant } from './variants';

export type BuildVariantOptions = {
  /** A zip that runs where it is unzipped, instead of an installer. */
  zip?: boolean;
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
        '   This copy is not code-signed yet, so Windows says "Windows protected your PC". Check the',
        '   fingerprint first (below); if it matches, choose "More info", then "Run anyway".',
      ]
    : ['   It is signed by Evoke Technologies. If Windows warns that it is not, do not run it: ask Evoke.'];
}

function readMe(v: Variant, artifact: string, licenceName: string | null, licence: LicenceFile['licence'] | null, unsigned: boolean, zip: boolean): string {
  const name = v.name;
  const head = licence
    ? [name + ' ' + VERSION, 'Licensed to ' + licence.licensee + ' (licence ' + licence.id + (licence.expires ? ', valid until ' + licence.expires : '') + ')']
    : [name + ' ' + VERSION, 'Evoke internal: opens with any valid Evoke licence. Never send it outside Evoke.'];
  const licenceStep = licenceName
    ? '3. Choose "Choose licence file..." and pick "' + licenceName + '".'
    : '3. Choose "Choose licence file..." and pick your Evoke licence (a .lic file).';
  const start = zip
    ? [
        '1. Right-click ' + artifact + ' and choose "Extract All". As the folder, type',
        '      %LOCALAPPDATA%\\Programs\\' + name,
        '   (your own Programs folder: the app will not start from a folder other people who use this',
        '   computer can change, such as one made directly under C:\\).',
        '2. In the extracted folder, double-click "' + name + '.exe".',
        ...signedLines(unsigned),
      ]
    : [
        '1. Double-click ' + artifact + ', read the licence agreement and choose "I Agree", then "Install".',
        ...signedLines(unsigned),
        '   It installs for you only, with no administrator rights, into',
        '      %LOCALAPPDATA%\\Programs\\' + name,
        '   and puts "' + name + '" in the Start menu and on the desktop.',
        '2. Start "' + name + '" from the Start menu or the desktop.',
      ];
  const remove = zip
    ? [
        'To remove it: close the studio, then double-click "Uninstall.bat" in the extracted folder.',
        'It asks before deleting your progress, your work and your licence, and keeps them unless',
        'you say otherwise.',
      ]
    : [
        'To remove it: Settings > Apps > Installed apps > "' + name + '" > Uninstall. Your progress,',
        'your work and your licence stay in %APPDATA%\\' + name + '; delete that folder too to remove them.',
      ];
  return [
    ...head,
    '',
    'It installs beside any other Evoke Training Studio on the same computer, each with its own',
    'progress.',
    '',
    'To start:',
    ...start,
    licenceStep,
    '4. Read the licence agreement, tick the box, and choose "Accept and open".',
    '',
    ...(licence
      ? ['This copy works only with this licence. Keep the licence file safe, and do not share it', 'or the application.', '']
      : []),
    'To check the ' + (zip ? 'zip' : 'installer') + ' is the one Evoke sent, run this in a Command Prompt in its folder, and',
    'compare the result with the fingerprint Evoke gave you separately:',
    '   certutil -hashfile "' + artifact + '" SHA256',
    '',
    ...remove,
    '',
    'Copyright (c) 2026 Evoke Technologies. All rights reserved.',
    '',
  ].join('\r\n');
}

/** Builds a variant and puts it, with what goes with it, in deliveries/<code>/. Returns that folder. */
export async function buildVariant(code: string, opts: BuildVariantOptions = {}): Promise<string> {
  const v = variantByCode(code);
  const licenceFile = licencePath(v);
  const licence = licenceFile ? (JSON.parse(fs.readFileSync(licenceFile, 'utf-8')) as LicenceFile).licence : null;
  const zip = opts.zip === true;

  // Node and the browsers the app ships, the first time.
  if (!fs.existsSync(path.join(DESKTOP, 'runtime', 'MANIFEST.sha256'))) {
    console.log('\n> Gathering Node and the browsers the app ships (first time only)');
    execFileSync(process.execPath, [path.join(DESKTOP, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(__dirname, 'runtime.ts')], {
      stdio: 'inherit',
    });
  }

  console.log('\n  Building "' + v.name + '"' + (licence ? ' for ' + licence.licensee : '') + ': about 10 minutes, the last 5 of');
  console.log('  them compressing, when the window shows little. Keep this window open until it says DONE.');
  const unsigned = !hasCertificate();
  if (unsigned && !opts.unsigned && !(await confirmUnsigned())) {
    throw new Error('No code-signing certificate is set, and building unsigned was not confirmed. Nothing was built.');
  }
  const made = await packageApp({ variant: v, carryLicence: opts.carry === true, target: zip ? 'zip' : 'nsis', unsigned });
  const artifact = made.find((f) => f.endsWith(zip ? '.zip' : '.exe'));
  if (!artifact) throw new Error('The build made no ' + (zip ? 'zip' : 'installer') + '.');

  // Made beside the old delivery, and swapped in only once complete.
  const deliveries = path.join(DESKTOP, 'deliveries');
  const out = path.join(deliveries, v.code);
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
  fs.writeFileSync(path.join(partial, 'READ ME FIRST.txt'), readMe(v, path.basename(artifactOut), licenceName, licence, unsigned, zip));
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
  if (!opts.noOpen) spawn(systemExe(path.join('..', 'explorer.exe')), [out], { detached: true, stdio: 'ignore' }).unref();
  return out;
}

if (require.main === module) {
  const code = process.argv.slice(2).find((a) => !a.startsWith('--'));
  Promise.resolve()
    .then(() => {
      if (!code) throw new Error('Name the variant to build, e.g. `npm run build-variant -- internal` (see variants.json).');
      return buildVariant(code, {
        zip: process.argv.includes('--zip'),
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
