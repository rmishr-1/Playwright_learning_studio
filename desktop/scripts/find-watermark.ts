/**
 * Finds the licence a copied piece of the course came from.
 *
 *   npm run watermark:find -- <file>     a file with the copied text (saved from a web page, a
 *                                        document, an email...)
 *
 * Prints each licence ID it finds, with how often; look the ID up in issued.csv, kept beside the
 * signing key in %USERPROFILE%\.evoke-studio\.
 * Text that went through something that drops invisible characters (a screenshot, retyping)
 * carries no mark.
 */
import * as fs from 'node:fs';
import { decodeAll } from '../src/watermark';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run watermark:find -- <file>');
  process.exit(1);
}
const counts = new Map<string, number>();
for (const id of decodeAll(fs.readFileSync(file, 'utf-8'))) counts.set(id, (counts.get(id) ?? 0) + 1);
if (counts.size === 0) {
  console.log('No watermark found.');
} else {
  for (const [id, n] of counts) console.log(id + '  (' + n + ' mark' + (n === 1 ? '' : 's') + ')');
}
