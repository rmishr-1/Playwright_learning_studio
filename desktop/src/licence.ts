/**
 * Offline licences. Evoke signs a small JSON licence with its Ed25519 private key, which never
 * leaves Evoke (desktop/scripts/issue-licence.ts); the app holds only the public key, and will not
 * open the course without a licence that key verifies.
 *
 * A licence file:
 *
 *   {
 *     "licence": { "id": "EVK-1A2B3C4D", "licensee": "Acme Ltd", "email": null,
 *                  "issued": "2026-09-24", "expires": null, "machine": null, "product": "learning-studio",
 *                  "seal": "<64 hex>" },
 *     "signature": "<base64 Ed25519 signature of canonical(licence)>"
 *   }
 *
 * `expires` and `machine` are optional limits: a date after which the licence stops working, and
 * the machine code of the one computer it works on. `logo`, also optional, is the customer's logo
 * as a PNG or JPEG data URL; the app shows it in its header. `seal` is a random secret of the
 * customer's: a build made for them can only decrypt its course with it (see content.ts), so their
 * copy of the app opens nothing without their licence file. A licence reissued under the same ID
 * keeps its seal. All of it is signed, so none of it can be changed.
 */
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { systemExe } from '../../backend/src/child-env';

export const PRODUCT = 'learning-studio';

export type Licence = {
  id: string;
  licensee: string;
  email: string | null;
  issued: string;
  expires: string | null;
  machine: string | null;
  product: string;
  logo?: string | null;
  seal?: string | null;
};

/** A logo a licence may carry: a PNG or JPEG, as a data URL, up to 300 KB. */
export const LOGO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
export const LOGO_MAX_BYTES = 300 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEAL = /^[0-9a-f]{64}$/;

export type LicenceFile = { licence: Licence; signature: string };

export type Verdict = { ok: true; licence: Licence } | { ok: false; reason: string; licence?: Licence };

/**
 * The exact bytes that are signed: the licence's fields in a fixed order. `logo` and `seal` are
 * there only when the licence has them, so a licence issued before they existed still verifies.
 */
export function canonical(l: Licence): string {
  return JSON.stringify({
    id: l.id,
    licensee: l.licensee,
    email: l.email,
    issued: l.issued,
    expires: l.expires,
    machine: l.machine,
    product: l.product,
    ...(l.logo ? { logo: l.logo } : {}),
    ...(l.seal ? { seal: l.seal } : {}),
  });
}

export function sign(l: Licence, privateKeyPem: string): LicenceFile {
  const signature = crypto.sign(null, Buffer.from(canonical(l)), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  return { licence: l, signature };
}

/** How a revocation list names a licence file: the hash of its signature, so reissues differ. */
export const fingerprint = (file: LicenceFile): string => crypto.createHash('sha256').update(file.signature).digest('hex');

/**
 * Checks a licence file's text. `onlyId` is set in a build made for one customer, which accepts
 * that customer's licence only; `machine` is this computer's machine code; `revoked` lists the
 * fingerprints of licence files Evoke has withdrawn.
 */
export function verify(
  text: string,
  publicKeyPem: string,
  opts: { onlyId: string | null; machine: string; today?: string; revoked?: readonly string[] },
): Verdict {
  let file: LicenceFile;
  try {
    file = JSON.parse(text) as LicenceFile;
  } catch {
    return { ok: false, reason: 'The file is not a licence.' };
  }
  const l = file?.licence;
  if (!l || typeof l.id !== 'string' || typeof l.licensee !== 'string' || typeof file.signature !== 'string') {
    return { ok: false, reason: 'The file is not a licence.' };
  }
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(canonical(l)), crypto.createPublicKey(publicKeyPem), Buffer.from(file.signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'The licence is not valid: it was not issued by Evoke, or it has been changed.' };
  if (l.product !== PRODUCT) return { ok: false, reason: 'The licence is for a different product.', licence: l };
  if (l.logo && !LOGO.test(l.logo)) return { ok: false, reason: "The licence's logo is not a PNG or JPEG image.", licence: l };
  if (l.seal && !SEAL.test(l.seal)) return { ok: false, reason: 'The licence is damaged.', licence: l };
  if (opts.revoked?.includes(fingerprint(file))) return { ok: false, reason: 'The licence (' + l.id + ') has been withdrawn.', licence: l };
  if (opts.onlyId && l.id !== opts.onlyId) {
    return { ok: false, reason: 'The licence (' + l.id + ') is not the one this copy was made for.', licence: l };
  }
  if (l.expires) {
    if (!DATE.test(l.expires)) return { ok: false, reason: 'The licence is damaged.', licence: l };
    const today = opts.today ?? new Date().toISOString().slice(0, 10);
    if (today > l.expires) return { ok: false, reason: 'The licence expired on ' + l.expires + '.', licence: l };
  }
  if (l.machine) {
    if (opts.machine === 'UNKNOWN') return { ok: false, reason: "This computer's machine code cannot be read, and the licence is for one computer.", licence: l };
    if (l.machine !== opts.machine) return { ok: false, reason: 'The licence is for a different computer.', licence: l };
  }
  return { ok: true, licence: l };
}

/**
 * This computer's machine code: a hash of Windows' own machine ID, so it says nothing about the
 * computer and does not change when the app is reinstalled. XXXX-XXXX-XXXX-XXXX, or UNKNOWN when it
 * cannot be read (a licence for one computer then does not open). reg.exe is run by its full path,
 * so a reg.exe placed beside the app cannot answer in its place.
 */
export function machineCode(): string {
  let id = '';
  try {
    const out = execFileSync(systemExe('reg.exe'), ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf-8',
      windowsHide: true,
    });
    id = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(out)?.[1] ?? '';
  } catch {
    id = '';
  }
  if (!id) return 'UNKNOWN';
  const hex = crypto.createHash('sha256').update('learning-studio:' + id).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join('-');
}
