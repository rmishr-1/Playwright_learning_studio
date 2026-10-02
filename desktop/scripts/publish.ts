/**
 * Publishes the course and the studio's code to their distribution repositories
 * (distribution.json), encrypted and signed (src/release-format.ts). Every installed studio
 * downloads them at its next start.
 *
 *   npm run publish -- content         the course in Data/Content (run `npm run build:content` first)
 *   npm run publish -- app             the studio's code: the backend and the page (build.ts buildBundle)
 *   npm run publish -- grants          the same releases, for the licences issued since: a new
 *                                      licence opens nothing until this (or a publish) has run
 *
 *   --rekey          a new release key, even when nothing changed: after a licence is withdrawn,
 *                    so its copy of the key opens nothing new
 *   --kind content|app   for grants: one repository only (both by default)
 *   --dry-run        does everything but write: says what would be published, and for whom
 *   --to <folder>    writes into a plain folder instead of the repository (tests; trying it out)
 *   --no-push        commits, but leaves the push to you
 *   --drop-unknown   publishes even though the last release had grants this computer cannot
 *                    account for (licences issued on another computer lose access)
 *
 * Who gets access: every licence file in desktop/licences/ (not a withdrawn one) whose seal matches
 * the one recorded beside the signing key (seals.json), which has not been revoked (revoked.json)
 * and has not expired. Each licence skipped is listed with the reason.
 *
 * The publisher clones each repository into %USERPROFILE%\.evoke-studio\dist\, pulls, writes the new
 * release, opens it with the launcher's own code to prove it opens, then commits, tags and pushes.
 * Publishing the app (code that runs on every learner's computer) needs the signing key to have a
 * passphrase.
 */
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { verify, type LicenceFile } from '../src/licence';
import {
  appSecret,
  channelOf,
  decoyGrant,
  encryptBlob,
  grantId,
  kekFor,
  latestPath,
  Manifest,
  openLatest,
  openRelease,
  packContainer,
  releaseKey,
  seedOf,
  sha256,
  signLatest,
  unpackContainer,
  decryptBlob,
  wrapGrant,
  type Kind,
  type SetupStep,
} from '../src/release-format';
import { LAUNCHER_API } from '../../shared/studio-host';
import { cloneUrl, distribution } from './distribution';
import { contentFiles } from './content-files';
import { DESKTOP, EVOKE_KEY_FINGERPRINT, KEY_DIR, SEALS_FILE, checkedPublicKey, keyFingerprint, loadPrivateKey, needsPassphrase } from './signing-key';
import { readRevoked } from './revoke-licence';

export const LICENCES_DIR = path.join(DESKTOP, 'licences');
const DIST_DIR = path.join(KEY_DIR, 'dist');
/** How many releases' blobs stay in a repository: a launcher that saw an older manifest can still finish. */
const KEEP = 5;

type Seals = Record<string, { licensee: string; seal: string }>;

export type Eligible = { id: string; licensee: string; seal: string; file: string };
export type Skipped = { file: string; reason: string };

/** Everything a publish works from. The tests give their own; a real publish takes Evoke's. */
export type PublishContext = {
  privateKeyPem: string;
  publicKeyPem: string;
  licencesDir: string;
  seals: Seals;
  revoked: string[];
  today: string;
};

