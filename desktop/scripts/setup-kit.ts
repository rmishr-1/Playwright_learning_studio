/**
 * A setup kit: one .exe that makes another computer able to build the apps and issue licences, as
 * this one can - Evoke's signing key, the record of issued licences (issued.csv, seals.json) and
 * every licence file in desktop/licences/, none of which git carries.
 *
 *   make-setup-kit.bat, or npm run setup-kit -- make [<file.exe>] [--force]
 *        on the computer that holds the key: asks for a passphrase of your choosing and writes
 *        Evoke-Studio-Setup-Kit.exe (on your desktop by default; never inside a git repository)
 *   the .exe, run on the other computer
 *        asks for the studio's folder (a clone that has run setup.bat and has this script) and the
 *        passphrase, then runs `setup-kit.ts apply` from that folder
 *
 * Everything in the kit is encrypted with the passphrase (AES-256-GCM under scrypt, as a key
 * backup is), so the .exe alone is of no use to anyone who finds it: send the passphrase another
 * way. The restored key keeps that passphrase, asked for whenever a licence is issued there, as a
 * restored backup does. Nothing already on the other computer is overwritten: a key already there
 * is left alone, licence records are merged, and a licence file that differs from one already
 * there is set down beside it.
 *
 * The .exe is made with IExpress, which comes with Windows: it unpacks the encrypted kit and a
 * small apply.cmd into a temporary folder, runs it, and removes the folder.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { systemExe } from '../../backend/src/system-exe';
import { newPassphrase, repositoryOf } from './backup-key';
import { secret } from './prompt';
import {
  DESKTOP,
  EVOKE_KEY_FINGERPRINT,
  ISSUED_CSV,
  KEY_DIR,
  SEALS_FILE,
  backupOf,
  fromBackup,
  hasPrivateKey,
  loadPrivateKey,
  publicFingerprint,
  storePrivateKey,
} from './signing-key';

export const LICENCES_DIR = path.join(DESKTOP, 'licences');
const SCHEMA = 'setup-kit/v1';
/** A licence file's name: the ones issue-licence.ts writes, and the revoked copies it keeps. */
const LICENCE_NAME = /^EVK-[0-9A-F]{8}-[a-z0-9-]+\.(lic|revoked-\d+\.lic\.old)$/;

export type Kit = {
  schema: typeof SCHEMA;
  made: string;
  key: string;
  seals: string | null;
  issued: string | null;
  licences: { name: string; data: string }[];
};

const fingerprintOf = (pem: string): string =>
  publicFingerprint(crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString());

// ---------------------------------------------------------------- the kit's contents

export function collect(pem: string): Kit {
  if (fingerprintOf(pem) !== EVOKE_KEY_FINGERPRINT) throw new Error('The signing key here is not the one the app trusts. No kit was made.');
  const licences = fs.existsSync(LICENCES_DIR)
    ? fs
        .readdirSync(LICENCES_DIR)
        .filter((n) => LICENCE_NAME.test(n))
        .sort()
        .map((name) => ({ name, data: fs.readFileSync(path.join(LICENCES_DIR, name)).toString('base64') }))
    : [];
  const text = (f: string): string | null => (fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null);
  return { schema: SCHEMA, made: new Date().toISOString(), key: pem, seals: text(SEALS_FILE), issued: text(ISSUED_CSV), licences };
}

export const seal = (kit: Kit, passphrase: string): Buffer => backupOf(JSON.stringify(kit), passphrase);

export function open(data: Buffer, passphrase: string): Kit {
  let text: string;
  try {
    text = fromBackup(data, passphrase);
  } catch {
    throw new Error('That passphrase does not open this kit (or the kit is damaged). Nothing was changed.');
  }
  const kit = JSON.parse(text) as Kit;
  if (kit.schema !== SCHEMA || typeof kit.key !== 'string' || !Array.isArray(kit.licences)) throw new Error('This is not a setup kit this studio can read.');
  if (fingerprintOf(kit.key) !== EVOKE_KEY_FINGERPRINT) throw new Error('This kit holds a different key from the one the app trusts. Nothing was changed.');
  return kit;
}

// ---------------------------------------------------------------- setting it down

/** Seals: those here stay; the kit's are added where this computer has none for that licence ID. */
export function mergeSeals(here: string | null, kit: string | null): { text: string | null; added: number; clashes: string[] } {
  if (!kit) return { text: here, added: 0, clashes: [] };
  if (!here) return { text: kit, added: Object.keys(JSON.parse(kit) as object).length, clashes: [] };
  const mine = JSON.parse(here) as Record<string, { licensee: string; seal: string }>;
  const theirs = JSON.parse(kit) as Record<string, { licensee: string; seal: string }>;
  let added = 0;
  const clashes: string[] = [];
  for (const [id, entry] of Object.entries(theirs)) {
    if (!mine[id]) {
      mine[id] = entry;
      added++;
    } else if (mine[id].seal !== entry.seal) clashes.push(id);
  }
  return { text: JSON.stringify(mine, null, 2) + '\n', added, clashes };
}

