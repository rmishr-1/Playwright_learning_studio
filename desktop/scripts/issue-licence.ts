/**
 * Issues a licence, signed with Evoke's private key (see licence-keygen.ts).
 *
 *   npm run licence:issue -- --licensee "Acme Ltd" [--email a@acme.com] [--expires 2027-09-30]
 *                            [--machine ABCD-1234-EF56-7890] [--logo acme.png] [--id EVK-1A2B3C4D]
 *
 * Writes desktop/licences/<id>-<licensee>.lic, and adds a line to desktop/keys/issued.csv, the
 * record of who has which licence: the ID is what the watermark in a leaked copy points to. Give
 * the same --id to reissue a licence (a new expiry date, or a machine-bound one for a customer
 * whose build accepts only that ID). --logo puts the customer's logo (PNG or JPEG) into the licence;
 * the app shows it in its header.
 *
 * new-customer.ts uses issueLicence() to issue a licence and build the customer's app in one go.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOGO_MAX_BYTES, PRODUCT, sign, verify, type Licence } from '../src/licence';

const DESKTOP = path.resolve(__dirname, '..');

export type IssueOptions = {
  licensee: string;
  email?: string | null;
  expires?: string | null;
  machine?: string | null;
  /** A PNG or JPEG file. */
  logoFile?: string | null;
  id?: string | null;
};

/** Checks the options, and says what is wrong with them in words; null when they are fine. */
export function problemWith(o: IssueOptions): string | null {
  if (!o.licensee.trim()) return 'The customer needs a name.';
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

/** Issues the licence, writes it, records it, and returns it with the file it was written to. */
export function issueLicence(o: IssueOptions): { licence: Licence; file: string } {
  const problem = problemWith(o);
  if (problem) throw new Error(problem);
  const privateKey = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');
  const publicKey = fs.readFileSync(path.join(DESKTOP, 'src', 'licence-public.pem'), 'utf-8');

  const logo = o.logoFile
    ? 'data:image/' + (/\.png$/i.test(o.logoFile) ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(o.logoFile).toString('base64')
    : null;
  const licence: Licence = {
    id: o.id ?? 'EVK-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    licensee: o.licensee.trim(),
    email: o.email?.trim() || null,
    issued: new Date().toISOString().slice(0, 10),
    expires: o.expires || null,
    machine: o.machine?.toUpperCase() || null,
    product: PRODUCT,
    ...(logo ? { logo } : {}),
  };
  const text = JSON.stringify(sign(licence, privateKey), null, 2) + '\n';

  // Never hand out a licence the app would refuse.
  const check = verify(text, publicKey, { onlyId: null, machine: licence.machine ?? 'ANY' });
  if (!check.ok) throw new Error('The new licence does not verify: ' + check.reason);

  const slug = licence.licensee.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(DESKTOP, 'licences', licence.id + '-' + slug + '.lic');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);

  const log = path.join(DESKTOP, 'keys', 'issued.csv');
  if (!fs.existsSync(log)) fs.writeFileSync(log, 'id,licensee,email,issued,expires,machine\n');
  const csv = (v: string | null): string => '"' + (v ?? '').replace(/"/g, '""') + '"';
  fs.appendFileSync(
    log,
    [licence.id, licence.licensee, licence.email, licence.issued, licence.expires, licence.machine].map(csv).join(',') + '\n',
  );
  return { licence, file };
}

function arg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

if (require.main === module) {
  const licensee = arg('licensee');
  if (!licensee) {
    console.error('Usage: npm run licence:issue -- --licensee "Name" [--email x] [--expires YYYY-MM-DD] [--machine CODE] [--logo file.png] [--id EVK-...]');
    process.exit(1);
  }
  try {
    const { licence, file } = issueLicence({
      licensee,
      email: arg('email'),
      expires: arg('expires'),
      machine: arg('machine'),
      logoFile: arg('logo') ? path.resolve(arg('logo')!) : null,
      id: arg('id'),
    });
    console.log(
      'Issued ' + licence.id + ' to ' + licence.licensee + (licence.expires ? ', until ' + licence.expires : '') +
        (licence.machine ? ', for machine ' + licence.machine : '') + (licence.logo ? ', with their logo' : ''),
    );
    console.log(file);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