/** The licences that get a grant, and those that do not, with why. */
export function eligibleLicences(ctx: PublishContext): { eligible: Eligible[]; skipped: Skipped[] } {
  const eligible: Eligible[] = [];
  const skipped: Skipped[] = [];
  if (!fs.existsSync(ctx.licencesDir)) return { eligible, skipped };
  for (const name of fs.readdirSync(ctx.licencesDir).sort()) {
    // A licence replaced or withdrawn is renamed <name>.revoked-<n>.lic.old; anything else is not a licence.
    if (!/^EVK-[0-9A-F]{8}-[a-z0-9-]+\.lic$/.test(name)) continue;
    const file = path.join(ctx.licencesDir, name);
    const text = fs.readFileSync(file, 'utf-8');
    let parsed: LicenceFile;
    try {
      parsed = JSON.parse(text) as LicenceFile;
    } catch {
      skipped.push({ file: name, reason: 'not a licence file' });
      continue;
    }
    const verdict = verify(text, ctx.publicKeyPem, { onlyId: null, machine: parsed.licence?.machine ?? '', today: ctx.today, revoked: ctx.revoked });
    if (!verdict.ok) {
      skipped.push({ file: name, reason: verdict.reason });
      continue;
    }
    const l = verdict.licence;
    if (!l.seal) {
      skipped.push({ file: name, reason: 'it has no seal: reissue it with --new-seal' });
      continue;
    }
    const recorded = ctx.seals[l.id];
    if (!recorded) {
      skipped.push({ file: name, reason: 'its ID is not in seals.json on this computer' });
      continue;
    }
    if (recorded.seal !== l.seal) {
      skipped.push({ file: name, reason: 'its seal is not the one recorded for ' + l.id + ' (an older file, kept by mistake?)' });
      continue;
    }
    eligible.push({ id: l.id, licensee: l.licensee, seal: l.seal, file: name });
  }
  return { eligible, skipped };
}

/** The repository's record of its releases' blobs, newest first, so old blobs can be removed. */
type History = Record<string, { version: number; blob: string }[]>;
const HISTORY = 'history.json';

function readHistory(dir: string): History {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, HISTORY), 'utf-8')) as History;
  } catch {
    return {};
  }
}

