/**
 * The release format and the publisher, in plain Node with the tests' own key (test-keys.ts):
 * what a publish writes, who can open it, and everything that must refuse.
 *
 *   npm run test:publish     (in desktop/)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fingerprint, sign, type Licence } from '../src/licence';
import {
  ReleaseError,
  appSecret,
  decryptBlob,
  kekFor,
  latestPath,
  openLatest,
  openRelease,
  packContainer,
  releaseKey,
  seedOf,
  signLatest,
  unpackContainer,
  type Manifest,
} from '../src/release-format';
import { NetworkError, openReleases, type Get } from '../src/release';
import { publishInto, type PublishContext } from '../scripts/publish';
import { removeCourseLeftovers } from '../src/cleanup';
import { loadBundle } from '../src/bundle-loader';
import { unpackNpmTarball } from '../src/untar';
import { testKeys } from './test-keys';

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}
function throws(fn: () => unknown, code: string | RegExp, what: string): void {
  try {
    fn();
    expect(false, what, 'did not throw');
  } catch (e) {
    const got = e instanceof ReleaseError ? e.code : (e as Error).message;
    expect(typeof code === 'string' ? got === code : code.test(got), what, got);
  }
}
async function rejects(p: Promise<unknown>, code: string, what: string): Promise<void> {
  try {
    await p;
    expect(false, what, 'did not throw');
  } catch (e) {
    const got = e instanceof ReleaseError || e instanceof NetworkError ? e.code : (e as Error).message;
    expect(got === code, what, got);
  }
}

const keys = testKeys();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-publish-test-'));
const licences = path.join(work, 'licences');
fs.mkdirSync(licences);

const seal = (): string => crypto.randomBytes(32).toString('hex');
function licence(id: string, over: Partial<Licence> = {}): Licence {
  return { id, licensee: 'Test ' + id, email: null, issued: '2026-09-01', expires: null, machine: null, product: 'learning-studio', seal: seal(), serial: crypto.randomBytes(8).toString('hex'), ...over };
}
function write(l: Licence): string {
  const file = sign(l, keys.privateKey);
  fs.writeFileSync(path.join(licences, l.id + '-test.lic'), JSON.stringify(file));
  return fingerprint(file);
}

const a = licence('EVK-0000000A');
const b = licence('EVK-0000000B');
const expired = licence('EVK-0000000C', { expires: '2026-01-01' });
const unsealed = licence('EVK-0000000D', { seal: null });
const strayed = licence('EVK-0000000E');
for (const l of [a, b, expired, unsealed, strayed]) write(l);
const seals: PublishContext['seals'] = Object.fromEntries([a, b, expired].map((l) => [l.id, { licensee: l.licensee, seal: l.seal! }]));
// E's file carries a seal other than the one recorded for its ID: an old file left behind.
seals[strayed.id] = { licensee: strayed.licensee, seal: seal() };

const ctx = (over: Partial<PublishContext> = {}): PublishContext => ({
  privateKeyPem: keys.privateKey,
  publicKeyPem: keys.publicKey,
  licencesDir: licences,
  seals,
  revoked: [],
  today: '2026-10-01',
  ...over,
});
const secret = appSecret(seedOf(keys.privateKey));
const course = (text: string): Map<string, Uint8Array> =>
  new Map([
    ['course-index.json', Buffer.from(JSON.stringify({ text }))],
    ['weeks/week-1/day-1.json', Buffer.from('{"day":1,"note":"' + text + '"}')],
  ]);

console.log('Container and blob');
const files = new Map<string, Uint8Array>([['a.txt', Buffer.from('hello')], ['web/x.png', crypto.randomBytes(300)]]);
const box = packContainer(files);
const back = unpackContainer(box);
expect(back.size === 2 && back.get('web/x.png')!.equals(Buffer.from(files.get('web/x.png')!)), 'a container keeps binary files exactly');
throws(() => packContainer(new Map([['../evil', Buffer.from('x')]])), /cannot be published/, 'a path that climbs out cannot be packed');
const bad = Buffer.from(box);
bad.writeUInt32LE(bad.readUInt32LE(4) + 5, 4);
throws(() => unpackContainer(bad), 'decrypt', 'a container with a wrong length is refused');

console.log('\nPublishing the course');
const repo = path.join(work, 'repo');
const first = publishInto(repo, 'content', ctx(), { files: course('one') });
expect(first.manifest.version === 1 && first.newRelease, 'the first publish is version 1, a new release');
expect(first.eligible.map((e) => e.id).sort().join() === [a.id, b.id].join(), 'only valid, sealed, recorded licences get a grant', first.eligible.map((e) => e.id).join());
const why = Object.fromEntries(first.skipped.map((s) => [s.file.slice(0, 12), s.reason]));
expect(/expired/.test(why[expired.id] ?? ''), 'an expired licence is skipped, and says so', why[expired.id]);
expect(/no seal/.test(why[unsealed.id] ?? ''), 'a licence without a seal is skipped', why[unsealed.id]);
expect(/not the one recorded/.test(why[strayed.id] ?? ''), 'a licence whose seal is not the recorded one is skipped', why[strayed.id]);
expect(Object.keys(first.manifest.grants).length === 8, 'grants are padded to a multiple of 8', String(Object.keys(first.manifest.grants).length));
const latestText = fs.readFileSync(path.join(repo, 'latest.json'), 'utf-8');
const blob = fs.readFileSync(path.join(repo, ...first.manifest.blob.path.split('/')));
expect(!/one|course-index|day-1/.test(blob.toString('latin1')) && !/one|course-index/.test(latestText), 'nothing readable in the repository');

const m = openLatest('content', latestText, keys.publicKey);
const opened = openRelease(m, blob, a.seal!, secret);
expect(opened.get('weeks/week-1/day-1.json')?.toString() === '{"day":1,"note":"one"}', 'licence A and the app open it');
expect(openRelease(m, blob, b.seal!, secret).size === 2, 'licence B opens it too');
throws(() => openRelease(m, blob, expired.seal!, secret), 'no-access', 'an expired licence has no grant');
throws(() => openRelease(m, blob, a.seal!, crypto.randomBytes(32)), 'no-access', 'the licence without the app\'s secret opens nothing');
throws(() => openRelease(m, blob, seal(), secret), 'no-access', 'the app without the licence\'s seal opens nothing');
const flipped = Buffer.from(blob);
flipped[flipped.length - 1] ^= 1;
throws(() => openRelease(m, flipped, a.seal!, secret), 'hash', 'a changed blob is refused before decrypting');
throws(() => openLatest('app', latestText, keys.publicKey), 'signature', 'a course manifest does not pass as an app manifest');
const other = crypto.generateKeyPairSync('ed25519');
throws(() => openLatest('content', latestText, other.publicKey.export({ type: 'spki', format: 'pem' }).toString()), 'signature', 'a manifest checked with another key is refused');
const forged = JSON.parse(latestText) as { manifest: string; signature: string };
const body = JSON.parse(Buffer.from(forged.manifest, 'base64').toString()) as Manifest;
body.version = 99;
forged.manifest = Buffer.from(JSON.stringify(body)).toString('base64');
throws(() => openLatest('content', JSON.stringify(forged), keys.publicKey), 'signature', 'a manifest changed after signing is refused');
const extra = signLatest('content', m, keys.privateKey).replace('"manifest"', '"extra": 1, "manifest"');
throws(() => openLatest('content', extra, keys.publicKey), 'format', 'a latest.json with unknown fields is refused');

console.log('\nPublishing again');
const same = publishInto(repo, 'content', ctx(), { files: course('one') });
expect(!same.newRelease && same.manifest.release.id === first.manifest.release.id && same.manifest.version === 2, 'the same course again keeps its release, under a higher version');
const c = licence('EVK-0000000F');
write(c);
const withC = publishInto(repo, 'content', ctx({ seals: { ...seals, [c.id]: { licensee: c.licensee, seal: c.seal! } } }), { files: null });
const mC = openLatest('content', fs.readFileSync(path.join(repo, 'latest.json'), 'utf-8'), keys.publicKey);
expect(!withC.newRelease && openRelease(mC, blob, c.seal!, secret).size === 2, 'a grants-only publish gives a new licence the same release');
const changed = publishInto(repo, 'content', ctx({ seals: { ...seals, [c.id]: { licensee: c.licensee, seal: c.seal! } } }), { files: course('two') });
expect(changed.newRelease && changed.manifest.release.id !== first.manifest.release.id, 'a changed course is a new release with a new key');
const blobs = fs.readdirSync(path.join(repo, 'blobs'));
expect(blobs.length === 2, 'earlier blobs are kept for launchers part-way through', blobs.length + ' blobs');
let refused = '';
try {
  publishInto(repo, 'content', ctx(), { files: course('two') });
} catch (e) {
  refused = (e as Error).message;
}
expect(/no seal for/.test(refused), 'a publish from a computer that lacks a licence\'s seal stops, rather than lock it out', refused.slice(0, 80));
const dropped = publishInto(repo, 'content', ctx(), { files: course('two'), dropUnknown: true });
expect(Object.keys(dropped.manifest.grants).length === 8, '--drop-unknown publishes without it');

console.log('\nWithdrawing a licence');
const bPrint = fingerprint(JSON.parse(fs.readFileSync(path.join(licences, b.id + '-test.lic'), 'utf-8')));
const rekeyed = publishInto(repo, 'content', ctx({ revoked: [bPrint] }), { files: null, rekey: true });
const mR = openLatest('content', fs.readFileSync(path.join(repo, 'latest.json'), 'utf-8'), keys.publicKey);
const blobR = fs.readFileSync(path.join(repo, ...mR.blob.path.split('/')));
expect(rekeyed.newRelease && mR.revoked.includes(bPrint), '--rekey makes a new release, and lists the withdrawn licence');
throws(() => openRelease(mR, blobR, b.seal!, secret), 'no-access', 'the withdrawn licence has no grant in it');
expect(openRelease(mR, blobR, a.seal!, secret).get('course-index.json')?.toString() === '{"text":"two"}', 'the others still open it, with the same course');
const oldKey = releaseKey(seedOf(keys.privateKey), 'content', changed.manifest.release.id);
throws(() => decryptBlob(oldKey, blobR, 'content', mR.release.id), 'decrypt', 'the old release key opens nothing new');

async function launcherPart(): Promise<void> {
console.log('\nThe launcher\'s download');
const appRepo = path.join(work, 'app');
publishInto(appRepo, 'app', ctx(), { files: new Map([['studio-app.js', Buffer.from('module.exports = 1')]]), payload: 1 });
const serve = (roots: Record<string, string>, opts: { stale?: string } = {}): Get => async (url, max) => {
  const u = new URL(url);
  const [, which, ...rest] = u.pathname.split('/');
  const rel = rest.join('/');
  if (opts.stale && rel.endsWith('latest.json') && which === 'content') return Buffer.from(opts.stale);
  const file = path.join(roots[which], ...rel.split('/'));
  if (!fs.existsSync(file)) throw new NetworkError('not-found', url);
  const data = fs.readFileSync(file);
  if (data.length > max) throw new NetworkError('too-large', url);
  return data;
};
const state = path.join(work, 'state');
const base = { content: 'https://test/content/', app: 'https://test/app/' };
const options = (get: Get, l: Licence = a) => ({
  base,
  publicKey: keys.publicKey,
  seal: l.seal!,
  licenceFingerprint: fingerprint(JSON.parse(fs.readFileSync(path.join(licences, l.id + '-test.lic'), 'utf-8'))),
  secret,
  api: 1,
  stateDir: state,
  get,
});
const live = await openReleases(options(serve({ content: repo, app: appRepo })));
expect(live.content.files.get('course-index.json') === '{"text":"two"}' && live.app.files.get('studio-app.js')?.toString() === 'module.exports = 1', 'the launcher opens the course and the app');
expect(fs.existsSync(path.join(state, 'content-latest.json')) && !/two/.test(fs.readFileSync(path.join(state, 'content-latest.json'), 'utf-8')), 'it keeps the manifest it accepted, and no course');
await rejects(openReleases(options(serve({ content: repo, app: appRepo }), b)), 'withdrawn', 'a withdrawn licence is refused at once');
await rejects(openReleases(options(async () => { throw new NetworkError('offline', 'no network'); })), 'offline', 'no internet: the start stops, and says so');
// GitHub's cache serving an older latest.json: the newer one accepted before is used.
const v1 = signLatest('content', { ...mR, version: 1 }, keys.privateKey);
const cached = await openReleases(options(serve({ content: repo, app: appRepo }, { stale: v1 })));
expect(cached.content.manifest.version === mR.version, 'a stale latest.json from GitHub\'s cache falls back to the newer one kept', String(cached.content.manifest.version));
const nextContent = publishInto(repo, 'content', ctx({ revoked: [bPrint] }), { files: course('three'), minApp: 5 });
await rejects(openReleases(options(serve({ content: repo, app: appRepo }))), 'too-old', 'a course that needs a newer app says to install the new version');
void nextContent;

console.log('\nClean-up');
const user = path.join(work, 'user');
const ws = path.join(user, 'Workspace', 'project');
fs.mkdirSync(path.join(ws, '.studio'), { recursive: true });
fs.mkdirSync(path.join(ws, 'tests', 'day1'), { recursive: true });
fs.mkdirSync(path.join(ws, 'playwright-report'), { recursive: true });
const seedText = 'test("course text", () => {});\n';
const mine = 'my own answer\n';
fs.writeFileSync(path.join(ws, 'tests', 'day1', 'seed.spec.ts'), seedText);
fs.writeFileSync(path.join(ws, 'tests', 'day1', 'mine.spec.ts'), mine);
fs.writeFileSync(path.join(ws, 'playwright-report', 'index.html'), 'report');
const print = (t: string): string => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
fs.writeFileSync(path.join(ws, '.studio', 'seeded.json'), JSON.stringify({ 'tests/day1/seed.spec.ts': print(seedText), 'tests/day1/mine.spec.ts': print('the starting code\n') }));
const prefix = 'studio-run-' + crypto.randomBytes(4).toString('hex') + '-';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const otherScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-run-'));
removeCourseLeftovers(user, prefix);
expect(!fs.existsSync(path.join(ws, 'tests', 'day1', 'seed.spec.ts')), 'an untouched starting file is removed');
expect(fs.readFileSync(path.join(ws, 'tests', 'day1', 'mine.spec.ts'), 'utf-8') === mine, 'a file the learner changed is kept');
expect(!fs.existsSync(path.join(ws, 'playwright-report')), 'the test report is removed');
expect(!fs.existsSync(scratch) && fs.existsSync(otherScratch), 'this app\'s Run folders go, another app\'s stay');
fs.rmSync(otherScratch, { recursive: true, force: true });

console.log('\nRunning the studio\'s code, and the packages it may install');
const appDir = path.join(work, 'app.asar');
fs.mkdirSync(path.join(appDir, 'node_modules', 'shipped'), { recursive: true });
fs.writeFileSync(path.join(appDir, 'node_modules', 'shipped', 'package.json'), '{"name":"shipped","version":"1.0.0","main":"index.js"}');
fs.writeFileSync(path.join(appDir, 'node_modules', 'shipped', 'index.js'), 'module.exports = "code";');
const bundleCode = (body: string): string => body + '\nmodule.exports = { api: 1, version: 1, start: async () => ({ port: 1, stop: async () => {} }), setup: {} };';
let loaded = loadBundle(bundleCode('const fs = require("node:fs"); const v = require("shipped/package.json").version; if (!fs || v !== "1.0.0") throw new Error("x");'), appDir);
expect(loaded.api === 1, 'the bundle loads, with Node\'s modules and the shipped packages\' JSON');
const refusedBy = (body: string): string => {
  try {
    loadBundle(bundleCode(body), appDir);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};
expect(/may not load electron/.test(refusedBy('require("electron");')), 'the bundle may not load electron');
expect(/may not load shipped/.test(refusedBy('require("shipped");')), 'the bundle may not run a package\'s code itself');
const outside = path.join(work, 'planted.js');
fs.writeFileSync(outside, 'module.exports = 1;');
expect(/may not load/.test(refusedBy('require(' + JSON.stringify(outside) + ');')), 'the bundle may not load a file planted outside the app');
expect(/may not load/.test(refusedBy('require.resolve(' + JSON.stringify(outside) + ');')), 'nor resolve one');
loaded = loadBundle(bundleCode('module.exports.where = require.resolve("shipped");'), appDir);
expect(loaded !== null, 'it may find where a shipped package is, to hand to the learner\'s processes');

const tarOf = (entries: [string, string, string?][]): Buffer => {
  const blocks: Buffer[] = [];
  for (const [name, text, type] of entries) {
    const data = Buffer.from(text);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100);
    h.write('0000644\0', 100);
    h.write('0000000\0', 108);
    h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write('00000000000\0', 136);
    h.write(type ?? '0', 156);
    h.write('ustar\0' + '00', 257);
    h.fill(' ', 148, 156);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
};
const pkgDir = path.join(work, 'Workspace', 'node_modules', 'left-pad');
unpackNpmTarball(tarOf([['package/package.json', '{"name":"left-pad","version":"1.3.0"}'], ['package/lib/index.js', 'module.exports = 1;']]), pkgDir);
expect(fs.readFileSync(path.join(pkgDir, 'lib', 'index.js'), 'utf-8') === 'module.exports = 1;', 'a package tarball unpacks into the workspaces\' node_modules');
const untarRefuses = (entries: [string, string, string?][]): boolean => {
  try {
    unpackNpmTarball(tarOf(entries), path.join(work, 'evil'));
    return false;
  } catch {
    return !fs.existsSync(path.join(work, 'escaped.js'));
  }
};
expect(untarRefuses([['package/../../escaped.js', 'x']]), 'a tarball path that climbs out is refused');
expect(untarRefuses([['package/link', '', '2']]), 'a link in a tarball is refused');
}

void launcherPart().then(
  () => {
    fs.rmSync(work, { recursive: true, force: true });
    console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '.');
    process.exit(failures ? 1 : 0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
