/**
 * Offline licences. Evoke signs a small JSON licence with its Ed25519 private key, which never
 * leaves Evoke (desktop/scripts/issue-licence.ts); the app holds only the public key, and will not
 * open the course without a licence that key verifies.
 *
 * A licence file:
 *
 *   {
 *     "licence": { "id": "EVK-1A2B3C4D", "licensee": "Acme Ltd", "email": null,
 *                  "issued": "2026-09-24", "expires": null, "machine": null, "product": "learning-studio" },
 *     "signature": "<base64 Ed25519 signature of canonical(licence)>"
 *   }
 *
 * `expires` and `machine` are optional limits: a date after which the licence stops working, and
 * the machine code of the one computer it works on. `logo`, also optional, is the customer's logo
 * as a PNG or JPEG data URL; the app shows it in its header. It is signed with the rest, so it
 * cannot be swapped.
 */
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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
};

/** A logo a licence may carry: a PNG or JPEG, as a data URL, up to 300 KB. */
export const LOGO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
export const LOGO_MAX_BYTES = 300 * 1024;

export type LicenceFile = { licence: Licence; signature: string };

export type Verdict = { ok: true; licence: Licence } | { ok: false; reason: string; licence?: Licence };

/**
 * The exact bytes that are signed: the licence's fields in a fixed order. `logo` is there only when
 * the licence has one, so a licence issued before logos existed still verifies.
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
  });
}

export function sign(l: Licence, privateKeyPem: string): LicenceFile {
  const signature = crypto.sign(null, Buffer.from(canonical(l)), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  return { licence: l, signature };
}

/**
 * Checks a licence file's text. `onlyId` is set in a build made for one customer, which accepts
 * that customer's licence only; `machine` is this computer's machine code.
 */
export function verify(
  text: string,
  publicKeyPem: string,
  opts: { onlyId: string | null; machine: string; today?: string },
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
  if (opts.onlyId && l.id !== opts.onlyId) {
    return { ok: false, reason: 'The licence (' + l.id + ') is not the one this copy was made for.', licence: l };
  }
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (l.expires && today > l.expires) return { ok: false, reason: 'The licence expired on ' + l.expires + '.', licence: l };
  if (l.machine && l.machine !== opts.machine) {
    return { ok: false, reason: 'The licence is for a different computer.', licence: l };
  }
  return { ok: true, licence: l };
}

/**
 * This computer's machine code: a hash of Windows' own machine ID, so it says nothing about the
 * computer and does not change when the app is reinstalled. XXXX-XXXX-XXXX-XXXX.
 */
export function machineCode(): string {
  let id = '';
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf-8',
      windowsHide: true,
    });
    id = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? '';
  } catch {
    id = '';
  }
  if (!id) return 'UNKNOWN';
  const hex = crypto.createHash('sha256').update('learning-studio:' + id).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join('-');
}
