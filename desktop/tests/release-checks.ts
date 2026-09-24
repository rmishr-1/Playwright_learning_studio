/**
 * Checks a packaged release build from the outside, the way someone trying to copy it would go at
 * it. `npm run package` first; this uses desktop/release/win-unpacked, the files the installer
 * installs.
 *
 *   npm run test:release                  (moves the app's data folder aside, and puts it back)
 *   npm run test:release -- <licence>     a build for one customer that does not carry its licence
 *
 *   - the fuses are set: no running as Node, no NODE_OPTIONS, no debugger, app.asar only, and
 *     app.asar is checked against the hash built into the program
 *   - app.asar holds no source, no source maps, no plain course, and nothing readable in main.js
 *   - content.pack is not readable
 *   - the app refuses debugger switches, and a changed app.asar
 *   - without a licence the backend never starts; with one, the API still refuses anyone but the
 *     window
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as asar from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { machineCode, sign, type Licence, type LicenceFile } from '../src/licence';
import { keepUserData } from './user-data';

const DESKTOP = path.resolve(__dirname, '..');
// STUDIO_TEST_APP_DIR checks another copy, such as a customer's zip, extracted.
const UNPACKED = process.env.STUDIO_TEST_APP_DIR || path.join(DESKTOP, 'release', 'win-unpacked');
const EXE = path.join(UNPACKED, 'QA Practice Training Studio.exe');
const ASAR = path.join(UNPACKED, 'resources', 'app.asar');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');
const PRIVATE_KEY = fs.readFileSync(path.join(DESKTOP, 'keys', 'licence-private.pem'), 'utf-8');

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function killTree(child: ChildProcess): void {
  if (child.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Already gone.
    }
  }
}

/** Starts the app, lets it run for a while, and says whether it was still running. */
async function runFor(exe: string, args: string[], ms: number, env: NodeJS.ProcessEnv = process.env): Promise<{ alive: boolean; out: string }> {
  const child = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
  let exited = false;
  child.on('exit', () => (exited = true));
  await sleep(ms);
  const alive = !exited;
  killTree(child);
  await sleep(1500);
  return { alive, out };
}

/** A customer's build carries its licence, and accepts no other. */
function builtInLicence(): Licence | null {
  try {
    return (JSON.parse(asar.extractFile(ASAR, 'licence.lic').toString('utf-8')) as LicenceFile).licence;
  } catch {
    return null;
  }
}

