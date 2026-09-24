/**
 * Withdraws a licence file: builds made from now on refuse it.
 *
 *   npm run licence:revoke -- licences/<id>-<customer>.lic [--reason "reissued with a new expiry"]
 *
 * Adds the file's fingerprint (the hash of its signature, so only that file, not every licence with
 * its ID) to desktop/revoked.json, which is committed and built into every copy. It records the
 * licence ID, never the customer's name: issued.csv, kept beside the signing key, says whose it is.
 *
 * Copies already given out do not change: they keep the list they were built with. A customer must
 * get a new build (npm run new-customer -- --rebuild <their new licence>) before their copy refuses
 * the old file. Revoke the old file whenever a licence is reissued under the same ID.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fingerprint, type LicenceFile } from '../src/licence';
import { DESKTOP } from './signing-key';

export const REVOKED_FILE = path.join(DESKTOP, 'revoked.json');

/**
 * kind: 'reissued' when licence:issue replaced the file with a new one for the same customer (it
 * writes that itself); 'withdrawn' for every other revocation. Only a withdrawn ID needs --new-seal
 * to be issued again. An entry without a kind counts as withdrawn.
 */
export type Revoked = {
  revoked: { fingerprint: string; id: string; issued: string; kind?: 'reissued' | 'withdrawn'; reason: string; date: string }[];
};

export function readRevoked(): Revoked {
  return fs.existsSync(REVOKED_FILE) ? (JSON.parse(fs.readFileSync(REVOKED_FILE, 'utf-8')) as Revoked) : { revoked: [] };
}

/** A reason is a few plain words ("reissued 2026-09-24", "withdrawn"), never a name. */
const REASON = /^[a-z0-9 .:-]{1,40}$/;

export function revoke(file: string, reason: string, kind: 'reissued' | 'withdrawn' = 'withdrawn'): boolean {
  const licenceFile = JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile;
  const words = reason.trim().toLowerCase();
  if (kind === 'withdrawn') {
    // Typed by a person: a few plain words, and never the customer's name, or its initials.
    const name = licenceFile.licence.licensee.toLowerCase();
    const parts = name.split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w));
    const initials = parts.map((w) => w[0]).join('');
    const said = words.split(/[^a-z0-9]+/);
    if (
      !REASON.test(words) ||
      words.startsWith('reissued') ||
      words.includes(name) ||
      parts.some((w) => w.length > 3 && words.includes(w)) ||
      (initials.length > 1 && said.includes(initials))
    ) {
      throw new Error(
        'Give the reason in a few plain words, such as "withdrawn" or "leaked", with no names and not starting "reissued": ' +
          'revoked.json is committed, and issued.csv says whose licence it was.',
      );
    }
  }
  reason = words;
  const list = readRevoked();
  const print = fingerprint(licenceFile);
  if (list.revoked.some((r) => r.fingerprint === print)) return false;
  list.revoked.push({
    fingerprint: print,
    id: licenceFile.licence.id,
    issued: licenceFile.licence.issued,
    kind,
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
  let done = false;
  try {
    done = revoke(path.resolve(file), i === -1 ? 'withdrawn' : process.argv[i + 1] ?? 'withdrawn');
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  console.log(
    done
      ? 'Revoked. Builds made from now on refuse this licence file. Copies already sent still accept it until the customer gets a new build.'
      : 'That licence file was already revoked.',
  );
}