/** The record of issued licences: every line of the kit's that this computer's does not have. */
export function mergeIssued(here: string | null, kit: string | null): { text: string | null; added: number } {
  if (!kit) return { text: here, added: 0 };
  if (!here) return { text: kit, added: Math.max(0, kit.split(/\r?\n/).filter(Boolean).length - 1) };
  const lines = here.split(/\r?\n/).filter(Boolean);
  const have = new Set(lines);
  const [, ...rows] = kit.split(/\r?\n/).filter(Boolean);
  const fresh = rows.filter((r) => !have.has(r));
  return { text: [...lines, ...fresh].join('\n') + '\n', added: fresh.length };
}

/** Licence files: new ones are added; one that differs from a file already here is set down beside it. */
export function placeLicences(dir: string, licences: Kit['licences']): { added: string[]; same: string[]; beside: string[] } {
  fs.mkdirSync(dir, { recursive: true });
  const out = { added: [] as string[], same: [] as string[], beside: [] as string[] };
  for (const { name, data } of licences) {
    if (!LICENCE_NAME.test(name)) throw new Error('The kit names a licence file oddly (' + name + '). Nothing more was changed.');
    const bytes = Buffer.from(data, 'base64');
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      out.added.push(name);
    } else if (fs.readFileSync(target).equals(bytes)) out.same.push(name);
    else {
      fs.writeFileSync(target + '.from-kit', bytes);
      out.beside.push(name);
    }
  }
  return out;
}

async function apply(file: string): Promise<void> {
  console.log('');
  console.log('  Setting up this computer to build the apps and issue licences');
  console.log('  Studio folder: ' + path.dirname(DESKTOP));
  console.log('');
  const passphrase = await secret('  Passphrase of the setup kit: ');
  const kit = open(fs.readFileSync(file), passphrase);
  console.log('  The kit opens: made ' + kit.made.slice(0, 10) + ', ' + kit.licences.length + ' licence files.');

  // The key: left alone when this computer already has one.
  if (hasPrivateKey()) {
    console.log('\n> Signing key: this computer already has one, so it is left as it is.');
  } else {
    storePrivateKey(kit.key, passphrase);
    console.log('\n> Signing key: restored for this Windows user, in ' + KEY_DIR + '.');
    console.log('  It asks for the kit\'s passphrase whenever a licence is issued here.');
  }

  const seals = mergeSeals(fs.existsSync(SEALS_FILE) ? fs.readFileSync(SEALS_FILE, 'utf-8') : null, kit.seals);
  if (seals.text !== null) fs.writeFileSync(SEALS_FILE, seals.text);
  console.log('> Licence seals: ' + seals.added + ' added' + (seals.clashes.length ? '; ' + seals.clashes.join(', ') + ' differ here and were left as they are' : '') + '.');

  const issued = mergeIssued(fs.existsSync(ISSUED_CSV) ? fs.readFileSync(ISSUED_CSV, 'utf-8') : null, kit.issued);
  if (issued.text !== null) fs.writeFileSync(ISSUED_CSV, issued.text);
  console.log('> Record of issued licences: ' + issued.added + ' added.');

  const placed = placeLicences(LICENCES_DIR, kit.licences);
  console.log('> Licence files in ' + LICENCES_DIR + ': ' + placed.added.length + ' added, ' + placed.same.length + ' already here.');
  for (const n of placed.beside) console.log('  ' + n + ' differs from the one already here: the kit\'s is beside it, as ' + n + '.from-kit.');

  console.log('\n' + '='.repeat(70));
  console.log('  DONE. This computer can now build the apps (build-app.bat) and issue licences');
  console.log('  (issue-licence.bat, new-customer.bat).');
  console.log('='.repeat(70));
  console.log('  A licence locked to one computer opens the app only there. To open the internal app on');
  console.log('  this computer, issue it a licence of its own: issue-licence.bat, with this computer\'s');
  console.log('  machine code from the app\'s licence screen.');
  console.log('  Licences issued here are recorded here only. Issue them on one computer, or bring the');
  console.log('  records together with a new kit.');
}

// ---------------------------------------------------------------- the .exe

/** What the .exe runs: it asks for the studio's folder, then runs `apply` from it. */
const APPLY_CMD = [
  '@echo off',
  'setlocal',
  'set "NoDefaultCurrentDirectoryInExePath=1"',
  'set "SYS=%SystemRoot%\\System32"',
  'title Evoke Training Studio - set up this computer',
  'echo ==========================================================',
  'echo  Evoke Training Studio - set up this computer',
  'echo ==========================================================',
  'echo.',
  'echo Choose the studio folder - your clone of Playwright_learning_studio - in the window that opens.',
  'set "REPO="',
  'for /f "usebackq delims=" %%f in (`%SYS%\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = \'Choose the studio folder: your clone of Playwright_learning_studio\'; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq \'OK\') { $d.SelectedPath }"`) do set "REPO=%%f"',
  'if not defined REPO goto :none',
  'if not exist "%REPO%\\desktop\\scripts\\setup-kit.ts" goto :not_studio',
  'if not exist "%REPO%\\node_modules\\tsx\\dist\\cli.mjs" goto :not_installed',
  '%SYS%\\where.exe node >nul 2>&1',
  'if errorlevel 1 goto :no_node',
  'rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.',
  'call node "%REPO%\\node_modules\\tsx\\dist\\cli.mjs" "%REPO%\\desktop\\scripts\\setup-kit.ts" apply "%~dp0kit.bin"',
  'goto :end',
  ':none',
  'echo Nothing was chosen, so nothing was set up.',
  'goto :end',
  ':not_studio',
  'echo [STOP] That is not the studio folder, or its copy is older than this kit: pull the latest there first.',
  'goto :end',
  ':not_installed',
  'echo [STOP] The studio is not installed in that folder yet. Run setup.bat there first, then run this again.',
  'goto :end',
  ':no_node',
  'echo [STOP] Node.js is not on PATH. Run setup.bat in the studio folder first.',
  ':end',
  'echo.',
  'pause',
  '',
].join('\r\n');

