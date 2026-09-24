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
 * (N=2^17), which makes guessing a passphrase slow. They are refused inside the project folder,
 * where a sync script could take them along.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DESKTOP, backupOf, fromBackup, hasPrivateKey, loadPrivateKey, storePrivateKey } from './signing-key';
import { secret } from './prompt';

const PROJECT = path.resolve(DESKTOP, '..');

async function newPassphrase(what: string): Promise<string> {
  const pass = await secret('New passphrase for ' + what + ' (at least 14 characters): ');
  if (pass.length < 14) throw new Error('Use a passphrase of at least 14 characters: several unrelated words work well.');
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
    if (target.toLowerCase().startsWith(PROJECT.toLowerCase() + path.sep)) {
      throw new Error('Write the backup outside the project folder (for example to a USB drive), where no sync script can take it.');
    }
    const pem = await loadPrivateKey();
    fs.writeFileSync(target, backupOf(pem, await newPassphrase('the backup')));
    console.log('Backup written: ' + target + '. Keep it, and its passphrase, safe and offline, apart from each other.');
  } else {
    if (hasPrivateKey()) throw new Error('This computer already has a signing key. Move it away first if you really mean to replace it.');
    const pem = fromBackup(fs.readFileSync(target), await secret('Passphrase of the backup: '));
    storePrivateKey(pem);
    console.log('The signing key is restored for this Windows user.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
