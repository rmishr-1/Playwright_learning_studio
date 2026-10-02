/**
 * What the Studio Tools window shows about this computer, as JSON on stdout:
 *
 *   node ../node_modules/tsx/dist/cli.mjs tools/status.ts --json [--github]
 *
 * A plain Node script, run by the window as a child process, so it can import the build scripts
 * unchanged (they find desktop/ from their own location). Read-only: it never loads the private
 * key, writes nothing, and each part that fails is reported in `errors` instead of stopping the
 * rest. --github also asks GitHub for what is published now (the internet).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { LAUNCHER_API } from '../../shared/studio-host';
import { fingerprint, type LicenceFile } from '../src/licence';
import { latestPath, openLatest } from '../src/release-format';
import { APP_SECRET_FILE, EVOKE_KEY_FINGERPRINT, FINGERPRINT_FILE, KEY_DIR, needsPassphrase, PRIVATE_FILE, PUBLIC_KEY_FILE, publicFingerprint, SEALS_FILE } from '../scripts/signing-key';
import { readRevoked } from '../scripts/revoke-licence';
import { eligibleLicences, LICENCES_DIR } from '../scripts/publish';
import { readVariants, variantByLicenceId } from '../scripts/variants';
import { rawBase, readDistribution } from '../scripts/distribution';
import type { AppRow, Delivery, LicenceRow, Published, Status, Suggestion } from './status-types';

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..');
const DIST_DIR = path.join(KEY_DIR, 'dist');
/** The tracked files the jobs edit: uncommitted, they are a reason to sync. */
const JOB_FILES = ['desktop/variants.json', 'desktop/revoked.json', 'desktop/src/licence-public.pem'];

const errors: string[] = [];

function attempt<T>(what: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    errors.push(what + ': ' + (e as Error).message);
    return fallback;
  }
}

/** A command's first line of output, or null when it is not there. */
function firstLine(line: string, cwd = ROOT): string | null {
  try {
    return execSync(line, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000, windowsHide: true }).split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

function git(args: string[], cwd = ROOT): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

const exists = (...parts: string[]): boolean => fs.existsSync(path.join(...parts));

function tools(): Status['tools'] {
  return {
    node: firstLine('node -v'),
    npm: firstLine('npm -v'),
    strictAllowScripts: firstLine('npm config get strict-allow-scripts') === 'true',
    git: firstLine('git --version'),
  };
}

function packages(): Status['packages'] {
  return {
    root: exists(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    desktop: exists(DESKTOP, 'node_modules', 'esbuild', 'package.json') && exists(DESKTOP, 'node_modules', 'electron', 'package.json'),
    electronDist: exists(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'),
    nodePty: exists(DESKTOP, 'node_modules', 'node-pty', 'package.json'),
  };
}

function readPublicKey(): string | null {
  return fs.existsSync(PUBLIC_KEY_FILE) ? fs.readFileSync(PUBLIC_KEY_FILE, 'utf-8') : null;
}

function key(publicKeyPem: string | null): Status['key'] {
  const present = fs.existsSync(PRIVATE_FILE);
  const recorded = fs.existsSync(FINGERPRINT_FILE) ? fs.readFileSync(FINGERPRINT_FILE, 'utf-8').trim() : null;
  let fingerprintOk = false;
  try {
    fingerprintOk = recorded === EVOKE_KEY_FINGERPRINT && publicKeyPem !== null && publicFingerprint(publicKeyPem) === EVOKE_KEY_FINGERPRINT;
  } catch {
    fingerprintOk = false;
  }
  return {
    present,
    passphrase: present ? attempt('passphrase', () => needsPassphrase(), false) : false,
    fingerprintOk,
    appSecretCached: fs.existsSync(APP_SECRET_FILE),
    keyDir: KEY_DIR,
  };
}

function licences(publicKeyPem: string | null): Status['licences'] {
  const empty = { rows: [] as LicenceRow[], eligible: 0, needsReissue: 0, revoked: 0 };
  if (!publicKeyPem || !fs.existsSync(LICENCES_DIR)) return empty;
  const revokedList = readRevoked().revoked;
  const revokedPrints = new Set(revokedList.map((r) => r.fingerprint));
  const { eligible, skipped } = eligibleLicences({
    privateKeyPem: '',
    publicKeyPem,
    licencesDir: LICENCES_DIR,
    seals: fs.existsSync(SEALS_FILE) ? (JSON.parse(fs.readFileSync(SEALS_FILE, 'utf-8')) as Record<string, { licensee: string; seal: string }>) : {},
    revoked: [...revokedPrints],
    today: new Date().toISOString().slice(0, 10),
  });
  const eligibleIds = new Set(eligible.map((e) => e.id));
  const reasons = new Map(skipped.map((s) => [s.file, s.reason]));
  const rows: LicenceRow[] = [];
  for (const name of fs.readdirSync(LICENCES_DIR).filter((f) => f.endsWith('.lic')).sort()) {
    let parsed: LicenceFile;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(LICENCES_DIR, name), 'utf-8')) as LicenceFile;
    } catch {
      rows.push({ id: name, licensee: '', expires: null, machine: false, app: '', state: 'skipped', reason: 'not a licence file' });
      continue;
    }
    const l = parsed.licence;
    const variant = variantByLicenceId(l.id);
    const reason = reasons.get(name);
    const state: LicenceRow['state'] = eligibleIds.has(l.id) ? 'eligible' : revokedPrints.has(fingerprint(parsed)) ? 'revoked' : reason && /seal/.test(reason) ? 'needs-reissue' : 'skipped';
    rows.push({
      id: l.id,
      licensee: l.licensee,
      expires: l.expires ?? null,
      machine: !!l.machine,
      app: variant ? variant.name : 'Evoke Training Studio (internal)',
      state,
      ...(state !== 'eligible' && reason ? { reason } : {}),
    });
  }
  return {
    rows,
    eligible: rows.filter((r) => r.state === 'eligible').length,
    needsReissue: rows.filter((r) => r.state === 'needs-reissue').length,
    revoked: revokedList.filter((r) => (r.kind ?? 'withdrawn') === 'withdrawn').length,
  };
}

