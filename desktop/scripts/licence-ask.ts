/**
 * The licence jobs, asked question by question: what issue-licence.bat and revoke-licence.bat run.
 *
 *   licence-ask.ts issue     a new licence, or a reissue of one already issued (a new end date, a
 *                            different computer), keeping its ID so the app it opens still opens
 *   licence-ask.ts revoke    withdraws a licence file: builds made from now on refuse it
 *
 * The same jobs without questions: npm run licence:issue and npm run licence:revoke (README).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fingerprint, type LicenceFile } from '../src/licence';
import { LICENCES_DIR, issueLicence, problemWith, type IssueOptions } from './issue-licence';
import { readRevoked, revoke } from './revoke-licence';
import { PRIVATE_FILE, hasPrivateKey } from './signing-key';
import { INTERNAL_CODE, variantByLicenceId } from './variants';

/** A path typed, pasted, or dragged into the window (which adds quotes). */
const cleanPath = (p: string): string => p.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

type Asker = {
  q: (text: string, check?: (v: string) => string | null) => Promise<string>;
  yes: (text: string, byDefault: boolean) => Promise<boolean>;
  close: () => void;
};

function asker(): Asker {
  // Every line is queued, so answers typed (or pasted) ahead of their question are kept.
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const question = async (text: string): Promise<string> => {
    process.stdout.write(text);
    const next = await lines.next();
    if (next.done) throw new Error('The input ended before every question was answered. Nothing was changed.');
    return next.value;
  };
  const q = async (text: string, check?: (v: string) => string | null): Promise<string> => {
    for (;;) {
      const v = (await question(text)).trim();
      const problem = check?.(v) ?? null;
      if (!problem) return v;
      console.log('  ' + problem);
    }
  };
  const yes = async (text: string, byDefault: boolean): Promise<boolean> => {
    const a = (await q(text + (byDefault ? ' [Y/n] ' : ' [y/N] '), (v) => (/^(y|yes|n|no|)$/i.test(v) ? null : 'Answer y or n.'))).toLowerCase();
    return a === '' ? byDefault : a.startsWith('y');
  };
  return { q, yes, close: () => rl.close() };
}

type Held = { file: string; licence: LicenceFile['licence']; revoked: boolean; app: string };

/** The licence files in desktop/licences/, with whether each is revoked and which app it opens. */
function held(): Held[] {
  if (!fs.existsSync(LICENCES_DIR)) return [];
  const revoked = new Set(readRevoked().revoked.map((r) => r.fingerprint));
  return fs
    .readdirSync(LICENCES_DIR)
    .filter((f) => f.endsWith('.lic'))
    .sort()
    .map((f) => {
      const file = path.join(LICENCES_DIR, f);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as LicenceFile;
      const variant = variantByLicenceId(parsed.licence.id);
      return {
        file,
        licence: parsed.licence,
        revoked: revoked.has(fingerprint(parsed)),
        app: variant ? '"' + variant.name + '"' : '"Evoke Training Studio" (internal)',
      };
    });
}

function list(items: Held[]): void {
  items.forEach((h, i) => {
    const l = h.licence;
    console.log(
      '  ' + String(i + 1).padStart(2) + '. ' + l.id + '  ' + l.licensee +
        '  | ' + (l.expires ? 'until ' + l.expires : 'no end date') + ', ' + (l.machine ? 'computer ' + l.machine : 'any computer') +
        (l.logo ? ', logo' : '') + (h.revoked ? '  | REVOKED' : '') + '\n      opens ' + h.app,
    );
  });
}

async function pick(a: Asker, items: Held[], what: string): Promise<Held> {
  list(items);
  console.log('');
  const n = await a.q('  ' + what + ' (1-' + items.length + '): ', (v) => {
    const i = Number(v);
    return Number.isInteger(i) && i >= 1 && i <= items.length ? null : 'Type a number from the list.';
  });
  return items[Number(n) - 1];
}

/** What to rebuild so a change reaches the app the licence opens. */
function rebuildHint(id: string): string {
  const v = variantByLicenceId(id);
  const code = v ? v.code : INTERNAL_CODE;
  return 'build-app.bat, choosing ' + code + ' (or: npm run build-variant -- ' + code + ')';
}

