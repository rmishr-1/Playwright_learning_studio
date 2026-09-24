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
 *   QA-Studio-<version>-<licence id>.zip                     the app. Unzip it to a short folder
 *                                                             and run QA Practice Training Studio.exe
 *   <customer> licence.lic                                    their licence
 *   READ ME FIRST.txt                                         how to start
 *
 * The app in the zip opens only with that licence: it refuses every other one, even a valid
 * licence Evoke issued to someone else. It does not carry the licence, so the zip alone opens
 * nothing; send the licence file with it (or separately). Its lessons carry the licence ID as an
 * invisible watermark, and when the licence has a logo, the app shows it in its header.
 *
 * Takes about 10 minutes, most of it compressing the browsers into the zip.
 */
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { issueLicence, problemWith, type IssueOptions } from './issue-licence';
import type { LicenceFile } from '../src/licence';
import { packageApp } from './package';
import { DESKTOP, PRODUCT, VERSION } from './build';

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

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(DESKTOP, 'keys', 'licence-private.pem'))) {
    throw new Error("Evoke's licence signing key is not on this computer (desktop/keys/licence-private.pem). Licences can only be issued where it is.");
  }
  const rebuild = arg('rebuild');
  if (rebuild) return deliver(path.resolve(cleanPath(rebuild)));
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

  const { licence, file: licenceFile } = issueLicence(options);
  console.log('\n> Issued ' + licence.id + ' to ' + licence.licensee + (licence.logo ? ', with their logo' : ''));
  return deliver(licenceFile);
}

/**
 * Builds the customer's zip for a licence already issued, and puts it, the licence and a read-me in
 * deliveries/<licence id>-<customer>/. --rebuild <licence file> does only this: a new zip for the
 * same licence, such as after the course has changed.
 */
async function deliver(licenceFile: string): Promise<void> {
  const licence = (JSON.parse(fs.readFileSync(licenceFile, 'utf-8')) as LicenceFile).licence;

  // Node and the browsers the app ships, the first time.
  if (!fs.existsSync(path.join(DESKTOP, 'runtime', 'node', 'node.exe')) || !fs.existsSync(path.join(DESKTOP, 'runtime', 'ms-playwright'))) {
    console.log('\n> Gathering Node and the browsers the app ships (first time only)');
    execFileSync(process.execPath, [path.join(DESKTOP, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(__dirname, 'runtime.ts')], {
      stdio: 'inherit',
    });
  }

  console.log('\n  Building their app: about 10 minutes, the last 5 of them making the zip, when the');
  console.log('  window shows little. Keep this window open until it says DONE. The zip is moved into');
  console.log('  the deliveries folder only when it is complete.');
  const made = await packageApp({ licenceFile, carryLicence: false, target: 'zip' });
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
      '1. Right-click ' + path.basename(zipOut) + ' and choose "Extract All". Extract it to a short',
      '   folder such as C:\\QA Studio: the app has files deep inside, and Windows cannot extract them',
      '   into a long folder path.',
      '2. In the extracted folder, double-click "QA Practice Training Studio.exe".',
      '   If Windows says "Windows protected your PC", choose "More info", then "Run anyway".',
      '3. Choose "Choose licence file..." and pick "' + path.basename(licenceOut) + '".',
      '4. Read the licence agreement, tick the box, and choose "Accept and open".',
      '',
      'This copy works only with this licence. Keep the licence file safe, and do not share it',
      'or the application.',
      '',
      'Copyright (c) 2026 Evoke Technologies. All rights reserved.',
      '',
    ].join('\r\n'),
  );

  console.log('\n' + '='.repeat(70));
  console.log('  DONE. Ready to send, in ' + out);
  console.log('='.repeat(70));
  console.log('  ' + path.basename(zipOut) + '  (' + Math.round(fs.statSync(zipOut).size / 1024 / 1024) + ' MB)');
  console.log('  ' + path.basename(licenceOut));
  console.log('  READ ME FIRST.txt');
  if (!process.argv.includes('--no-open')) spawn('explorer.exe', [out], { detached: true, stdio: 'ignore' }).unref();
}

main().catch((e) => {
  console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
