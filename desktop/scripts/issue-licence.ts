/**
 * Issues a licence, signed with Evoke's private key (see licence-keygen.ts).
 *
 *   npm run licence:issue -- --licensee "Acme Ltd" [--email a@acme.com] [--expires 2027-09-30]
 *                            [--machine ABCD-1234-EF56-7890] [--id EVK-1A2B3C4D]
 *
 * Writes desktop/licences/<id>-<licensee>.lic, and adds a line to desktop/keys/issued.csv, the
 * record of who has which licence: the ID is what the watermark in a leaked copy points to. Give
 * the same --id to reissue a licence (a new expiry date, or a machine-bound one for a customer
 * whose build accepts only that ID).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PRODUCT, sign, verify, type Licence } from '../src/licence';

const DESKTOP = path.resolve(__dirname, '..');

export function arg(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

const licensee = arg('licensee');
if (!licensee) {
  console.error('Usage: npm run licence:issue -- --licensee "Name" [--email x] [--expires YYYY-MM-DD] [--machine CODE] [--id EVK-...]');
  process.exit(1);
}
const expires = arg('expires');
if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
  console.error('--expires must be a date, YYYY-MM-DD.');
  process.exit(1);
}
const machine = arg('machine')?.toUpperCase() ?? null;
if (machine && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(machine)) {
  console.error('--machine must be a machine code as the app shows it: XXXX-XXXX-XXXX-XXXX.');
  process.exit(1);
}

const privateKey = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');
const publicKey = fs.readFileSync(path.join(DESKTOP, 'src', 'licence-public.pem'), 'utf-8');

const licence: Licence = {
  id: arg('id') ?? 'EVK-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  licensee,
  email: arg('email'),
  issued: new Date().toISOString().slice(0, 10),
  expires,
  machine,
  product: PRODUCT,
};
const file = sign(licence, privateKey);
const text = JSON.stringify(file, null, 2) + '\n';

// Never hand out a licence the app would refuse.
const check = verify(text, publicKey, { onlyId: null, machine: machine ?? 'ANY' });
if (!check.ok) throw new Error('The new licence does not verify: ' + check.reason);

const slug = licensee.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = path.join(DESKTOP, 'licences', licence.id + '-' + slug + '.lic');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);

const log = path.join(DESKTOP, 'keys', 'issued.csv');
if (!fs.existsSync(log)) fs.writeFileSync(log, 'id,licensee,email,issued,expires,machine\n');
const csv = (v: string | null): string => '"' + (v ?? '').replace(/"/g, '""') + '"';
fs.appendFileSync(log, [licence.id, licensee, licence.email, licence.issued, expires, machine].map(csv).join(',') + '\n');

console.log('Issued ' + licence.id + ' to ' + licensee + (expires ? ', until ' + expires : '') + (machine ? ', for machine ' + machine : ''));
console.log(out);
