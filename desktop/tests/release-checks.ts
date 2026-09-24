/**
 * Checks a packaged release build from the outside, the way someone trying to copy it would go at
 * it. `npm run package` first; this uses desktop/release/win-unpacked, the files the installer
 * installs (or STUDIO_TEST_APP_DIR, such as a customer's zip, extracted).
 *
 *   npm run test:release -- <licence file>   a licence the build accepts (never Evoke's signing key)
 *
 *   - the fuses are set: no running as Node, no NODE_OPTIONS, no debugger, app.asar only, and
 *     app.asar is checked against the hash built into the program
 *   - app.asar holds no source, no source maps, no plain course, and nothing readable in main.js
 *   - content.pack is not readable
 *   - the app refuses every command-line switch (debuggers, proxies, network logs) and a changed
 *     app.asar; a reg.exe or a module planted beside it is never used; the one compiler file
 *     outside app.asar is never loaded by the app itself
 *   - without a licence the backend never starts; with one, the API still refuses anyone but the
 *     window, and to every other host name
 *
 * It moves the app's data folder aside while it runs, and puts it back.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as asar from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { machineCode, type LicenceFile } from '../src/licence';
import { keepUserData } from './user-data';

const DESKTOP = path.resolve(__dirname, '..');
const UNPACKED = process.env.STUDIO_TEST_APP_DIR || path.join(DESKTOP, 'release', 'win-unpacked');
const EXE_NAME = 'QA Practice Training Studio.exe';
const EXE = path.join(UNPACKED, EXE_NAME);
const ASAR = path.join(UNPACKED, 'resources', 'app.asar');
const USER = path.join(process.env.APPDATA!, 'QA Practice Training Studio');

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

function status(port: number, p: string, host?: string): Promise<number> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: p, headers: host ? { host } : {} }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

function killTree(child: ChildProcess): void {
  if (child.pid) {
    try {
      execFileSync('C:\\Windows\\System32\\taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Already gone.
    }
  }
}

/** Starts the app, lets it run for a while, and says whether it was still running. */
async function runFor(exe: string, args: string[], ms: number, opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<{ alive: boolean; out: string }> {
  const child = spawn(exe, args, { env: opts.env ?? process.env, cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

/** A customer's build may carry its licence; otherwise the licence given is installed. */
function builtInLicence(): LicenceFile | null {
  try {
    return JSON.parse(asar.extractFile(ASAR, 'licence.lic').toString('utf-8')) as LicenceFile;
  } catch {
    return null;
  }
}

function reset(licenceText: string | null, accepted: boolean): void {
  fs.rmSync(USER, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(USER, { recursive: true });
  if (licenceText === null) return;
  const licence = (JSON.parse(licenceText) as LicenceFile).licence;
  if (!builtInLicence()) fs.writeFileSync(path.join(USER, 'licence.lic'), licenceText);
  if (accepted) {
    const eula = asar.extractFile(ASAR, 'EULA.txt');
    fs.writeFileSync(
      path.join(USER, 'eula-accepted.json'),
      JSON.stringify({ eula: crypto.createHash('sha256').update(eula).digest('hex'), licence: licence.id }),
    );
  }
}

/** Starts the app with its licence and agreement in place, and waits for its server. */
async function startStudio(exe: string, opts: { cwd?: string } = {}): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(exe, [], { stdio: 'ignore', cwd: opts.cwd });
  let port = 0;
  for (let i = 0; i < 60 && !port; i++) {
    await sleep(500);
    try {
      port = (JSON.parse(fs.readFileSync(path.join(USER, 'port.json'), 'utf-8')) as { port: number }).port;
    } catch {
      port = 0;
    }
  }
  if (port && !(await listening(port))) port = 0;
  return { child, port };
}

async function main(): Promise<void> {
  if (!fs.existsSync(EXE)) throw new Error('No packaged app. Run `npm run package` first.');
  const given = builtInLicence() ? JSON.stringify(builtInLicence()) : process.argv[2] ? fs.readFileSync(process.argv[2], 'utf-8') : null;
  if (!given) throw new Error('Usage: npm run test:release -- <a licence file the build accepts>');
  const licence = (JSON.parse(given) as LicenceFile).licence;
  keepUserData(USER, EXE_NAME);
  console.log('Checking ' + UNPACKED + ' with licence ' + licence.id + ' (' + licence.licensee + ')');

  console.log('\nFuses');
  const wire = await getCurrentFuseWire(EXE);
  const on = (f: FuseV1Options): boolean => wire[f] === '1'.charCodeAt(0);
  expect(!on(FuseV1Options.RunAsNode), 'cannot be run as Node (ELECTRON_RUN_AS_NODE)');
  expect(!on(FuseV1Options.EnableNodeOptionsEnvironmentVariable), 'ignores NODE_OPTIONS');
  expect(!on(FuseV1Options.EnableNodeCliInspectArguments), 'ignores --inspect');
  expect(on(FuseV1Options.OnlyLoadAppFromAsar), 'loads its code only from app.asar');
  expect(on(FuseV1Options.EnableEmbeddedAsarIntegrityValidation), 'checks app.asar against its built-in hash');
  expect(on(FuseV1Options.EnableCookieEncryption), 'encrypts its cookies on disk');
  expect(!on(FuseV1Options.GrantFileProtocolExtraPrivileges), 'gives file:// pages no extra rights');

  console.log('\nWhat app.asar holds');
  const files = asar.listPackage(ASAR, { isPack: false }).map((f) => f.replace(/\\/g, '/'));
  const own = files.filter((f) => !f.startsWith('/node_modules/'));
  expect(!own.some((f) => /\.(ts|tsx|map|md)$/.test(f)), 'no source, source maps or Markdown', own.filter((f) => /\.(ts|tsx|map|md)$/.test(f)).join(', '));
  expect(!files.some((f) => /Data\/(Source|Content)|course-index\.json|day-\d+\.json|workspaces\.json/.test(f)), 'no course files in plain form');
  expect(files.includes('/content.pack'), 'the course is there as content.pack');
  const main = asar.extractFile(ASAR, 'main.js').toString('utf-8');
  expect(main.startsWith('/*! QA Practice Training Studio'), 'main.js starts with the copyright notice');
  const readable = ['studio_token', 'aes-256-gcm', 'SPK1', 'licence.lic', 'eula-accepted', 'courseIndex', 'recordProgress', 'setup:accept', 'last-seen'];
  const found = readable.filter((s) => main.includes(s));
  expect(found.length === 0, 'main.js is obfuscated: none of the studio\'s names are readable', found.join(', '));
  if (licence.seal) expect(!main.includes(licence.seal), 'the licence\'s seal is not in the app');
  const pack = asar.extractFile(ASAR, 'content.pack');
  expect(!/Playwright|"parts"|course-index|TypeScript/.test(pack.toString('latin1')), 'content.pack is not readable', pack.length + ' bytes');
  expect(!fs.existsSync(path.join(UNPACKED, 'resources', 'app')), 'there is no unpacked app folder to load instead');
  const unpacked = path.join(UNPACKED, 'resources', 'app.asar.unpacked');
  const unpackedOwn = fs.existsSync(unpacked) ? fs.readdirSync(unpacked).filter((n) => n !== 'node_modules') : [];
  expect(unpackedOwn.length === 0, 'only third-party packages are unpacked', unpackedOwn.join(', '));
  const tsLib = path.join(unpacked, 'node_modules', 'typescript', 'lib');
  expect(fs.existsSync(tsLib) && fs.readdirSync(tsLib).join() === 'typescript.js', 'of the TypeScript package, only the one file a Run needs ships');
  expect(!fs.existsSync(path.join(UNPACKED, 'resources', 'node', 'node_modules')), 'Node ships without npm');

  console.log('\nStarting the app');
  reset(null, false);
  let r = await runFor(EXE, [], 8000);
  expect(r.alive && !fs.existsSync(path.join(USER, 'port.json')), 'until there is a licence and the agreement is accepted, the backend never starts');

  reset(given, true);
  const { child, port } = await startStudio(EXE);
  expect(port > 0, 'with a licence and the agreement accepted, the studio starts', 'port ' + port);
  for (const p of ['/', '/api/course', '/api/course/1/1', '/api/progress']) {
    const s = port ? await status(port, p) : 0;
    expect(s === 401, 'from outside the window, ' + p + ' is refused', String(s));
  }
  const rebound = port ? await status(port, '/api/course', 'attacker.example:' + port) : 0;
  expect(rebound === 401, 'another host name for the same port (DNS rebinding) is refused', String(rebound));
  killTree(child);
  await sleep(2000);

  console.log('\nCommand-line switches');
  const netlog = path.join(os.tmpdir(), 'studio-netlog-' + Date.now() + '.json');
  const switches: [string, string][] = [
    ['--inspect=9339', 'a debugger (--inspect)'],
    ['--remote-debugging-port=9340', 'remote debugging'],
    ['--proxy-server=127.0.0.1:9341', 'a proxy that would capture its traffic'],
    ['--log-net-log=' + netlog, 'a network log of its traffic'],
    ['--enable-logging', 'Chromium logging'],
    // Windows-style and plain arguments are refused too: a release takes no argument at all.
    ['/inspect', 'a Windows-style switch'],
    ['C:\\Users\\Public\\somewhere', 'a plain argument (a file or a folder)'],
    ['studio://app/setup.html', 'an address'],
  ];
  for (const [arg, what] of switches) {
    reset(given, true);
    r = await runFor(EXE, [arg], 7000);
    expect(!r.alive && !fs.existsSync(path.join(USER, 'port.json')), 'refuses to start with ' + what, r.alive ? 'still running' : 'exited');
  }
  expect(!fs.existsSync(netlog) && !(await listening(9339)) && !(await listening(9340)), 'no debugger port and no network log appeared');
  reset(given, true);
  r = await runFor(EXE, ['-e', 'console.log("RAN AS NODE")'], 6000, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  expect(!r.out.includes('RAN AS NODE'), 'ELECTRON_RUN_AS_NODE does not turn it into Node');
  reset(given, true);
  r = await runFor(EXE, [], 6000, { env: { ...process.env, NODE_OPTIONS: '--require ./nothing.js' } });
  expect(!/nothing\.js/.test(r.out), 'NODE_OPTIONS is ignored');

  console.log('\nChanged and planted files');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tamper-'));
  fs.cpSync(UNPACKED, copy, { recursive: true, filter: (src) => !src.includes(path.join('resources', 'ms-playwright')) });
  const copyExe = path.join(copy, EXE_NAME);
  const marker = path.join(os.tmpdir(), 'studio-planted-' + Date.now() + '.txt');
  const plant = 'require("fs").writeFileSync(' + JSON.stringify(marker) + ', "loaded"); module.exports = {};';
  // A module where Node would look for ws's native add-on, beside and above the app.
  for (const dir of [path.join(copy, 'resources', 'node_modules'), path.join(copy, 'node_modules')]) {
    fs.mkdirSync(path.join(dir, 'bufferutil'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bufferutil', 'index.js'), plant);
  }
  // The one compiler file outside app.asar, turned into a trap the app itself must never spring.
  const copyTs = path.join(copy, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript', 'lib', 'typescript.js');
  fs.writeFileSync(copyTs, plant + '\n' + fs.readFileSync(copyTs, 'utf-8'));
  // A reg.exe that is not Windows' own, in the folder the app starts from.
  fs.copyFileSync(process.execPath, path.join(copy, 'reg.exe'));
  reset(given, true);
  const planted = await startStudio(copyExe, { cwd: copy });
  expect(planted.port > 0, 'with files planted beside it, the app still starts', 'port ' + planted.port);
  expect(!fs.existsSync(marker), 'no planted module, and not the compiler file, ran inside the app');
  if (licence.machine) {
    expect(planted.port > 0 && licence.machine === machineCode(), 'a planted reg.exe cannot answer for the machine code');
  } else {
    console.log('skip  a planted reg.exe (the licence given is not for one computer)');
  }
  killTree(planted.child);
  await sleep(2000);
  fs.rmSync(marker, { force: true });

  // One byte of main.js changed: the app must refuse to start.
  const raw = asar.getRawHeader(path.join(copy, 'resources', 'app.asar')) as { headerSize: number; header: { files: Record<string, { offset: string }> } };
  const copyAsar = path.join(copy, 'resources', 'app.asar');
  const bytes = fs.readFileSync(copyAsar);
  const at = 8 + raw.headerSize + Number(raw.header.files['main.js'].offset) + 5;
  bytes[at] = bytes[at] ^ 0x20;
  fs.writeFileSync(copyAsar, bytes);
  reset(given, true);
  r = await runFor(copyExe, [], 8000, { cwd: copy });
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
