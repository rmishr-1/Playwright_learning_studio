/**
 * Issues a licence, signed with Evoke's private key (see signing-key.ts).
 *
 *   npm run licence:issue -- --licensee "Acme Ltd" [--email a@acme.com] [--expires 2027-09-30]
 *                            [--machine ABCD-1234-EF56-7890] [--logo acme.png] [--id EVK-1A2B3C4D]
 *
 * Writes desktop/licences/<id>-<licensee>.lic, and adds a line to issued.csv beside the signing key,
 * the record of who has which licence: the ID is what the watermark in a leaked copy points to. The
 * email is kept in that record only, not in the licence.
 *
 * Give the same --id to reissue a licence (a new expiry date, or a machine-bound one): it must be
 * for the same licensee, it keeps the licence's seal (so the customer's build still opens with it),
 * and the earlier file is revoked (revoke-licence.ts). An ID with no record of its seal is refused,
 * rather than given a new seal the customer's build would not open with. Add --new-seal when the
 * licence leaked: the old file then cannot decrypt the customer's next build either, so they need
 * a new build too. --logo puts the customer's logo (PNG or JPEG) into the licence; the app shows it
 * in its header.
 *
 * new-customer.ts uses issueLicence() to issue a licence and build the customer's app in one go.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOGO_MAX_BYTES, PRODUCT, sign, verify, type Licence, type LicenceFile } from '../src/licence';
import { DESKTOP, ISSUED_CSV, SEALS_FILE, checkedPublicKey, loadPrivateKey } from './signing-key';
import { readRevoked, revoke } from './revoke-licence';

export const LICENCES_DIR = path.join(DESKTOP, 'licences');

export type IssueOptions = {
  licensee: string;
  email?: string | null;
  expires?: string | null;
  machine?: string | null;
  /** A PNG or JPEG file. */
  logoFile?: string | null;
  id?: string | null;
  /** A reissue with a new seal, for a licence that leaked. */
  newSeal?: boolean;
};

