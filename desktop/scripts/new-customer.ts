/**
 * Issues a licence to a new customer and makes the app they get, in one go. Double-click
 * desktop/new-customer.bat, or:
 *
 *   npm run new-customer                        asks for each detail
 *   npm run new-customer -- --licensee "Boston University" --logo bu.png [--email x]
 *                           [--expires 2027-09-30] [--machine XXXX-XXXX-XXXX-XXXX]   (no questions)
 *   npm run new-customer -- --rebuild licences/<id>-<name>.lic   a new zip for a licence already
 *                                                                 issued (after a course update)
 *
 * Makes desktop/deliveries/<licence id>-<customer>/:
 *
 *   QA-Studio-<version>-<licence id>.zip                     the app. Unzip it to %LOCALAPPDATA%\Programs\
 *                                                             QA Studio and run QA Practice Training Studio.exe
 *   <customer> licence.lic                                    their licence
 *   READ ME FIRST.txt                                         how to start
 *   SHA256SUMS.txt                                            the fingerprints of the two above
 *
 * The app in the zip opens only with that licence: it refuses every other one, even a valid
 * licence Evoke issued to someone else. It does not carry the licence, so the zip alone opens
 * nothing; send the licence file by a different route from the zip. Its lessons carry the licence
 * ID as an invisible watermark, and when the licence has a logo, the app shows it in its header.
 *
 * Takes about 10 minutes, most of it compressing the browsers into the zip.
 */
import { execFileSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { issueLicence, problemWith, type IssueOptions } from './issue-licence';
import type { LicenceFile } from '../src/licence';
import { hasCertificate, packageApp } from './package';
import { systemExe } from '../../backend/src/system-exe';
import { DESKTOP, PRODUCT, VERSION } from './build';
import { PRIVATE_FILE, hasPrivateKey } from './signing-key';

function arg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

/** A path typed, pasted, or dragged into the window (which adds quotes). */
const cleanPath = (p: string): string => p.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

async function ask(): Promise<IssueOptions | null> {
  // Every line is queued, so answers typed (or pasted, or piped) ahead of their question are kept.
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const question = async (text: string): Promise<string> => {
    process.stdout.write(text);
    const next = await lines.next();
    if (next.done) throw new Error('The input ended before every question was answered. Nothing was issued.');
    return next.value;
  };
  const q = async (text: string, check?: (v: string) => string | null): Promise<string> => {
    for (;;) {
      const v = (await question(text)).trim();
      const problem = check?.(v) ?? null;
      if (!problem) return v;
      console.log('  ' + problem);
    }
  };
  console.log('');
  console.log('  New customer: ' + PRODUCT + ' ' + VERSION);
  console.log('  Press Enter to skip anything marked (optional).');
  console.log('');
  const licensee = await q('  Customer name, as it should appear (e.g. Boston University): ', (v) => (v ? null : 'The customer needs a name.'));
  const email = await q('  Contact email (optional): ');
  const expires = await q('  Last day of the licence, YYYY-MM-DD (optional, Enter = never expires): ', (v) =>
    v ? problemWith({ licensee, expires: v }) : null,
  );
  const logo = cleanPath(
    await q('  Their logo, a PNG or JPEG file (optional; drag the file into this window): ', (v) =>
      v ? problemWith({ licensee, logoFile: cleanPath(v) }) : null,
    ),
  );
  const machine = await q('  Only on one computer? Its machine code (optional): ', (v) => (v ? problemWith({ licensee, machine: v }) : null));
  const options: IssueOptions = { licensee, email: email || null, expires: expires || null, logoFile: logo || null, machine: machine || null };

  console.log('');
  console.log('  Customer:  ' + licensee);
  console.log('  Email:     ' + (email || '-'));
  console.log('  Expires:   ' + (expires || 'never'));
  console.log('  Logo:      ' + (logo || 'none'));
  console.log('  Computer:  ' + (machine || 'any'));
  const go = (await question('\n  Issue the licence and build their app (about 10 minutes)? [Y/n] ')).trim().toLowerCase();
  rl.close();
  return go === '' || go === 'y' || go === 'yes' ? options : null;
}

/**
 * With no code-signing certificate set, asks whether to build an unsigned copy anyway. Without a
 * console to ask in, the answer is no: --unsigned must say so.
 */
async function confirmUnsigned(): Promise<boolean> {
  console.log('\n  No code-signing certificate is set (see desktop/README.md, "Code signing"), so this copy');
  console.log('  will not be signed: Windows will warn the customer ("Windows protected your PC"), and nothing');
  console.log('  proves the app came from Evoke.');
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('  Build it unsigned? [y/N] ', resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main(): Promise<void> {
  const rebuild = arg('rebuild');
  if (rebuild) return deliver(path.resolve(cleanPath(rebuild)));
  if (!hasPrivateKey()) {
    throw new Error("Evoke's licence signing key is not on this computer (" + PRIVATE_FILE + '). Licences can only be issued where it is.');
  }
  const fromArgs = arg('licensee');
  const options: IssueOptions | null = fromArgs
    ? {
        licensee: fromArgs,
        email: arg('email'),
        expires: arg('expires'),
        machine: arg('machine'),
        logoFile: arg('logo') ? path.resolve(cleanPath(arg('logo')!)) : null,
      }
    : await ask();
  if (!options) {
    console.log('Nothing was issued.');
    return;
  }
  const problem = problemWith(options);
  if (problem) throw new Error(problem);

  const { licence, file: licenceFile } = await issueLicence(options);
  console.log('\n> Issued ' + licence.id + ' to ' + licence.licensee + (licence.logo ? ', with their logo' : ''));
  return deliver(licenceFile);
}

/**
 * Builds the customer's zip for a licence already issued, and puts it, the licence and a read-me in
 * deliveries/<licence id>-<customer>/. --rebuild <licence file> does only this: a new zip for the
 * same licence, such as after the course has changed.
 */
/** Whether the copy just built is unsigned: the read-me then says what Windows will show. */
let deliverUnsigned = false;

async function deliver(licenceFile: string): Promise<void> {
  const licence = (JSON.parse(fs.readFileSync(licenceFile, 'utf-8')) as LicenceFile).licence;

  // Node and the browsers the app ships, the first time.
  if (!fs.existsSync(path.join(DESKTOP, 'runtime', 'MANIFEST.sha256'))) {
    console.log('\n> Gathering Node and the browsers the app ships (first time only)');
    execFileSync(process.execPath, [path.join(DESKTOP, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(__dirname, 'runtime.ts')], {
      stdio: 'inherit',
    });
  }

  console.log('\n  Building their app: about 10 minutes, the last 5 of them making the zip, when the');
  console.log('  window shows little. Keep this window open until it says DONE. The zip is moved into');
  console.log('  the deliveries folder only when it is complete.');
  const unsigned = !hasCertificate();
  if (unsigned && !process.argv.includes('--unsigned') && !(await confirmUnsigned())) {
    throw new Error('No code-signing certificate is set, and building unsigned was not confirmed. Nothing was built.');
  }
  const made = await packageApp({ licenceFile, carryLicence: false, target: 'zip', unsigned });
  deliverUnsigned = unsigned;
  const zip = made.find((f) => f.endsWith('.zip'));
  if (!zip) throw new Error('The build made no zip.');

  const slug = licence.licensee.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const out = path.join(DESKTOP, 'deliveries', licence.id + '-' + slug);
  fs.mkdirSync(out, { recursive: true });
  const zipOut = path.join(out, path.basename(zip));
  fs.renameSync(zip, zipOut);
  const licenceOut = path.join(out, licence.licensee.replace(/[\\/:*?"<>|]/g, '') + ' licence.lic');
  fs.copyFileSync(licenceFile, licenceOut);
  fs.writeFileSync(
    path.join(out, 'READ ME FIRST.txt'),
    [
      PRODUCT + ' ' + VERSION,
      'Licensed to ' + licence.licensee + ' (licence ' + licence.id + (licence.expires ? ', valid until ' + licence.expires : '') + ')',
      '',
      'To start:',
      '1. Right-click ' + path.basename(zipOut) + ' and choose "Extract All". As the folder, type',
      '      %LOCALAPPDATA%\\Programs\\QA Studio',
      '   (your own Programs folder: the app will not start from a folder other people who use this',
      '   computer can change, such as one made directly under C:\\).',
      '2. In the extracted folder, double-click "QA Practice Training Studio.exe".',
      ...(deliverUnsigned
        ? [
            '   This copy is not code-signed yet, so Windows says "Windows protected your PC". Check the',
            '   fingerprint first (below); if it matches, choose "More info", then "Run anyway".',
          ]
        : ['   It is signed by Evoke Technologies. If Windows warns that it is not, do not run it: ask Evoke.']),
      '3. Choose "Choose licence file..." and pick "' + path.basename(licenceOut) + '".',
      '4. Read the licence agreement, tick the box, and choose "Accept and open".',
      '',
      'This copy works only with this licence. Keep the licence file safe, and do not share it',
      'or the application.',
      '',
      'To check the zip is the one Evoke sent, run this in a Command Prompt in its folder, and',
      'compare the result with the fingerprint Evoke gave you separately:',
      '   certutil -hashfile ' + path.basename(zipOut) + ' SHA256',
      '',
      'Copyright (c) 2026 Evoke Technologies. All rights reserved.',
      '',
    ].join('\r\n'),
  );

  // The zip's and the licence's fingerprints, for the customer to check what they received.
  const sums = [zipOut, licenceOut]
    .map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + '  ' + path.basename(f))
    .join('\r\n');
  fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums + '\r\n');

  console.log('\n' + '='.repeat(70));
  console.log('  DONE. Ready to send, in ' + out);
  console.log('='.repeat(70));
  console.log('  ' + path.basename(zipOut) + '  (' + Math.round(fs.statSync(zipOut).size / 1024 / 1024) + ' MB)');
  console.log('  ' + path.basename(licenceOut));
  console.log('  READ ME FIRST.txt');
  console.log('  SHA256SUMS.txt');
  console.log('');
  console.log('  Send the licence by a different route from the zip (for example the zip as a download link,');
  console.log('  the licence by email to the named contact), and the fingerprints in SHA256SUMS.txt by a third');
  console.log('  route, or read them out: the seal only protects the course while the two travel apart.');
  if (!process.argv.includes('--no-open')) spawn(systemExe(path.join('..', 'explorer.exe')), [out], { detached: true, stdio: 'ignore' }).unref();
}

main().catch((e) => {
  console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
