/**
 * Makes Evoke's licence signing key pair, once:
 *
 *   desktop/keys/licence-private.pem   signs licences. SECRET: never commit it, never ship it, and
 *                                      keep a backup somewhere safe. Anyone who has it can issue
 *                                      licences; losing it means no new licence works with the
 *                                      copies already given out.
 *   desktop/src/licence-public.pem     checks licences. Built into every copy of the app.
 *
 *   npm run licence:keygen             (refuses to replace a key that exists)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DESKTOP = path.resolve(__dirname, '..');
const PRIVATE = path.join(DESKTOP, 'keys', 'licence-private.pem');
const PUBLIC = path.join(DESKTOP, 'src', 'licence-public.pem');

if (fs.existsSync(PRIVATE)) {
  console.error('A signing key already exists at ' + PRIVATE + '. Replacing it would stop every licence already issued');
  console.error('from working with new builds. Move it away first if that is really what you want.');
  process.exit(1);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(PRIVATE), { recursive: true });
fs.writeFileSync(PRIVATE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(PUBLIC, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Private key: ' + PRIVATE + '  (keep it secret, back it up)');
console.log('Public key:  ' + PUBLIC + '  (commit it; it is built into the app)');