async function issue(): Promise<void> {
  if (!hasPrivateKey()) {
    throw new Error("Evoke's licence signing key is not on this computer (" + PRIVATE_FILE + '). Licences can only be issued where it is.');
  }
  const a = asker();
  console.log('');
  console.log('  Issue a licence');
  console.log('');
  console.log('  1. A new licence, for a person or team at Evoke. It opens "Evoke Training Studio", the');
  console.log('     internal app. (A new customer gets their own app and licence from new-customer.bat.)');
  console.log('  2. Reissue a licence already issued: a new end date, or a different computer. It keeps');
  console.log('     its ID, so the app it opens still opens with it, and the earlier file is revoked.');
  console.log('');
  const mode = await a.q('  Choose 1 or 2: ', (v) => (v === '1' || v === '2' ? null : 'Type 1 or 2.'));
  console.log('  Press Enter to skip anything marked (optional).');
  console.log('');

  let options: IssueOptions;
  let previous: Held | null = null;
  if (mode === '1') {
    const licensee = await a.q('  Who it is for, as it should appear (e.g. Evoke QA Team): ', (v) => (v ? null : 'It needs a name.'));
    const email = await a.q('  Contact email (optional): ', (v) => (v ? problemWith({ licensee, email: v }) : null));
    const expires = await a.q('  Last day of the licence, YYYY-MM-DD (optional, Enter = never expires): ', (v) =>
      v ? problemWith({ licensee, expires: v }) : null,
    );
    const machine = await a.q('  Only on one computer? Its machine code, from the app\'s licence screen (optional): ', (v) =>
      v ? problemWith({ licensee, machine: v }) : null,
    );
    const logo = cleanPath(
      await a.q('  A logo for the app\'s header, PNG or JPEG (optional; drag the file into this window): ', (v) =>
        v ? problemWith({ licensee, logoFile: cleanPath(v) }) : null,
      ),
    );
    options = { licensee, email: email || null, expires: expires || null, machine: machine || null, logoFile: logo || null };
  } else {
    const items = held().filter((h) => !h.revoked);
    if (items.length === 0) throw new Error('There are no licences in ' + LICENCES_DIR + ' to reissue.');
    previous = await pick(a, items, 'Which licence');
    const l = previous.licence;
    console.log('');
    console.log('  Reissuing ' + l.id + ' for ' + l.licensee + '. Enter keeps what it has now.');
    const expires = await a.q('  Last day, YYYY-MM-DD (now: ' + (l.expires ?? 'never') + '; "-" = never expires): ', (v) =>
      v && v !== '-' ? problemWith({ licensee: l.licensee, expires: v }) : null,
    );
    const machine = await a.q('  Machine code (now: ' + (l.machine ?? 'any computer') + '; "-" = any computer): ', (v) =>
      v && v !== '-' ? problemWith({ licensee: l.licensee, machine: v }) : null,
    );
    const logo = cleanPath(
      await a.q('  Logo file (now: ' + (l.logo ? 'has one' : 'none') + '; "-" = no logo): ', (v) =>
        v && v !== '-' ? problemWith({ licensee: l.licensee, logoFile: cleanPath(v) }) : null,
      ),
    );
    console.log('');
    console.log('  If the licence file got out (someone who should not have it has it), give it a new seal:');
    console.log('  the old file then cannot open any build made from now on, and the app it opens must be');
    console.log('  rebuilt and sent again.');
    const newSeal = await a.yes('  Did it leak? Give it a new seal?', false);
    options = {
      id: l.id,
      licensee: l.licensee,
      expires: expires === '-' ? null : expires || l.expires,
      machine: machine === '-' ? null : machine || l.machine,
      logoFile: logo && logo !== '-' ? logo : null,
      logoData: logo === '-' || logo ? null : (l.logo ?? null),
      newSeal,
    };
  }

  console.log('');
  console.log('  ' + (previous ? 'Reissue ' + previous.licence.id : 'New licence'));
  console.log('  For:       ' + options.licensee);
  console.log('  Expires:   ' + (options.expires || 'never'));
  console.log('  Computer:  ' + (options.machine || 'any'));
  console.log('  Logo:      ' + (options.logoFile ? options.logoFile : options.logoData ? 'kept' : 'none'));
  if (previous) console.log('  New seal:  ' + (options.newSeal ? 'yes' : 'no'));
  const go = await a.yes('\n  Issue it?', true);
  a.close();
  if (!go) {
    console.log('Nothing was issued.');
    return;
  }
  const problem = problemWith(options);
  if (problem) throw new Error(problem);
  const { licence, file, warnings } = await issueLicence(options);
  console.log('\n> Issued ' + licence.id + ' to ' + licence.licensee + (licence.expires ? ', until ' + licence.expires : '') +
    (licence.machine ? ', for computer ' + licence.machine : ''));
  console.log('  ' + file);
  for (const w of warnings) console.log('\n  WARNING: ' + w);
  console.log('');
  if (previous) {
    console.log('  The earlier file is revoked. Commit desktop/revoked.json, then rebuild the app it opens so it refuses');
    console.log('  the earlier file: ' + rebuildHint(licence.id) + '. Send the new licence' + (options.newSeal ? ' and the new build.' : '.'));
  } else {
    console.log('  Send the licence file to ' + licence.licensee + '. In the app, they choose "Choose licence file..." and pick it.');
  }
}

async function withdraw(): Promise<void> {
  const items = held().filter((h) => !h.revoked);
  if (items.length === 0) throw new Error('There are no licences in ' + LICENCES_DIR + ' that are not revoked already.');
  const a = asker();
  console.log('');
  console.log('  Revoke a licence');
  console.log('');
  console.log('  Builds made from now on refuse the licence file. A copy of the app already installed');
  console.log('  keeps accepting it until that app is rebuilt and installed again (or the licence\'s end');
  console.log('  date passes). To change a licence instead (a new end date or computer), use');
  console.log('  issue-licence.bat and reissue it.');
  console.log('');
  const chosen = await pick(a, items, 'Which licence to revoke');
  const go = await a.yes('\n  Revoke ' + chosen.licence.id + ' (' + chosen.licence.licensee + ')?', false);
  if (!go) {
    a.close();
    console.log('Nothing was revoked.');
    return;
  }
  console.log('');
  console.log('  The reason goes into desktop/revoked.json, which is committed: a few plain words, never a name.');
  let done = false;
  for (;;) {
    const reason = (await a.q('  Reason (Enter = withdrawn): ')) || 'withdrawn';
    try {
      done = revoke(chosen.file, reason);
      break;
    } catch (e) {
      // A reason with a name in it, or not plain words: nothing was written. Ask again.
      console.log('  ' + (e as Error).message);
    }
  }
  a.close();
  console.log(done ? '\n> Revoked ' + chosen.licence.id + '.' : '\n> That licence file was already revoked.');
  console.log('');
  console.log('  Next: commit desktop/revoked.json, then rebuild the app it opens and have it installed again:');
  console.log('  ' + rebuildHint(chosen.licence.id) + '.');
}

const job = process.argv[2];
(job === 'issue' ? issue() : job === 'revoke' ? withdraw() : Promise.reject(new Error('Usage: licence-ask.ts issue | revoke'))).catch(
  (e: unknown) => {
    console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  },
);