/** Checks the options, and says what is wrong with them in words; null when they are fine. */
export function problemWith(o: IssueOptions): string | null {
  if (!o.licensee.trim()) return 'The customer needs a name.';
  if (o.licensee.length > 120) return 'The customer name is too long.';
  if (o.email && !/^[^\s@,;"<>]+@[^\s@,;"<>]+\.[^\s@,;"<>]+$/.test(o.email)) return 'That email address does not look right.';
  if (o.expires && !/^\d{4}-\d{2}-\d{2}$/.test(o.expires)) return 'The expiry date must be written YYYY-MM-DD, such as 2027-09-30.';
  if (o.expires && o.expires < new Date().toISOString().slice(0, 10)) return 'The expiry date has already passed.';
  if (o.machine && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(o.machine)) {
    return 'A machine code looks like XXXX-XXXX-XXXX-XXXX, as the app shows it.';
  }
  if (o.logoFile) {
    if (!fs.existsSync(o.logoFile)) return 'There is no file at ' + o.logoFile + '.';
    if (!/\.(png|jpe?g)$/i.test(o.logoFile)) return 'The logo must be a PNG or JPEG file.';
    if (fs.statSync(o.logoFile).size > LOGO_MAX_BYTES) return 'The logo is over 300 KB. Use a smaller image (about 400 pixels wide is plenty).';
  }
  if (o.id && !/^EVK-[0-9A-F]{8}$/.test(o.id)) return 'A licence ID looks like EVK-1A2B3C4D.';
  return null;
}

/** The licence files already issued under an ID, newest first. */
function issuedUnder(id: string): { file: string; licence: LicenceFile }[] {
  if (!fs.existsSync(LICENCES_DIR)) return [];
  return fs
    .readdirSync(LICENCES_DIR)
    .filter((n) => n.startsWith(id + '-') && n.endsWith('.lic'))
    .map((n) => path.join(LICENCES_DIR, n))
    .map((file) => ({ file, licence: JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile }))
    .sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs);
}

type Seals = Record<string, { licensee: string; seal: string }>;
const readSeals = (): Seals => (fs.existsSync(SEALS_FILE) ? (JSON.parse(fs.readFileSync(SEALS_FILE, 'utf-8')) as Seals) : {});

/** A spreadsheet cell: quoted, and never read as a formula. */
const csv = (v: string | null | undefined): string => {
  let s = (v ?? '').replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s + '"';
};

/** Every licence ID this computer has a record of: in seals.json, issued.csv and licences/. */
function knownIds(seals: Seals): Set<string> {
  const ids = new Set(Object.keys(seals));
  if (fs.existsSync(ISSUED_CSV)) for (const m of fs.readFileSync(ISSUED_CSV, 'utf-8').matchAll(/EVK-[0-9A-F]{8}/g)) ids.add(m[0]);
  if (fs.existsSync(LICENCES_DIR)) for (const n of fs.readdirSync(LICENCES_DIR)) ids.add(n.slice(0, 12));
  for (const r of readRevoked().revoked) ids.add(r.id);
  return ids;
}

/**
 * Issues the licence, writes it, records it, and returns it with the file it was written to, and
 * any warning for whoever issued it.
 */
export async function issueLicence(o: IssueOptions): Promise<{ licence: Licence; file: string; warnings: string[] }> {
  const problem = problemWith(o);
  if (problem) throw new Error(problem);
  const publicKey = checkedPublicKey();
  const privateKey = await loadPrivateKey();

  // A reissue keeps the seal, and must be for the same licensee.
  const seals = readSeals();
  const earlier = o.id ? issuedUnder(o.id) : [];
  const known = o.id ? seals[o.id] : undefined;
  const firstLicensee = known?.licensee ?? earlier[0]?.licence.licence.licensee;
  if (o.id && firstLicensee === undefined) {
    throw new Error('There is no record of ' + o.id + ' on this computer, so it cannot be reissued. Issue a new licence instead.');
  }
  if (firstLicensee !== undefined && firstLicensee !== o.licensee.trim()) {
    throw new Error(o.id + ' was issued to ' + firstLicensee + ', not ' + o.licensee.trim() + '.');
  }
  // A licence that was withdrawn (not just reissued) comes back only with a new seal: with its old
  // seal, a new file would open the withdrawn copy again.
  const withdrawn = o.id ? readRevoked().revoked.some((r) => r.id === o.id && !r.reason.startsWith('reissued')) : false;
  if (withdrawn && !o.newSeal) {
    throw new Error(o.id + ' was withdrawn. Reissue it only with --new-seal (the customer then needs a new build), or issue a new licence.');
  }
  // Every earlier file must be revoked; one that is not here any more cannot be, so the old seal
  // is kept only when they all are.
  if (o.id && known && earlier.length === 0 && !o.newSeal) {
    throw new Error(
      'The earlier licence files for ' + o.id + ' are not in desktop/licences/, so they cannot be revoked. ' +
        'Put them back, or reissue with --new-seal (the customer then needs a new build).',
    );
  }
  const kept = known?.seal ?? earlier.find((e) => e.licence.licence.seal)?.licence.licence.seal;
  const seal = !o.newSeal && kept ? kept : crypto.randomBytes(32).toString('hex');

  // A new licence gets an ID no licence has had: two customers must never share a seal record or a watermark.
  let id = o.id ?? '';
  if (!id) {
    const taken = knownIds(seals);
    do id = 'EVK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    while (taken.has(id));
  }

  const logo = o.logoFile
    ? 'data:image/' + (/\.png$/i.test(o.logoFile) ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(o.logoFile).toString('base64')
    : null;
  const licence: Licence = {
    id,
    licensee: o.licensee.trim(),
    email: null,
    issued: new Date().toISOString().slice(0, 10),
    expires: o.expires || null,
    machine: o.machine?.toUpperCase() || null,
    product: PRODUCT,
    ...(logo ? { logo } : {}),
    seal,
    serial: crypto.randomBytes(8).toString('hex'),
  };
  const text = JSON.stringify(sign(licence, privateKey), null, 2) + '\n';

  // Never hand out a licence the app would refuse.
  const check = verify(text, publicKey, { onlyId: null, machine: licence.machine ?? 'ANY' });
  if (!check.ok) throw new Error('The new licence does not verify: ' + check.reason);

  // The files it replaces are withdrawn, and kept aside as a record.
  for (const e of earlier) {
    revoke(e.file, 'reissued ' + licence.issued);
    fs.renameSync(e.file, e.file.replace(/\.lic$/, '.revoked-' + Date.now() + '.lic.old'));
  }

  fs.writeFileSync(SEALS_FILE, JSON.stringify({ ...seals, [licence.id]: { licensee: licence.licensee, seal } }, null, 2) + '\n');

  const slug = licence.licensee.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(LICENCES_DIR, licence.id + '-' + slug + '.lic');
  fs.mkdirSync(LICENCES_DIR, { recursive: true });
  fs.writeFileSync(file, text);

  // A reissue that narrows the terms reaches only builds made from now on: the customer's copy
  // accepts the earlier file until it is rebuilt.
  const warnings: string[] = [];
  const before = earlier[0]?.licence.licence;
  const narrower =
    before &&
    ((licence.machine && licence.machine !== before.machine) || (licence.expires && (!before.expires || licence.expires < before.expires)));
  if (narrower) {
    warnings.push(
      'This reissue narrows the licence, but the copy the customer already has still accepts the earlier file, for good ' +
        '(or until its end date). Send them a new build: npm run new-customer -- --rebuild "' + file + '". Nothing can ' +
        'reach the copy they already have: --new-seal only stops the earlier file opening builds made from now on.',
    );
  }

  if (!fs.existsSync(ISSUED_CSV)) fs.writeFileSync(ISSUED_CSV, 'id,licensee,email,issued,expires,machine\n');
  fs.appendFileSync(
    ISSUED_CSV,
    [licence.id, licence.licensee, o.email?.trim() || null, licence.issued, licence.expires, licence.machine].map(csv).join(',') + '\n',
  );
  return { licence, file, warnings };
}

function arg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

async function main(): Promise<void> {
  const licensee = arg('licensee');
  if (!licensee) {
    console.error('Usage: npm run licence:issue -- --licensee "Name" [--email x] [--expires YYYY-MM-DD] [--machine CODE] [--logo file.png] [--id EVK-... [--new-seal]]');
    process.exit(1);
  }
  try {
    const { licence, file, warnings } = await issueLicence({
      licensee,
      email: arg('email'),
      expires: arg('expires'),
      machine: arg('machine'),
      logoFile: arg('logo') ? path.resolve(arg('logo')!) : null,
      id: arg('id'),
      newSeal: process.argv.includes('--new-seal'),
    });
    console.log(
      'Issued ' + licence.id + ' to ' + licence.licensee + (licence.expires ? ', until ' + licence.expires : '') +
        (licence.machine ? ', for machine ' + licence.machine : '') + (licence.logo ? ', with their logo' : ''),
    );
    console.log(file);
    for (const w of warnings) console.log('\nWARNING: ' + w);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

if (require.main === module) void main();
