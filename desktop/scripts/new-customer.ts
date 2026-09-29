/**
 * Adds a new customer and makes the app they get, in one go: their short code (BWP), their licence,
 * their variant in variants.json ("Evoke Training Studio BWP"), and its installer. Double-click
 * desktop/new-customer.bat, or:
 *
 *   npm run new-customer                        asks for each detail
 *   npm run new-customer -- --code BWP --licensee "BWP Group" --logo bwp.png [--email x]
 *                           [--expires 2027-09-30] [--machine XXXX-XXXX-XXXX-XXXX]   (no questions)
 *   ... --zip                                   a zip instead of an installer
 *   npm run new-customer -- --rebuild licences/<id>-<name>.lic   a new build for a licence already
 *                                                                 issued (after a course update, or
 *                                                                 a reissue); --code X names the
 *                                                                 variant when it has none yet
 *
 * Their app is its own: named "Evoke Training Studio <code>", it installs beside Evoke's own and
 * every other customer's. It opens only with their licence and refuses every other one, even a
 * valid licence Evoke issued to someone else. It does not carry the licence, so the installer alone
 * opens nothing; send the licence file by a different route. Its lessons carry the licence ID as an
 * invisible watermark, and when the licence has a logo, the app shows it in its header.
 *
 * What to send is put in desktop/deliveries/<code>/ (build-variant.ts). Commit desktop/variants.json
 * afterwards, so the customer's app keeps its name and identity in every later build.
 *
 * Takes about 10 minutes, most of it compressing the browsers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { issueLicence, problemWith, type IssueOptions } from './issue-licence';
import type { LicenceFile } from '../src/licence';
import { VERSION } from './build';
import { buildVariant } from './build-variant';
import { PRIVATE_FILE, hasPrivateKey } from './signing-key';
import {
  addVariant,
  codeProblem,
  derivedAppId,
  derivedName,
  readVariants,
  setVariantLicence,
  variantByCode,
  variantByLicenceId,
  VARIANTS_FILE,
} from './variants';

function arg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

/** A path typed, pasted, or dragged into the window (which adds quotes). */
const cleanPath = (p: string): string => p.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

type NewCustomer = { code: string; options: IssueOptions };

async function ask(): Promise<NewCustomer | null> {
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
  console.log('  New customer: Evoke Training Studio ' + VERSION);
  console.log('  Customers have now: ' + readVariants().filter((v) => v.licensee).map((v) => v.code + ' (' + v.licensee + ')').join(', '));
  console.log('  Press Enter to skip anything marked (optional).');
  console.log('');
  const code = (
    await q('  Short code for their app, 2 to 8 capital letters or digits (e.g. BWP): ', (v) => codeProblem(v.toUpperCase()))
  ).toUpperCase();
  console.log('  Their app will be called "' + derivedName(code) + '".');
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
  console.log('  App:       ' + derivedName(code));
  console.log('  Customer:  ' + licensee);
  console.log('  Email:     ' + (email || '-'));
  console.log('  Expires:   ' + (expires || 'never'));
  console.log('  Logo:      ' + (logo || 'none'));
  console.log('  Computer:  ' + (machine || 'any'));
  const go = (await question('\n  Issue the licence and build their app (about 10 minutes)? [Y/n] ')).trim().toLowerCase();
  rl.close();
  return go === '' || go === 'y' || go === 'yes' ? { code, options } : null;
}

/** The licence file's path as variants.json keeps it: licences/<file>, relative to desktop/. */
function variantLicencePath(file: string): string {
  const dir = path.resolve(path.dirname(VARIANTS_FILE), 'licences');
  if (path.resolve(path.dirname(file)) !== dir) throw new Error(file + ' is not in ' + dir + ', where every licence a build uses is kept.');
  return 'licences/' + path.basename(file);
}

/**
 * --rebuild: a new build for a licence already issued. Its variant is found by the licence ID; a
 * reissued licence moves to the variant --code names (keeping its name and identity, so it installs
 * over the customer's copy), and a licence with no variant yet gets one with --code.
 */
async function rebuild(file: string, code: string | null, build: { zip: boolean; unsigned: boolean }): Promise<void> {
  const licence = (JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile).licence;
  const rel = variantLicencePath(file);
  const known = variantByLicenceId(licence.id);
  if (known) {
    if (known.licence !== rel) setVariantLicence(known.code, rel, licence.id);
    await buildVariant(known.code, build);
    return;
  }
  if (!code) {
    throw new Error(licence.id + ' (' + licence.licensee + ') has no app in variants.json yet. Give it one with --code, e.g. --code BWP.');
  }
  const existing = readVariants().find((v) => v.code.toLowerCase() === code.toLowerCase());
  if (existing) {
    if (existing.licensee !== licence.licensee) {
      throw new Error('"' + existing.name + '" is for ' + existing.licensee + ', but this licence is for ' + licence.licensee + '.');
    }
    setVariantLicence(existing.code, rel, licence.id);
    console.log('\n> "' + existing.name + '" now uses licence ' + licence.id);
    await buildVariant(existing.code, build);
    return;
  }
  const upper = code.toUpperCase();
  const problem = codeProblem(upper);
  if (problem) throw new Error(problem);
  addVariant({ code: upper, name: derivedName(upper), appId: derivedAppId(upper), licensee: licence.licensee, licenceId: licence.id, licence: rel });
  console.log('\n> Added "' + derivedName(upper) + '" to variants.json');
  await buildVariant(upper, build);
}

async function main(): Promise<void> {
  const build = { zip: process.argv.includes('--zip'), unsigned: process.argv.includes('--unsigned') };
  const again = arg('rebuild');
  if (again) return rebuild(path.resolve(cleanPath(again)), arg('code'), build);
  if (!hasPrivateKey()) {
    throw new Error("Evoke's licence signing key is not on this computer (" + PRIVATE_FILE + '). Licences can only be issued where it is.');
  }
  const fromArgs = arg('licensee');
  let customer: NewCustomer | null;
  if (fromArgs) {
    const code = (arg('code') ?? '').toUpperCase();
    if (!code) throw new Error('Give the customer\'s short code with --code, e.g. --code BWP.');
    customer = {
      code,
      options: {
        licensee: fromArgs,
        email: arg('email'),
        expires: arg('expires'),
        machine: arg('machine'),
        logoFile: arg('logo') ? path.resolve(cleanPath(arg('logo')!)) : null,
      },
    };
  } else {
    customer = await ask();
  }
  if (!customer) {
    console.log('Nothing was issued.');
    return;
  }
  // Checked again here: the code may have been taken while the questions were answered.
  const problem = codeProblem(customer.code) ?? problemWith(customer.options);
  if (problem) throw new Error(problem);

  const { licence, file } = await issueLicence(customer.options);
  console.log('\n> Issued ' + licence.id + ' to ' + licence.licensee + (licence.logo ? ', with their logo' : ''));
  // Recorded before the build, so a build that fails can be run again: npm run build-variant -- <code>
  addVariant({
    code: customer.code,
    name: derivedName(customer.code),
    appId: derivedAppId(customer.code),
    licensee: licence.licensee,
    licenceId: licence.id,
    licence: variantLicencePath(file),
  });
  console.log('> Added "' + variantByCode(customer.code).name + '" to variants.json. Commit it, so their app keeps its name in every later build.');
  await buildVariant(customer.code, build);
}

main().catch((e) => {
  console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
