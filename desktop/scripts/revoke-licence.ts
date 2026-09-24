/**
 * Withdraws a licence file: builds made from now on refuse it.
 *
 *   npm run licence:revoke -- licences/<id>-<customer>.lic [--reason "reissued with a new expiry"]
 *
 * Adds the file's fingerprint (the hash of its signature, so only that file, not every licence with
 * its ID) to desktop/revoked.json, which is committed and built into every copy. Copies already
 * given out do not change; send the customer a new build if they must stop accepting it. Revoke the
 * old file whenever a licence is reissued under the same ID.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fingerprint, type LicenceFile } from '../src/licence';
import { DESKTOP } from './signing-key';

export const REVOKED_FILE = path.join(DESKTOP, 'revoked.json');

export type Revoked = { revoked: { fingerprint: string; id: string; licensee: string; issued: string; reason: string; date: string }[] };

export function readRevoked(): Revoked {
  return fs.existsSync(REVOKED_FILE) ? (JSON.parse(fs.readFileSync(REVOKED_FILE, 'utf-8')) as Revoked) : { revoked: [] };
}

export function revoke(file: string, reason: string): boolean {
  const licenceFile = JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile;
  const list = readRevoked();
  const print = fingerprint(licenceFile);
  if (list.revoked.some((r) => r.fingerprint === print)) return false;
  list.revoked.push({
    fingerprint: print,
    id: licenceFile.licence.id,
    licensee: licenceFile.licence.licensee,
    issued: licenceFile.licence.issued,
    reason,
    date: new Date().toISOString().slice(0, 10),
  });
  fs.writeFileSync(REVOKED_FILE, JSON.stringify(list, null, 2) + '\n');
  return true;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run licence:revoke -- <licence file> [--reason "why"]');
    process.exit(1);
  }
  const i = process.argv.indexOf('--reason');
  const done = revoke(path.resolve(file), i === -1 ? 'withdrawn' : process.argv[i + 1] ?? 'withdrawn');
  console.log(done ? 'Revoked. Builds made from now on refuse this licence file.' : 'That licence file was already revoked.');
}
