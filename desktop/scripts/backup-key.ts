/**
 * Backs up Evoke's licence signing key, restores it, or puts a passphrase on it.
 *
 *   npm run licence:backup-key -- <file>     writes the key encrypted with a passphrase you choose
 *   npm run licence:restore-key -- <file>    puts a backup back, on this computer, for this user
 *   npm run licence:set-passphrase           also asks for a passphrase whenever a licence is issued
 *
 * The key is kept encrypted for one Windows user on one computer (signing-key.ts), so the backup
 * is the only way to issue licences again after a new computer or a new Windows profile. Keep it,
 * and its passphrase, somewhere safe and offline, and apart from each other. Without both, no new
 * licence will ever work with the copies already given out.
 *
 * Backups are encrypted with AES-256-GCM under a key derived from the passphrase with scrypt
 * (N=2^17), which makes guessing a passphrase slow. A backup's name must end in .backup (which git
 * ignores), it is never written inside a git repository (where a sync script could take it along,
 * however the path is spelled), and it never replaces a file already there unless --force says so.
 * A restored key keeps the backup's passphrase, and must be Evoke's own key.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVOKE_KEY_FINGERPRINT, backupOf, fromBackup, hasPrivateKey, loadPrivateKey, publicFingerprint, storePrivateKey } from './signing-key';
import { secret } from './prompt';
import * as crypto from 'node:crypto';

/** The git repository a path is inside, if any: its real path is checked, however it was spelled. */
function repositoryOf(target: string): string | null {
  let dir: string;
  try {
    dir = fs.realpathSync.native(path.dirname(target));
  } catch {
    throw new Error('The folder ' + path.dirname(target) + ' does not exist.');
  }
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

async function newPassphrase(what: string): Promise<string> {
  const pass = await secret('New passphrase for ' + what + ' (at least 14 characters): ');
  if (pass.length < 14 || new Set(pass).size < 8) {
    throw new Error('Use a passphrase of at least 14 characters, with at least 8 different ones: several unrelated words work well.');
  }
  if ((await secret('The same passphrase again: ')) !== pass) throw new Error('The two passphrases differ. Nothing was written.');
  return pass;
}

async function main(): Promise<void> {
  const [mode, file] = [process.argv[2], process.argv[3]];
  if (mode === 'passphrase') {
    const pem = await loadPrivateKey();
    storePrivateKey(pem, await newPassphrase('the signing key'));
    console.log('The signing key now also needs its passphrase. Make a new backup too: npm run licence:backup-key -- <file>');
    return;
  }
  if ((mode !== 'backup' && mode !== 'restore') || !file) {
    console.error('Usage: npm run licence:backup-key -- <file>   or   npm run licence:restore-key -- <file>');
    process.exit(1);
  }
  const target = path.resolve(file);
  if (mode === 'backup') {
    if (!/\.backup$/i.test(target)) throw new Error('Name the backup file so it ends in .backup, for example E:\\evoke-signing-key.backup.');
    const repo = repositoryOf(target);
    if (repo) throw new Error('That folder is inside a git repository (' + repo + '). Write the backup somewhere no sync can take it, such as a USB drive.');
    if (fs.existsSync(target) && !process.argv.includes('--force')) throw new Error(target + ' already exists. Choose another name, or add --force to replace it.');
    const pem = await loadPrivateKey();
    fs.writeFileSync(target, backupOf(pem, await newPassphrase('the backup')), { flag: process.argv.includes('--force') ? 'w' : 'wx' });
    console.log('Backup written: ' + target + '. Keep it, and its passphrase, safe and offline, apart from each other.');
  } else {
    if (hasPrivateKey()) throw new Error('This computer already has a signing key. Move it away first if you really mean to replace it.');
    const passphrase = await secret('Passphrase of the backup: ');
    const pem = fromBackup(fs.readFileSync(target), passphrase);
    const got = publicFingerprint(crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString());
    if (got !== EVOKE_KEY_FINGERPRINT) throw new Error('That backup holds a different key from the one the app trusts. Nothing was restored.');
    // The restored key keeps the backup's passphrase: it is asked for whenever a licence is issued.
    storePrivateKey(pem, passphrase);
    console.log('The signing key is restored for this Windows user. It asks for the backup\'s passphrase whenever a licence is issued.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
