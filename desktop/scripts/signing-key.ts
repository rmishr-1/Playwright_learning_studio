/**
 * Evoke's licence signing key: where it is kept, and how it is protected.
 *
 * It lives outside the repository, in %USERPROFILE%\.evoke-studio\ (or STUDIO_KEY_DIR), so no git
 * command, sync script or zip of the project can ever take it along:
 *
 *   licence-private.dpapi   the private key, encrypted by Windows for this user on this computer
 *                           (DPAPI): the file is useless to anyone who copies it elsewhere. With a
 *                           passphrase set (npm run licence:set-passphrase), it is also encrypted
 *                           with that passphrase inside, so a program running as this Windows user
 *                           cannot open it without asking the person issuing a licence.
 *   public-key.sha256       the fingerprint of the matching public key; a release build refuses a
 *                           desktop/src/licence-public.pem that does not match it, or a computer
 *                           without it
 *   issued.csv, seals.json  the record of every licence issued, and each licence ID's seal
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
import { secret } from './prompt';

export const DESKTOP = path.resolve(__dirname, '..');
export const KEY_DIR = process.env.STUDIO_KEY_DIR || path.join(os.homedir(), '.evoke-studio');
export const PRIVATE_FILE = path.join(KEY_DIR, 'licence-private.dpapi');
export const FINGERPRINT_FILE = path.join(KEY_DIR, 'public-key.sha256');
export const ISSUED_CSV = path.join(KEY_DIR, 'issued.csv');
/** Each licence ID's seal, so a reissue keeps it even where desktop/licences/ is not. */
export const SEALS_FILE = path.join(KEY_DIR, 'seals.json');
export const PUBLIC_KEY_FILE = path.join(DESKTOP, 'src', 'licence-public.pem');
/**
 * The fingerprint of Evoke's public key. A release is built only with the key that matches both this
 * and the fingerprint kept beside the private key: changing the key takes a change here, in review.
 */
export const EVOKE_KEY_FINGERPRINT = '7809eed2cd769b9e2b4b75a4e1a49945514ac6c610a246a8f5eb0a80af05c42a';
/** Where the key used to be kept, inside the project. Moved out on first use (migrate()). */
const LEGACY_DIR = path.join(DESKTOP, 'keys');

const POWERSHELL = systemExe(path.join('WindowsPowerShell', 'v1.0', 'powershell.exe'));

/**
 * Runs DPAPI through Windows PowerShell. The data goes in by stdin and comes back as raw bytes on
 * the output stream, never as a PowerShell value: PowerShell's logging, which an organisation may
 * switch on, records values passed along its pipeline, and the decrypted key must not be one.
 */
function dpapi(action: 'Protect' | 'Unprotect', data: Buffer): Buffer {
  const script =
    'Add-Type -AssemblyName System.Security; ' +
    '$in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ' +
    '$out = [Security.Cryptography.ProtectedData]::' + action + "($in, $null, 'CurrentUser'); " +
    '$s = [Console]::OpenStandardOutput(); $s.Write($out, 0, $out.Length); $s.Flush(); ' +
    '[Array]::Clear($out, 0, $out.Length); [Array]::Clear($in, 0, $in.Length)';
  return execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: data.toString('base64'),
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

export const publicFingerprint = (pem: string): string =>
  crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })).digest('hex');

// ---------------------------------------------------------------- the optional passphrase layer

const LAYER = Buffer.from('SPW1', 'latin1');

/** The key encrypted with a passphrase: 'SPW1', salt, IV, GCM tag, then AES-256-GCM (scrypt N=2^17). */
function wrap(pem: string, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(pem, 'utf-8'), cipher.final()]);
  return Buffer.concat([LAYER, salt, iv, cipher.getAuthTag(), body]);
}

function unwrap(data: Buffer, passphrase: string): string {
  const key = crypto.scryptSync(passphrase, data.subarray(4, 20), 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(20, 32));
  decipher.setAuthTag(data.subarray(32, 48));
  try {
    return Buffer.concat([decipher.update(data.subarray(48)), decipher.final()]).toString('utf-8');
  } catch {
    throw new Error('That passphrase does not open the signing key.');
  }
}

// ---------------------------------------------------------------- storing and loading

/**
 * Stores a private key (PEM) encrypted for this Windows user, with its public key's fingerprint,
 * and with a passphrase inside when one is given.
 */
export function storePrivateKey(pem: string, passphrase: string | null = null): void {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const inner = passphrase ? wrap(pem, passphrase) : Buffer.from(pem, 'utf-8');
  const sealed = dpapi('Protect', inner);
  // Proves the stored copy opens before anything relies on it.
  if (!dpapi('Unprotect', sealed).equals(inner)) throw new Error('The signing key could not be stored safely.');
  fs.writeFileSync(PRIVATE_FILE, sealed.toString('base64') + '\n');
  const publicPem = crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString();
  fs.writeFileSync(FINGERPRINT_FILE, publicFingerprint(publicPem) + '\n');
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

/** Whether the stored key also needs its passphrase. */
export function needsPassphrase(): boolean {
  if (!hasPrivateKey()) return false;
  return dpapi('Unprotect', Buffer.from(fs.readFileSync(PRIVATE_FILE, 'utf-8').trim(), 'base64')).subarray(0, 4).equals(LAYER);
}

/** The private key, decrypted in memory; asks for the passphrase when one is set. */
export async function loadPrivateKey(): Promise<string> {
  migrate();
  if (!fs.existsSync(PRIVATE_FILE)) {
    throw new Error("Evoke's licence signing key is not on this computer (" + PRIVATE_FILE + '). Licences can only be issued where it is.');
  }
  const inner = dpapi('Unprotect', Buffer.from(fs.readFileSync(PRIVATE_FILE, 'utf-8').trim(), 'base64'));
  if (!inner.subarray(0, 4).equals(LAYER)) return inner.toString('utf-8');
  return unwrap(inner, await secret('Passphrase of the licence signing key: '));
}

/**
 * The public key a build puts into the app, checked against the fingerprint kept with the private
 * key: a licence-public.pem swapped in the repository would let someone else's licences in. A
 * release build is made only where that fingerprint is: on a computer without it, nothing could
 * tell a swapped key from the real one.
 */
export function checkedPublicKey(file = PUBLIC_KEY_FILE): string {
  const pem = fs.readFileSync(file, 'utf-8');
  migrate();
  if (file !== PUBLIC_KEY_FILE) return pem;
  if (!fs.existsSync(FINGERPRINT_FILE)) {
    throw new Error(
      'This computer has no record of the licence key\'s fingerprint (' + FINGERPRINT_FILE + '), so it cannot tell whether ' +
        'desktop/src/licence-public.pem is the real one. Build releases on the computer that holds the signing key.',
    );
  }
  const want = fs.readFileSync(FINGERPRINT_FILE, 'utf-8').trim();
  if (publicFingerprint(pem) !== want || want !== EVOKE_KEY_FINGERPRINT) {
    throw new Error(
      'desktop/src/licence-public.pem is not the public half of the signing key kept in ' + KEY_DIR + '. ' +
        'Someone may have replaced it; the build stops.',
    );
  }
  return pem;
}

// ---------------------------------------------------------------- passphrase and backups

/** Encrypts the key with a passphrase, for a backup kept away from this computer. */
export const backupOf = (pem: string, passphrase: string): Buffer => wrap(pem, passphrase);

/** A key from such a backup. */
export const fromBackup = (data: Buffer, passphrase: string): string => {
  if (!data.subarray(0, 4).equals(LAYER)) throw new Error('That file is not a signing key backup.');
  return unwrap(data, passphrase);
};