function iexpressSed(dir: string, target: string): string {
  return [
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '[Options]',
    'PackagePurpose=InstallApp',
    'ShowInstallProgramWindow=0',
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    'InstallPrompt=%InstallPrompt%',
    'DisplayLicense=%DisplayLicense%',
    'FinishMessage=%FinishMessage%',
    'TargetName=%TargetName%',
    'FriendlyName=%FriendlyName%',
    'AppLaunched=%AppLaunched%',
    'PostInstallCmd=%PostInstallCmd%',
    'AdminQuietInstCmd=%AdminQuietInstCmd%',
    'UserQuietInstCmd=%UserQuietInstCmd%',
    'SourceFiles=SourceFiles',
    '[Strings]',
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=',
    'TargetName=' + target,
    'FriendlyName=Evoke Training Studio - set up this computer',
    'AppLaunched=cmd /c apply.cmd',
    'PostInstallCmd=<None>',
    'AdminQuietInstCmd=',
    'UserQuietInstCmd=',
    'FILE0="kit.bin"',
    'FILE1="apply.cmd"',
    '[SourceFiles]',
    'SourceFiles0=' + dir + '\\',
    '[SourceFiles0]',
    '%FILE0%=',
    '%FILE1%=',
    '',
  ].join('\r\n');
}

/** Wraps an encrypted kit in the .exe. */
export function writeExe(sealed: Buffer, target: string): void {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-kit-'));
  try {
    fs.writeFileSync(path.join(work, 'kit.bin'), sealed);
    fs.writeFileSync(path.join(work, 'apply.cmd'), APPLY_CMD);
    const sed = path.join(work, 'kit.sed');
    const built = path.join(work, 'kit.exe');
    fs.writeFileSync(sed, iexpressSed(work, built));
    execFileSync(systemExe('iexpress.exe'), ['/N', '/Q', sed], { stdio: 'ignore', windowsHide: true });
    if (!fs.existsSync(built)) throw new Error('IExpress made no .exe.');
    fs.copyFileSync(built, target);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function make(argv: string[]): Promise<void> {
  const named = argv.find((a) => !a.startsWith('--'));
  const target = path.resolve(named ?? path.join(os.homedir(), 'Desktop', 'Evoke-Studio-Setup-Kit.exe'));
  if (!/\.exe$/i.test(target)) throw new Error('Name the kit so it ends in .exe.');
  const repo = repositoryOf(target);
  if (repo) throw new Error('That folder is inside a git repository (' + repo + '). Write the kit somewhere no sync can take it.');
  if (fs.existsSync(target) && !argv.includes('--force')) throw new Error(target + ' already exists. Choose another name, or add --force to replace it.');
  if (!hasPrivateKey()) throw new Error("Evoke's licence signing key is not on this computer, so a kit cannot be made here.");

  console.log('');
  console.log('  Setup kit: the signing key, the licence records and every licence file, encrypted with a');
  console.log('  passphrase you choose now. Send the passphrase to the other computer another way.');
  console.log('');
  const kit = collect(await loadPrivateKey());
  const passphrase = await newPassphrase('the setup kit');
  writeExe(seal(kit, passphrase), target);
  console.log('\n> Kit written: ' + target);
  console.log('  ' + kit.licences.length + ' licence files, the signing key, ' + (kit.seals ? 'the seals' : 'no seals') + ' and ' +
    (kit.issued ? 'the record of issued licences' : 'no record of issued licences') + '.');
  console.log('\n  On the other computer: pull the latest studio there and run setup.bat, then run the kit and');
  console.log('  choose the studio folder. Windows may warn that the kit is not signed: choose "More info",');
  console.log('  then "Run anyway". Keep the kit and its passphrase apart, and delete the kit once it is used.');
}

if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2);
  (mode === 'make' ? make(rest) : mode === 'apply' && rest[0] ? apply(path.resolve(rest[0])) : Promise.reject(new Error('Usage: setup-kit.ts make [<file.exe>] | apply <kit.bin>')))
    .catch((e: unknown) => {
      console.error('\nStopped: ' + (e instanceof Error ? e.message : String(e)));
      process.exit(1);
    });
}