function delivery(dir: string): Delivery | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const artifacts = fs
    .readdirSync(dir)
    .filter((n) => /\.(exe|zip)$/i.test(n))
    .map((n) => ({ n, stat: fs.statSync(path.join(dir, n)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (artifacts.length === 0) return undefined;
  return { artifact: artifacts[0].n, builtAt: artifacts[0].stat.mtime.toISOString(), bytes: artifacts[0].stat.size };
}

function apps(): AppRow[] {
  return readVariants().map((v) => ({
    code: v.code,
    name: v.name,
    licensee: v.licensee,
    licenceId: v.licenceId,
    licenceFilePresent: v.licence ? exists(DESKTOP, ...v.licence.split('/')) : true,
    deliveries: {
      standard: delivery(path.join(DESKTOP, 'deliveries', v.code)),
      full: delivery(path.join(DESKTOP, 'deliveries', v.code + '-full')),
    },
  }));
}

function parseLatest(kind: 'content' | 'app', text: string, publicKeyPem: string): Published {
  const m = openLatest(kind, text, publicKeyPem);
  return { version: m.version, payload: m.release.payload, published: m.published, grants: Object.keys(m.grants).length, revoked: m.revoked.length };
}

function published(publicKeyPem: string | null): Status['published'] {
  const result: Status['published'] = { content: null, app: null, unpushed: { content: 0, app: 0 } };
  if (!publicKeyPem) return result;
  for (const kind of ['content', 'app'] as const) {
    const dir = path.join(DIST_DIR, kind);
    const file = path.join(dir, latestPath(kind, LAUNCHER_API));
    if (!fs.existsSync(file)) continue;
    try {
      result[kind] = parseLatest(kind, fs.readFileSync(file, 'utf-8'), publicKeyPem);
    } catch (e) {
      result[kind] = { error: (e as Error).message };
    }
    result.unpushed[kind] = Number(git(['rev-list', '--count', 'origin/main..main'], dir) ?? '0') || 0;
  }
  return result;
}

async function github(publicKeyPem: string | null): Promise<Status['github']> {
  const d = attempt('distribution.json', () => readDistribution(), { content: null, app: null });
  const out = { content: { error: 'not published' } as Published | { error: string }, app: { error: 'not published' } as Published | { error: string } };
  for (const kind of ['content', 'app'] as const) {
    const repo = d[kind];
    if (!repo) {
      out[kind] = { error: 'distribution.json does not name this repository' };
      continue;
    }
    if (!publicKeyPem) {
      out[kind] = { error: 'desktop/src/licence-public.pem is missing' };
      continue;
    }
    try {
      const res = await fetch(rawBase(repo) + latestPath(kind, LAUNCHER_API), { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) {
        out[kind] = { error: 'nothing published yet (404)' };
        continue;
      }
      if (!res.ok) {
        out[kind] = { error: 'GitHub answered ' + res.status };
        continue;
      }
      out[kind] = parseLatest(kind, await res.text(), publicKeyPem);
    } catch (e) {
      out[kind] = { error: (e as Error).message };
    }
  }
  return out;
}

function gitStatus(): Status['git'] {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = git(['status', '--porcelain']) ?? '';
  const changed = porcelain
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''));
  const counts = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
  const [ahead, behind] = counts ? counts.split(/\s+/).map((n) => Number(n)) : [null, null];
  return {
    branch,
    uncommitted: changed.length,
    jobFiles: JOB_FILES.filter((f) => changed.some((c) => c === f || c.endsWith(f))),
    ahead: ahead ?? null,
    behind: behind ?? null,
    remote: git(['remote', 'get-url', 'origin']),
  };
}

function suggestions(s: Omit<Status, 'suggestions' | 'errors' | 'readAt'>): Suggestion[] {
  const out: Suggestion[] = [];
  if (!s.tools.node || !s.tools.npm) out.push({ text: 'Node.js is not on PATH: install the current Node 24 LTS.' });
  else if (!s.tools.strictAllowScripts || Number((s.tools.npm ?? '0').split('.')[0]) < 11) out.push({ text: "This npm does not enforce the studio's install-script rules: install the current Node 24 LTS." });
  if (!s.packages.root || !s.packages.desktop) out.push({ text: 'The packages are not installed on this computer.', job: 'setup' });
  if (!s.key.present) out.push({ text: 'There is no signing key here. Create one (the first computer), or restore it from a backup.', job: 'keygen' });
  else {
    if (!s.key.passphrase) out.push({ text: 'The signing key has no passphrase. Publishing the studio code requires one.', job: 'passphrase' });
    if (!s.key.fingerprintOk) out.push({ text: 'desktop/src/licence-public.pem does not match the key recorded here: release builds will refuse. Check which key this computer holds.' });
  }
  for (const r of s.licences.rows.filter((r) => r.state === 'needs-reissue')) {
    out.push({ text: r.id + ' (' + r.licensee + ') needs reissuing with a new seal before it can open the course.', job: 'issue-licence' });
  }
  for (const a of s.apps) {
    if (!a.deliveries.standard && !a.deliveries.full) out.push({ text: '"' + a.name + '" has never been built on this computer.', job: 'build-app', form: { app: a.code } });
    if (!a.licenceFilePresent) out.push({ text: '"' + a.name + '" cannot be built here: its licence file is not in desktop/licences/.' });
  }
  if (s.git.jobFiles.length) out.push({ text: 'Uncommitted: ' + s.git.jobFiles.join(', ') + '. Sync, so other computers get them.', job: 'git-sync' });
  else if (s.git.uncommitted > 0) out.push({ text: s.git.uncommitted + ' uncommitted change(s). Sync when they are ready.', job: 'git-sync' });
  if (s.git.behind) out.push({ text: 'GitHub has ' + s.git.behind + ' commit(s) this computer does not. Sync.', job: 'git-sync' });
  if (s.published.content === null) out.push({ text: 'The course has not been published from this computer.', job: 'publish-course' });
  if (s.published.app === null) out.push({ text: 'The studio code has not been published from this computer.', job: 'publish-app' });
  if (s.published.unpushed.content || s.published.unpushed.app) out.push({ text: 'A publish did not finish pushing. Run it again: it continues from the clone.' });
  if (out.length === 0) out.push({ text: 'Nothing pending.' });
  return out;
}

async function main(): Promise<void> {
  const wantGithub = process.argv.includes('--github');
  const publicKeyPem = attempt('public key', () => readPublicKey(), null);
  const version = attempt('version', () => (JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf-8')) as { version: string }).version, '?');
  const base = {
    version,
    tools: attempt('tools', tools, { node: null, npm: null, strictAllowScripts: false, git: null }),
    packages: attempt('packages', packages, { root: false, desktop: false, electronDist: false, nodePty: false }),
    key: attempt('key', () => key(publicKeyPem), { present: false, passphrase: false, fingerprintOk: false, appSecretCached: false, keyDir: KEY_DIR }),
    licences: attempt('licences', () => licences(publicKeyPem), { rows: [], eligible: 0, needsReissue: 0, revoked: 0 }),
    apps: attempt('apps', apps, []),
    published: attempt('published', () => published(publicKeyPem), { content: null, app: null, unpushed: { content: 0, app: 0 } }),
    git: attempt('git', gitStatus, { branch: null, uncommitted: 0, jobFiles: [], ahead: null, behind: null, remote: null }),
  };
  const status: Status = {
    readAt: new Date().toISOString(),
    ...base,
    ...(wantGithub ? { github: await github(publicKeyPem) } : {}),
    suggestions: attempt('suggestions', () => suggestions(base), []),
    errors,
  };
  process.stdout.write(JSON.stringify(status) + '\n');
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: (e as Error).message }) + '\n');
  process.exitCode = 1;
});
