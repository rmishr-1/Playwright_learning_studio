/**
 * Downloads the course and the studio's code at every start and opens them, in memory
 * (release-format.ts says how they are published). Node only, so the tests run it as it is: the
 * launcher passes in its download function (fetch-session.ts).
 *
 * For each of the two repositories, in this order:
 *
 *   1. latest.json, at most 1 MB; its signature checked for this kind, its manifest parsed strictly
 *   2. its version no lower than the last one this computer accepted: GitHub's cache can serve an
 *      older latest.json for a few minutes, and then the one kept from last time is used instead
 *      (its signature checked again); an older one on purpose (a replay) is refused
 *   3. the app's channel retired, or the course needing a newer app: "install the new version"
 *   4. this licence file withdrawn (the manifest lists withdrawn licences): refused at once
 *   5. this licence's grant: none, and the licence has no access
 *   6. the blob, no larger than the manifest says; its hash; then the grant, the blob, the container
 *   7. the version accepted is recorded, with the signed latest.json (no course in it), so the next
 *      start never goes back
 *
 * Nothing of the course or the code is written anywhere: only the manifests (versions, hashes,
 * wrapped keys) are kept, in <user data>\release-state\.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LIMITS, Manifest, ReleaseError, latestPath, openLatest, openRelease, type Kind } from './release-format';

/** Why a download failed, in words the launch window can act on. */
export class NetworkError extends Error {
  constructor(
    readonly code: 'offline' | 'certificate' | 'rate-limited' | 'not-found' | 'timeout' | 'too-large' | 'refused',
    message: string,
  ) {
    super(message);
  }
}

/** Downloads one file, no larger than max bytes. Throws NetworkError. */
export type Get = (url: string, max: number) => Promise<Buffer>;

export type Opened = {
  content: { manifest: Manifest; files: Map<string, string> };
  app: { manifest: Manifest; files: Map<string, Buffer> };
};

export type ReleaseOptions = {
  /** Where each repository's files are read: https://raw.githubusercontent.com/<owner>/<repo>/main/ */
  base: { content: string; app: string };
  publicKey: string;
  /** The licence's seal, and the fingerprint of its file (licence.ts fingerprint). */
  seal: string;
  licenceFingerprint: string;
  secret: Buffer;
  api: number;
  /** <user data>\release-state */
  stateDir: string;
  get: Get;
  progress?: (text: string) => void;
};

const stateFile = (dir: string, kind: Kind): string => path.join(dir, kind + '-latest.json');

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

/** The manifest this computer accepted last time, if it still verifies. */
function stored(dir: string, kind: Kind, publicKey: string): { text: string; manifest: Manifest } | null {
  try {
    const text = fs.readFileSync(stateFile(dir, kind), 'utf-8');
    return { text, manifest: openLatest(kind, text, publicKey) };
  } catch {
    return null;
  }
}

/** The manifest to use for one kind: steps 1 and 2. */
async function manifestFor(kind: Kind, o: ReleaseOptions): Promise<{ text: string; manifest: Manifest }> {
  const url = o.base[kind] + latestPath(kind, o.api);
  // A query of its own makes GitHub's cache fetch the file again rather than serve its copy.
  const text = (await o.get(url + '?t=' + Date.now().toString(36), LIMITS.latest)).toString('utf-8');
  const fresh = { text, manifest: openLatest(kind, text, o.publicKey) };
  if (fresh.manifest.channel !== (kind === 'content' ? 'content' : 'api-' + o.api)) {
    throw new ReleaseError('format', 'The release index is for another version of the studio.');
  }
  const last = stored(o.stateDir, kind, o.publicKey);
  if (last && fresh.manifest.version < last.manifest.version) {
    // GitHub's cache, a few minutes behind: the one accepted before is newer, and still signed.
    if (last.manifest.channel !== fresh.manifest.channel) throw new ReleaseError('rollback', 'The release index is older than the one this computer has seen.');
    return last;
  }
  return fresh;
}

/** Downloads and opens the app's code, then the course. Throws ReleaseError or NetworkError. */
export async function openReleases(o: ReleaseOptions): Promise<Opened> {
  const opened: Partial<Opened> = {};
  const accepted: { kind: Kind; text: string }[] = [];
  for (const kind of ['app', 'content'] as Kind[]) {
    o.progress?.(kind === 'app' ? 'Checking for the latest version of the studio' : 'Checking for the latest course');
    const { text, manifest } = await manifestFor(kind, o);
    if (manifest.retired) throw new ReleaseError('retired', manifest.retired.message);
    if (manifest.revoked.includes(o.licenceFingerprint)) throw new ReleaseError('withdrawn', 'This licence has been withdrawn by Evoke.');
    if (kind === 'content' && manifest.minApp !== null && opened.app && opened.app.manifest.release.payload < manifest.minApp) {
      throw new ReleaseError('too-old', 'The course needs a newer version of the studio than this one.');
    }
    o.progress?.(kind === 'app' ? 'Downloading the studio' : 'Downloading the course');
    // Before downloading anything large: no grant, no access (openRelease checks again).
    if (!Object.keys(manifest.grants).length) throw new ReleaseError('no-access', 'This licence has no access.');
    if (manifest.blob.size > LIMITS.blob[kind]) throw new ReleaseError('format', 'The release is larger than this studio accepts.');
    const blob = await o.get(o.base[kind] + manifest.blob.path, manifest.blob.size);
    o.progress?.(kind === 'app' ? 'Opening the studio' : 'Opening the course');
    const files = openRelease(manifest, blob, o.seal, o.secret);
    if (kind === 'app') opened.app = { manifest, files };
    else opened.content = { manifest, files: new Map([...files].map(([p, b]) => [p, b.toString('utf-8')])) };
    accepted.push({ kind, text });
  }
  // Recorded only once both opened: a start that failed half-way changes nothing.
  for (const a of accepted) writeAtomic(stateFile(o.stateDir, a.kind), a.text);
  return opened as Opened;
}

/** The latest day a published release names (YYYY-MM-DD): no licence check counts a day before it. */
export const publishedDay = (o: Opened): string =>
  [o.app.manifest.published, o.content.manifest.published].map((p) => p.slice(0, 10)).reduce((a, b) => (b > a ? b : a));