function writeAtomic(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

export type PublishResult = {
  kind: Kind;
  manifest: Manifest;
  newRelease: boolean;
  eligible: Eligible[];
  skipped: Skipped[];
  written: boolean;
};

/**
 * Publishes one kind into a repository folder (a clone, or any folder): `files` is the release's
 * content, or null to keep the current release and only grant it again. Writes nothing on a dry run.
 */
export function publishInto(
  dir: string,
  kind: Kind,
  ctx: PublishContext,
  opts: {
    files: ReadonlyMap<string, Uint8Array> | null;
    /** The bundle's version, which must be the new release's payload (app only). */
    payload?: number;
    rekey?: boolean;
    dryRun?: boolean;
    dropUnknown?: boolean;
    setup?: SetupStep[];
    minApp?: number | null;
    now?: Date;
  },
): PublishResult {
  const seed = seedOf(ctx.privateKeyPem);
  const secret = appSecret(seed);
  try {
    const channel = channelOf(kind, LAUNCHER_API);
    const latestFile = path.join(dir, ...latestPath(kind, LAUNCHER_API).split('/'));
    const previous = fs.existsSync(latestFile) ? openLatest(kind, fs.readFileSync(latestFile, 'utf-8'), ctx.publicKeyPem) : null;
    if (previous && previous.channel !== channel) throw new Error(latestFile + ' is for channel ' + previous.channel + ', not ' + channel + '.');

    const { eligible, skipped } = eligibleLicences(ctx);
    const seals = [...new Set(eligible.map((e) => e.seal))];

    // Grants in the last release that this computer cannot account for: a licence issued elsewhere,
    // whose seal is not in this computer's seals.json. Publishing would lock its learners out.
    if (previous) {
      const known = new Set<string>();
      for (const { seal } of Object.values(ctx.seals)) {
        const kek = kekFor(seal, secret);
        known.add(grantId(kek, previous));
        kek.fill(0);
      }
      for (let n = 0; n < 64; n++) known.add(decoyGrant(seed, previous, n)[0]);
      const unknown = Object.keys(previous.grants).filter((g) => !known.has(g));
      if (unknown.length && !opts.dropUnknown) {
        throw new Error(
          'The last ' + kind + ' release has ' + unknown.length + ' grant(s) for licences this computer has no seal for (issued on ' +
            'another computer?). Bring their seals here with a setup kit, or publish with --drop-unknown to take their access away.',
        );
      }
    }

    // A new release when the content changed (or --rekey); otherwise the same blob, granted again.
    let release = previous?.release ?? null;
    let blob: Buffer | null = null;
    let blobInfo = previous?.blob ?? null;
    let newRelease = !previous || opts.rekey === true;
    let container: Buffer | null = opts.files ? packContainer(opts.files) : null;
    if (!newRelease && container && previous) {
      const old = fs.existsSync(path.join(dir, ...previous.blob.path.split('/'))) ? fs.readFileSync(path.join(dir, ...previous.blob.path.split('/'))) : null;
      let same = false;
      if (old) {
        const key = releaseKey(seed, kind, previous.release.id);
        try {
          same = decryptBlob(key, old, kind, previous.release.id).equals(container);
        } catch {
          same = false;
        } finally {
          key.fill(0);
        }
      }
      newRelease = !same;
    }
    if (newRelease) {
      if (!container) {
        if (!previous) throw new Error('There is no ' + kind + ' release to grant yet: publish ' + kind + ' first.');
        // --rekey with nothing new to publish: the same files under a new key.
        const oldBlob = fs.readFileSync(path.join(dir, ...previous.blob.path.split('/')));
        const key = releaseKey(seed, kind, previous.release.id);
        try {
          container = decryptBlob(key, oldBlob, kind, previous.release.id);
        } finally {
          key.fill(0);
        }
      }
      const payload = opts.payload ?? (previous?.release.payload ?? 0) + 1;
      if (previous && payload <= previous.release.payload && kind === 'app') {
        throw new Error('The bundle is version ' + payload + ', but version ' + previous.release.payload + ' is already published.');
      }
      release = { id: crypto.randomBytes(16).toString('hex'), payload, kek: 1 };
      const key = releaseKey(seed, kind, release.id);
      try {
        blob = encryptBlob(key, container, kind, release.id);
      } finally {
        key.fill(0);
      }
      const hash = sha256(blob);
      blobInfo = { path: 'blobs/' + hash + '.bin', sha256: hash, size: blob.length };
    }

    const now = opts.now ?? new Date();
    const base = {
      format: 1 as const,
      kind,
      channel,
      version: (previous?.version ?? 0) + 1,
      published: now.toISOString().slice(0, 19) + 'Z',
      release: release!,
      blob: blobInfo!,
      grants: {} as Record<string, string>,
      revoked: [...new Set(ctx.revoked)].sort(),
      minApp: kind === 'content' ? (opts.minApp !== undefined ? opts.minApp : previous?.minApp ?? null) : null,
      setup: kind === 'app' ? (opts.setup ?? (newRelease ? [] : previous?.setup ?? [])) : [],
      retired: null,
    };
    const key = releaseKey(seed, kind, base.release.id);
    try {
      for (const seal of seals) {
        const kek = kekFor(seal, secret);
        base.grants[grantId(kek, base)] = wrapGrant(kek, key, base);
        kek.fill(0);
      }
    } finally {
      key.fill(0);
    }
    // Padding, so the number of licences does not show: a multiple of 8, never fewer than 8.
    const total = Math.max(8, Math.ceil(seals.length / 8) * 8);
    for (let n = 0; Object.keys(base.grants).length < total; n++) {
      const [id, value] = decoyGrant(seed, base, n);
      if (!base.grants[id]) base.grants[id] = value;
    }
    const manifest = Manifest.parse(base);
    const latest = signLatest(kind, manifest, ctx.privateKeyPem);

    // Proves it opens, as a launcher opens it, for every licence granted, before anything is written.
    const opened = openLatest(kind, latest, ctx.publicKeyPem);
    const blobBytes = blob ?? fs.readFileSync(path.join(dir, ...manifest.blob.path.split('/')));
    const expected = container ? unpackContainer(container) : null;
    for (const seal of seals) {
      const files = openRelease(opened, blobBytes, seal, secret);
      if (expected && (files.size !== expected.size || [...expected].some(([p, b]) => !files.get(p)?.equals(b)))) {
        throw new Error('The release does not open to what was published. Nothing was written.');
      }
    }

    if (!opts.dryRun) {
      if (blob) writeAtomic(path.join(dir, ...manifest.blob.path.split('/')), blob);
      writeAtomic(latestFile, latest);
      // Old blobs go, once KEEP newer releases no longer name them.
      const history = readHistory(dir);
      const key = latestPath(kind, LAUNCHER_API);
      const list = [{ version: manifest.version, blob: manifest.blob.path }, ...(history[key] ?? [])].slice(0, KEEP * 4);
      history[key] = list;
      const keepBlobs = new Set<string>();
      for (const entries of Object.values(history)) {
        const distinct: string[] = [];
        for (const e of entries) if (!distinct.includes(e.blob)) distinct.push(e.blob);
        for (const b of distinct.slice(0, KEEP)) keepBlobs.add(b);
      }
      const blobs = path.join(dir, 'blobs');
      if (fs.existsSync(blobs)) {
        for (const name of fs.readdirSync(blobs)) if (!keepBlobs.has('blobs/' + name)) fs.rmSync(path.join(blobs, name), { force: true });
      }
      writeAtomic(path.join(dir, HISTORY), JSON.stringify(history, null, 2) + '\n');
    }
    return { kind, manifest, newRelease, eligible, skipped, written: !opts.dryRun };
  } finally {
    seed.fill(0);
    secret.fill(0);
  }
}

// ---------------------------------------------------------------- the repositories

function git(dir: string, args: string[], capture = false): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' }) ?? '';
}

