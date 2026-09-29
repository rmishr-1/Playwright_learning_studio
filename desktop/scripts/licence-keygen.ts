/**
 * Makes Evoke's licence signing key pair, once:
 *
 *   %USERPROFILE%\.evoke-studio\licence-private.dpapi   signs licences, encrypted for this Windows
 *                                                        user (see signing-key.ts). Back it up at
 *                                                        once: npm run licence:backup-key
 *   desktop/src/licence-public.pem                       checks licences. Built into every copy of
 *                                                        the app, and committed.
 *
 *   npm run licence:keygen             (refuses to replace a key that exists)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { PRIVATE_FILE, PUBLIC_KEY_FILE, hasPrivateKey, storePrivateKey } from './signing-key';

if (hasPrivateKey()) {
  console.error('A signing key already exists at ' + PRIVATE_FILE + '. Replacing it would stop every licence already issued');
  console.error('from working with new builds. Move it away first if that is really what you want.');
  process.exit(1);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
storePrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
fs.writeFileSync(PUBLIC_KEY_FILE, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Private key: ' + PRIVATE_FILE + '  (encrypted for this Windows user)');
console.log('Public key:  ' + PUBLIC_KEY_FILE + '  (commit it; it is built into the app)');
console.log('Now make a backup: npm run licence:backup-key');
