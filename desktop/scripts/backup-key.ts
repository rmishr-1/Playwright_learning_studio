/**
 * Backs up Evoke's licence signing key, or restores it from a backup.
 *
 *   npm run licence:backup-key -- <file>     writes the key encrypted with a passphrase you choose
 *   npm run licence:restore-key -- <file>    puts a backup back, on this computer, for this user
 *
 * The key is kept encrypted for one Windows user on one computer (signing-key.ts), so this backup
 * is the only way to issue licences again after a new computer or a new Windows profile. Keep it,
 * and the passphrase, somewhere safe and offline, and apart from each other. Without both, no new
 * licence will ever work with the copies already given out.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasPrivateKey, loadPrivateKey, storePrivateKey } from './signing-key';

/** Reads a line without showing it. */
function secret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = '';
    const raw = stdin.isTTY;
    if (raw) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          if (raw) stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u0008' || ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const [mode, file] = [process.argv[2], process.argv[3]];
  if ((mode !== 'backup' && mode !== 'restore') || !file) {
    console.error('Usage: npm run licence:backup-key -- <file>   or   npm run licence:restore-key -- <file>');
    process.exit(1);
  }
  const target = path.resolve(file);
  if (mode === 'backup') {
    const pem = loadPrivateKey();
    const pass = await secret('Passphrase for the backup (at least 12 characters): ');
    if (pass.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    if ((await secret('The same passphrase again: ')) !== pass) throw new Error('The two passphrases differ. Nothing was written.');
    const encrypted = crypto.createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pass });
    fs.writeFileSync(target, encrypted);
    console.log('Backup written: ' + target + '. Keep it, and the passphrase, safe and offline, apart from each other.');
  } else {
    if (hasPrivateKey()) throw new Error('This computer already has a signing key. Move it away first if you really mean to replace it.');
    const pass = await secret('Passphrase of the backup: ');
    const key = crypto.createPrivateKey({ key: fs.readFileSync(target, 'utf-8'), format: 'pem', passphrase: pass });
    storePrivateKey(key.export({ type: 'pkcs8', format: 'pem' }).toString());
    console.log('The signing key is restored for this Windows user.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