/** The publisher's clone of a repository, up to date with GitHub. */
function clone(kind: Kind): string {
  const repo = distribution()[kind];
  const dir = path.join(DIST_DIR, kind);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    git(DIST_DIR, ['clone', cloneUrl(repo), kind]);
  } else {
    const url = git(dir, ['remote', 'get-url', 'origin'], true).trim();
    if (url !== cloneUrl(repo)) throw new Error(dir + ' is a clone of ' + url + ', not ' + cloneUrl(repo) + '. Move it away and publish again.');
  }
  // An empty repository has no main yet: the first publish makes it.
  const remoteMain = git(dir, ['ls-remote', '--heads', 'origin', 'main'], true).trim();
  if (remoteMain) {
    git(dir, ['fetch', 'origin', 'main']);
    git(dir, ['checkout', '-B', 'main', 'origin/main']);
    git(dir, ['pull', '--ff-only', 'origin', 'main']);
  } else {
    git(dir, ['checkout', '-B', 'main']);
  }
  if (git(dir, ['status', '--porcelain'], true).trim()) throw new Error(dir + ' has changes that are not committed. Look at them, then remove or commit them.');
  return dir;
}

function commitAndPush(dir: string, kind: Kind, m: Manifest, push: boolean): void {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=Evoke Studio Publisher', '-c', 'user.email=publisher@evoketechnologies.invalid', 'commit', '-q', '-m', kind + ' v' + m.version + ' (release ' + m.release.payload + ')']);
  const tag = (kind === 'content' ? 'content' : m.channel) + '-v' + m.version;
  git(dir, ['tag', tag]);
  if (!push) {
    console.log('  Committed and tagged ' + tag + ' in ' + dir + '. Push it with: git -C "' + dir + '" push --follow-tags origin main');
    return;
  }
  git(dir, ['push', '--follow-tags', 'origin', 'main']);
  console.log('  Pushed ' + tag + '.');
}

// ---------------------------------------------------------------- setup steps

/**
 * The setup steps of the next app release (desktop/app-setup.json), with each package's npm tarball
 * added to the release's files under packages/: fetched by npm, checked against the integrity the
 * registry gives, never installed or run here.
 */
function appSetup(files: Map<string, Uint8Array>): SetupStep[] {
  const raw = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'app-setup.json'), 'utf-8')) as { steps?: unknown[] };
  const steps: SetupStep[] = [];
  const work = fs.mkdtempSync(path.join(KEY_DIR, 'packs-'));
  try {
    for (const entry of raw.steps ?? []) {
      const s = entry as { id: string; kind: string; name?: string; version?: string };
      if (s.kind === 'bundle') {
        steps.push({ id: s.id, kind: 'bundle' });
        continue;
      }
      if (s.kind !== 'package' || !s.name || !s.version) throw new Error('app-setup.json: a step is { id, kind: "bundle" } or { id, kind: "package", name, version }.');
      const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      const packed = JSON.parse(
        execFileSync(process.execPath, [npm, 'pack', s.name + '@' + s.version, '--pack-destination', work, '--ignore-scripts', '--json'], {
          cwd: work,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'inherit'],
        }),
      ) as { filename: string; integrity: string; name: string; version: string }[];
      const tgz = fs.readFileSync(path.join(work, path.basename(packed[0].filename)));
      const integrity = 'sha512-' + crypto.createHash('sha512').update(tgz).digest('base64');
      if (integrity !== packed[0].integrity || packed[0].name !== s.name || packed[0].version !== s.version) {
        throw new Error(s.name + '@' + s.version + ' is not what the registry says it is. Nothing was published.');
      }
      const where = 'packages/' + s.name.replace('/', '__') + '-' + s.version + '.tgz';
      files.set(where, tgz);
      steps.push({ id: s.id, kind: 'package', name: s.name, version: s.version, path: where, integrity });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return steps;
}

