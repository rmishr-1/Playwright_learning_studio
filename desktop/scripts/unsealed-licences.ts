/**
 * Lists the licences in desktop/licences/ that cannot open the course as it is now published: those
 * with no seal (issued before seals existed), and those whose seal is not the one recorded beside
 * the signing key. Each needs reissuing with a new seal before its holder can use the studio:
 *
 *   npm run licence:unsealed
 *   npm run licence:issue -- --id <id> --licensee "<name>" --new-seal     for each one listed
 */
import * as fs from 'node:fs';
import { checkedPublicKey, SEALS_FILE } from './signing-key';
import { readRevoked } from './revoke-licence';
import { eligibleLicences, LICENCES_DIR } from './publish';

const { eligible, skipped } = eligibleLicences({
  privateKeyPem: '',
  publicKeyPem: checkedPublicKey(),
  licencesDir: LICENCES_DIR,
  seals: fs.existsSync(SEALS_FILE) ? (JSON.parse(fs.readFileSync(SEALS_FILE, 'utf-8')) as Record<string, { licensee: string; seal: string }>) : {},
  revoked: readRevoked().revoked.map((r) => r.fingerprint),
  today: new Date().toISOString().slice(0, 10),
});
const needSeal = skipped.filter((s) => /seal/.test(s.reason));
console.log(eligible.length + ' licence(s) open the course: ' + (eligible.map((e) => e.id + ' ' + e.licensee).join(', ') || 'none'));
if (needSeal.length) {
  console.log('\nThese need reissuing with a new seal (npm run licence:issue -- --id <id> --licensee "<name>" --new-seal):');
  for (const s of needSeal) console.log('  ' + s.file + ': ' + s.reason);
}
const others = skipped.filter((s) => !needSeal.includes(s));
if (others.length) {
  console.log('\nThese get no access for another reason:');
  for (const s of others) console.log('  ' + s.file + ': ' + s.reason);
}
