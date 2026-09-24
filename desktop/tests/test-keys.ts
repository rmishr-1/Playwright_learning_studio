/**
 * The tests' own licence key pair, made fresh for each run in desktop/test-output/keys/: the tests
 * build the app with its public key and sign their licences with its private key. Evoke's real
 * signing key is never needed, or touched, by a test.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.resolve(__dirname, '..', 'test-output', 'keys');

export type TestKeys = { privateKey: string; publicKey: string; publicKeyFile: string };

export function testKeys(): TestKeys {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const pair = crypto.generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeyFile = path.join(DIR, 'test-public.pem');
  fs.writeFileSync(publicKeyFile, publicKey);
  return { privateKey, publicKey, publicKeyFile };
}