// ---------------------------------------------------------------- the command

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function report(r: PublishResult): void {
  const m = r.manifest;
  console.log(
    '\n' + (r.kind === 'content' ? 'The course' : 'The app') + ': version ' + m.version + ', release ' + m.release.payload +
      (r.newRelease ? ' (new)' : ' (unchanged, granted again)') + ', ' + Math.round(m.blob.size / 1024) + ' KB' + (r.written ? '' : ' - dry run, nothing written'),
  );
  console.log('  Opens with ' + r.eligible.length + ' licence(s): ' + (r.eligible.map((e) => e.id + ' ' + e.licensee).join(', ') || 'none'));
  for (const s of r.skipped) console.log('  Skipped ' + s.file + ': ' + s.reason);
}

async function main(): Promise<void> {
  const what = process.argv[2];
  if (what !== 'content' && what !== 'app' && what !== 'grants') {
    console.error('Usage: npm run publish -- content|app|grants [--rekey] [--kind content|app] [--dry-run] [--to <folder>] [--no-push] [--drop-unknown]');
    process.exit(1);
  }
  const to = arg('--to');
  const dryRun = process.argv.includes('--dry-run');
  const push = !process.argv.includes('--no-push') && !to;
  const kinds: Kind[] = what === 'grants' ? (arg('--kind') ? [arg('--kind') as Kind] : ['content', 'app']) : [what];
  if (kinds.some((k) => k !== 'content' && k !== 'app')) throw new Error('--kind is content or app.');

  // Code that runs on every learner's computer is published only with a key a passphrase protects.
  if (what === 'app' && !needsPassphrase()) {
    throw new Error('Publishing the app needs the signing key to have a passphrase. Set one first: npm run licence:set-passphrase');
  }
  const publicKeyPem = checkedPublicKey();
  const privateKeyPem = await loadPrivateKey();
  if (keyFingerprint(privateKeyPem) !== EVOKE_KEY_FINGERPRINT) throw new Error("The signing key in " + KEY_DIR + " is not Evoke's key.");
  const ctx: PublishContext = {
    privateKeyPem,
    publicKeyPem,
    licencesDir: LICENCES_DIR,
    seals: fs.existsSync(SEALS_FILE) ? (JSON.parse(fs.readFileSync(SEALS_FILE, 'utf-8')) as Seals) : {},
    revoked: readRevoked().revoked.map((r) => r.fingerprint),
    today: new Date().toISOString().slice(0, 10),
  };

  for (const kind of kinds) {
    const dir = to ? path.resolve(to, kind) : clone(kind);
    fs.mkdirSync(dir, { recursive: true });
    let files: Map<string, Uint8Array> | null = null;
    let payload: number | undefined;
    if (what === 'content') files = contentFiles();
    if (what === 'app') {
      // The bundle carries its version, which is the release's payload: the next one up.
      const latestFile = path.join(dir, ...latestPath('app', LAUNCHER_API).split('/'));
      const previous = fs.existsSync(latestFile) ? openLatest('app', fs.readFileSync(latestFile, 'utf-8'), publicKeyPem) : null;
      payload = (previous?.release.payload ?? 0) + 1;
      const { buildBundle, BUNDLE_FILE } = await import('./build');
      await buildBundle({ release: true, version: payload });
      files = unpackContainer(fs.readFileSync(BUNDLE_FILE));
    }
    const setup = what === 'app' ? appSetup(files!) : undefined;
    const result = publishInto(dir, kind, ctx, { files, payload, setup, rekey: process.argv.includes('--rekey'), dryRun, dropUnknown: process.argv.includes('--drop-unknown') });
    report(result);
    if (!dryRun && !to) commitAndPush(dir, kind, result.manifest, push);
  }
  if (!dryRun) console.log('\nInstalled studios get this at their next start.');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
