/**
 * Evoke's licence signing key: where it is kept, and how it is protected.
 *
 * It lives outside the repository, in %USERPROFILE%\.evoke-studio\ (or STUDIO_KEY_DIR), so no git
 * command, sync script or zip of the project can ever take it along:
 *
 *   licence-private.dpapi   the private key, encrypted by Windows for this user on this computer
 *                           (DPAPI): the file is useless to anyone who copies it elsewhere
 *   public-key.sha256       the fingerprint of the matching public key; a build refuses a
 *                           desktop/src/licence-public.pem that does not match it
 *   issued.csv              the record of every licence issued
 *
 * Because the DPAPI file opens only for this Windows user, keep a backup made with
 * `npm run licence:backup-key` (encrypted with a passphrase you choose) somewhere safe and offline.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { systemExe } from '../../backend/src/child-env';

export const DESKTOP = path.resolve(__dirname, '..');
export const KEY_DIR = process.env.STUDIO_KEY_DIR || path.join(os.homedir(), '.evoke-studio');
export const PRIVATE_FILE = path.join(KEY_DIR, 'licence-private.dpapi');
export const FINGERPRINT_FILE = path.join(KEY_DIR, 'public-key.sha256');
export const ISSUED_CSV = path.join(KEY_DIR, 'issued.csv');
export const PUBLIC_KEY_FILE = path.join(DESKTOP, 'src', 'licence-public.pem');
/** Where the key used to be kept, inside the project. Moved out on first use (migrate()). */
const LEGACY_DIR = path.join(DESKTOP, 'keys');

const POWERSHELL = systemExe(path.join('WindowsPowerShell', 'v1.0', 'powershell.exe'));

/** Runs DPAPI on base64 text through Windows PowerShell; the data goes by stdin, never argv. */
function dpapi(action: 'Protect' | 'Unprotect', base64: string): string {
  const script =
    'Add-Type -AssemblyName System.Security; ' +
    '$in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ' +
    '$out = [Security.Cryptography.ProtectedData]::' + action + "($in, $null, 'CurrentUser'); " +
    '[Convert]::ToBase64String($out)';
  return execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: base64,
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();
}

export const publicFingerprint = (pem: string): string =>
  crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })).digest('hex');

/** Stores a private key (PEM) encrypted for this Windows user, with its public key's fingerprint. */
export function storePrivateKey(pem: string): void {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const sealed = dpapi('Protect', Buffer.from(pem, 'utf-8').toString('base64'));
  fs.writeFileSync(PRIVATE_FILE, sealed + '\n');
  const publicPem = crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString();
  fs.writeFileSync(FINGERPRINT_FILE, publicFingerprint(publicPem) + '\n');
  // Proves the stored copy opens before anything relies on it.
  if (loadPrivateKey() !== pem) throw new Error('The signing key could not be stored safely.');
}

/**
 * Moves a key kept in the old place (desktop/keys/, inside the project) to the protected one, with
 * its record of issued licences, and removes the plain copy once the protected one is proven.
 */
function migrate(): void {
  const legacy = path.join(LEGACY_DIR, 'licence-private.pem');
  if (fs.existsSync(PRIVATE_FILE) || !fs.existsSync(legacy)) return;
  const pem = fs.readFileSync(legacy, 'utf-8');
  storePrivateKey(pem);
  const csv = path.join(LEGACY_DIR, 'issued.csv');
  if (fs.existsSync(csv) && !fs.existsSync(ISSUED_CSV)) fs.copyFileSync(csv, ISSUED_CSV);
  fs.rmSync(LEGACY_DIR, { recursive: true, force: true });
  console.log('The licence signing key has moved out of the project, encrypted for this Windows user: ' + KEY_DIR);
  console.log('Make a backup now: npm run licence:backup-key');
}

export function hasPrivateKey(): boolean {
  migrate();
  return fs.existsSync(PRIVATE_FILE);
}

/** The private key, decrypted in memory. */
export function loadPrivateKey(): string {
  migrate();
  if (!fs.existsSync(PRIVATE_FILE)) {
    throw new Error("Evoke's licence signing key is not on this computer (" + PRIVATE_FILE + '). Licences can only be issued where it is.');
  }
  return Buffer.from(dpapi('Unprotect', fs.readFileSync(PRIVATE_FILE, 'utf-8').trim()), 'base64').toString('utf-8');
}

/**
 * The public key a build puts into the app, checked against the fingerprint kept with the private
 * key: a licence-public.pem swapped in the repository would let someone else's licences in.
 */
export function checkedPublicKey(file = PUBLIC_KEY_FILE): string {
  const pem = fs.readFileSync(file, 'utf-8');
  migrate();
  if (file === PUBLIC_KEY_FILE && fs.existsSync(FINGERPRINT_FILE)) {
    const want = fs.readFileSync(FINGERPRINT_FILE, 'utf-8').trim();
    if (publicFingerprint(pem) !== want) {
      throw new Error(
        'desktop/src/licence-public.pem is not the public half of the signing key kept in ' + KEY_DIR + '. ' +
          'Someone may have replaced it; the build stops.',
      );
    }
  }
  return pem;
}