function reset(licence: Licence | null, accepted: boolean): void {
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(USER, { recursive: true });
  if (!licence) return;
  if (!builtInLicence()) {
    // A customer's licence as it was issued (its logo and signature included), else a test one.
    const given = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf-8') : null;
    fs.writeFileSync(path.join(USER, 'licence.lic'), given ?? JSON.stringify(sign(licence, PRIVATE_KEY)));
  }
  if (accepted) {
    const eula = asar.extractFile(ASAR, 'EULA.txt');
    fs.writeFileSync(
      path.join(USER, 'eula-accepted.json'),
      JSON.stringify({ eula: crypto.createHash('sha256').update(eula).digest('hex'), licence: licence.id }),
    );
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(EXE)) throw new Error('No packaged app. Run `npm run package` first.');
  keepUserData(USER, 'QA Practice Training Studio.exe');

  console.log('Fuses');
  const wire = await getCurrentFuseWire(EXE);
  const on = (f: FuseV1Options): boolean => wire[f] === '1'.charCodeAt(0);
  expect(!on(FuseV1Options.RunAsNode), 'cannot be run as Node (ELECTRON_RUN_AS_NODE)');
  expect(!on(FuseV1Options.EnableNodeOptionsEnvironmentVariable), 'ignores NODE_OPTIONS');
  expect(!on(FuseV1Options.EnableNodeCliInspectArguments), 'ignores --inspect');
  expect(on(FuseV1Options.OnlyLoadAppFromAsar), 'loads its code only from app.asar');
  expect(on(FuseV1Options.EnableEmbeddedAsarIntegrityValidation), 'checks app.asar against its built-in hash');
  expect(on(FuseV1Options.EnableCookieEncryption), 'encrypts its cookies on disk');

  console.log('\nWhat app.asar holds');
  const files = asar.listPackage(ASAR, { isPack: false }).map((f) => f.replace(/\\/g, '/'));
  const own = files.filter((f) => !f.startsWith('/node_modules/'));
  expect(!own.some((f) => /\.(ts|tsx|map|md)$/.test(f)), 'no source, source maps or Markdown', own.filter((f) => /\.(ts|tsx|map|md)$/.test(f)).join(', '));
  expect(!files.some((f) => /Data\/(Source|Content)|course-index\.json|day-\d+\.json|workspaces\.json/.test(f)), 'no course files in plain form');
  expect(files.includes('/content.pack'), 'the course is there as content.pack');
  const main = asar.extractFile(ASAR, 'main.js').toString('utf-8');
  expect(main.startsWith('/*! QA Practice Training Studio'), 'main.js starts with the copyright notice');
  const readable = ['studio_token', 'aes-256-gcm', 'SPK1', 'licence.lic', 'eula-accepted', 'courseIndex', 'recordProgress', 'setup:accept'];
  const found = readable.filter((s) => main.includes(s));
  expect(found.length === 0, 'main.js is obfuscated: none of the studio\'s names are readable', found.join(', '));
  const pack = asar.extractFile(ASAR, 'content.pack');
  const text = pack.toString('latin1');
  expect(!/Playwright|"parts"|course-index|TypeScript/.test(text), 'content.pack is not readable', pack.length + ' bytes');
  expect(!fs.existsSync(path.join(UNPACKED, 'resources', 'app')), 'there is no unpacked app folder to load instead');
  const unpacked = path.join(UNPACKED, 'resources', 'app.asar.unpacked');
  const unpackedOwn = fs.existsSync(unpacked) ? fs.readdirSync(unpacked).filter((n) => n !== 'node_modules') : [];
  expect(unpackedOwn.length === 0, 'only third-party packages are unpacked', unpackedOwn.join(', '));

  const carried = builtInLicence();
  console.log('\nStarting the app' + (carried ? ', a build for ' + carried.licensee + ' (' + carried.id + ')' : ''));
  reset(null, false);
  let r = await runFor(EXE, [], 8000);
  expect(
    r.alive && !fs.existsSync(path.join(USER, 'port.json')),
    'until there is a licence and the agreement is accepted, the backend never starts',
  );

  const given = process.argv[2] ? (JSON.parse(fs.readFileSync(process.argv[2], 'utf-8')) as LicenceFile) : null;
  const licence: Licence = carried ?? given?.licence ?? {
    id: 'EVK-RELEASE1',
    licensee: 'Release Check Ltd',
    email: null,
    issued: '2026-09-24',
    expires: null,
    machine: machineCode(),
    product: 'learning-studio',
  };
  reset(licence, true);
  const child = spawn(EXE, [], { stdio: 'ignore' });
  let port = 0;
  for (let i = 0; i < 60 && !port; i++) {
    await sleep(500);
    try {
      port = (JSON.parse(fs.readFileSync(path.join(USER, 'port.json'), 'utf-8')) as { port: number }).port;
    } catch {
      port = 0;
    }
  }
  expect(port > 0 && (await listening(port)), 'with a licence and the agreement accepted, the studio starts', 'port ' + port);
  for (const p of ['/', '/api/course', '/api/course/1/1', '/api/progress']) {
    const status = port ? (await fetch('http://127.0.0.1:' + port + p)).status : 0;
    expect(status === 401, 'from outside the window, ' + p + ' is refused', String(status));
  }
  const viaLocalhost = port ? (await fetch('http://localhost:' + port + '/api/course').catch(() => ({ status: 0 }))).status : 0;
  expect(viaLocalhost === 401 || viaLocalhost === 0, 'another host name for the same port is refused', String(viaLocalhost));
  killTree(child);
  await sleep(2000);

  console.log('\nDebuggers and changed files');
  reset(licence, true);
  r = await runFor(EXE, ['--inspect=9339'], 7000);
  expect(!(await listening(9339)) && !r.alive, 'refuses to start with --inspect', r.alive ? 'still running' : 'exited');
  r = await runFor(EXE, ['--remote-debugging-port=9340'], 7000);
  expect(!(await listening(9340)), 'no remote debugging port', r.alive ? 'still running' : 'exited');
  r = await runFor(EXE, ['-e', 'console.log("RAN AS NODE")'], 6000, { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  expect(!r.out.includes('RAN AS NODE'), 'ELECTRON_RUN_AS_NODE does not turn it into Node');
  r = await runFor(EXE, [], 6000, { ...process.env, NODE_OPTIONS: '--require ./nothing.js' });
  expect(!/nothing\.js/.test(r.out), 'NODE_OPTIONS is ignored');

  // A copy of the app with one byte of app.asar changed must refuse to start.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tamper-'));
  fs.cpSync(UNPACKED, copy, {
    recursive: true,
    filter: (src) => !src.includes(path.join('resources', 'ms-playwright')),
  });
  const copyAsar = path.join(copy, 'resources', 'app.asar');
  // One letter of the copyright line at the top of main.js, past the archive's header.
  const raw = asar.getRawHeader(copyAsar) as { headerSize: number; header: { files: Record<string, { offset: string }> } };
  const bytes = fs.readFileSync(copyAsar);
  const at = 8 + raw.headerSize + Number(raw.header.files['main.js'].offset) + 5;
  bytes[at] = bytes[at] ^ 0x20;
  fs.writeFileSync(copyAsar, bytes);
  reset(licence, true);
  r = await runFor(path.join(copy, 'QA Practice Training Studio.exe'), [], 8000);
  expect(!r.alive && !fs.existsSync(path.join(USER, 'port.json')), 'a changed app.asar is refused', r.alive ? 'still running' : 'exited');
  fs.rmSync(copy, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });

  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed'));
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
