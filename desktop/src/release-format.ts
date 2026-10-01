/**
 * The release format: how the course and the studio's code are published to GitHub, encrypted, and
 * how the launcher opens them. Shared by the launcher (desktop/src/release.ts) and the publisher
 * (desktop/scripts/publish.ts), so both sides cannot drift. Node only (node:crypto, node:zlib): no
 * Electron, so the publisher and the tests use it as it is.
 *
 * A distribution repository (public: everything in it is encrypted and signed) holds
 *
 *   latest.json              { manifest: base64(bytes), signature: base64(Ed25519) }
 *   blobs/<sha256>.bin       an encrypted release, named by its own hash
 *
 * (the app repository: channels/api-<LAUNCHER_API>/latest.json, one channel per launcher API).
 *
 * The manifest is signed with Evoke's key - the licence key - over a prefix naming its kind and the
 * manifest's exact bytes, so a content manifest can never pass for an app manifest, and neither for
 * a licence (whose signed bytes start '{'). It names the blob by hash and size, and carries one
 * grant per licence that may open it.
 *
 * Keys. Nothing new is stored: everything is derived from Evoke's private key (its Ed25519 seed).
 *
 *   APP_SECRET = HKDF(seed, 'evoke-studio/app-secret/v1')         built into every launcher
 *   K          = HKDF(seed, 'release-key/v1' kind release.id)      one per release; the publisher can
 *                                                                  add a grant later without storing it
 *   KEK        = HKDF(ikm = licence seal, salt = APP_SECRET)       so opening a release takes the
 *                                                                  licence AND the app
 *   grantId    = HMAC(KEK, 'grant-id/v1' kind channel release.id)  names no licence, and changes with
 *                                                                  every release
 *   grant      = AES-256-GCM(KEK, K),  AAD = kind, channel, release.id, blob hash
 *   blob       = 'SEB1' iv tag AES-256-GCM(K, gzip(container)),  AAD = kind, release.id
 *   container  = 'SBX1' u32le(header length) {"files":[{path,size}]} bytes...
 */
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { z } from 'zod';

export type Kind = 'content' | 'app';

/** The one format this launcher reads. */
export const FORMAT = 1;
/** Which KEK derivation a release uses: a new one comes with a new installer. */
export const KEK_VERSION = 1;

/** The most a latest.json, a blob, or what a blob unpacks to, may be. */
export const LIMITS = {
  latest: 1024 * 1024,
  blob: { content: 32 * 1024 * 1024, app: 96 * 1024 * 1024 } as Record<Kind, number>,
  unpacked: { content: 128 * 1024 * 1024, app: 256 * 1024 * 1024 } as Record<Kind, number>,
  files: 4000,
};

const SIGN_PREFIX: Record<Kind, string> = {
  content: 'evoke-studio/content-manifest/v1\n',
  app: 'evoke-studio/app-manifest/v1\n',
};

/** Why a release could not be opened. The launcher turns the code into words the learner can act on. */
export class ReleaseError extends Error {
  constructor(
    readonly code: 'signature' | 'format' | 'rollback' | 'no-access' | 'withdrawn' | 'hash' | 'decrypt' | 'retired' | 'too-old',
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- the manifest

const HEX64 = /^[0-9a-f]{64}$/;
/** A container path: plain, relative, forward slashes, no climbing out. */
const CONTAINER_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_][\w.@+~-]*(?:\/[\w.@+~-]+)*$/;

export const SetupStep = z.discriminatedUnion('kind', [
  /** Runs a setup function the app bundle exports (StudioBundleV1.setup), such as a migration. */
  z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/), kind: z.literal('bundle') }).strict(),
  /**
   * An npm package the learner's code needs, inside the app blob as its npm tarball (path), checked
   * against its npm integrity, unpacked into the workspaces' node_modules.
   */
  z
    .object({
      id: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/),
      kind: z.literal('package'),
      name: z.string().regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/),
      version: z.string().regex(/^\d+\.\d+\.\d+[\w.+-]*$/),
      path: z.string().regex(CONTAINER_PATH),
      integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
    })
    .strict(),
]);
export type SetupStep = z.infer<typeof SetupStep>;

export const Manifest = z
  .object({
    format: z.literal(FORMAT),
    kind: z.enum(['content', 'app']),
    /** 'content', or 'api-<n>' for the app repository's channel for launcher API n. */
    channel: z.string().regex(/^(content|api-\d{1,4})$/),
    /** Rises with every publish, a grant-only one too. A launcher never goes back to a lower one. */
    version: z.number().int().min(1),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    release: z
      .object({
        id: z.string().regex(/^[0-9a-f]{32}$/),
        /** The release's own counter: changes only when the blob does (the app bundle's version). */
        payload: z.number().int().min(1),
        kek: z.literal(KEK_VERSION),
      })
      .strict(),
    blob: z
      .object({ path: z.string().regex(/^blobs\/[0-9a-f]{64}\.bin$/), sha256: z.string().regex(HEX64), size: z.number().int().min(1) })
      .strict()
      .refine((b) => b.path === 'blobs/' + b.sha256 + '.bin', { message: 'the blob is named by its hash' }),
    grants: z.record(z.string().regex(/^[A-Za-z0-9_-]{22}$/), z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(200)),
    /** Licence files Evoke has withdrawn (licence fingerprints): a launcher refuses them at once. */
    revoked: z.array(z.string().regex(HEX64)).max(10_000),
    /** Content only: the lowest app payload that reads this content. */
    minApp: z.number().int().min(1).nullable(),
    /** App only: one-time setup the bundle needs. */
    setup: z.array(SetupStep).max(50),
    /** App only: this channel is closed; its launchers must be replaced. The message says how. */
    retired: z.object({ message: z.string().max(500) }).strict().nullable(),
  })
  .strict();
export type Manifest = z.infer<typeof Manifest>;

const Latest = z
  .object({
    manifest: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(LIMITS.latest),
    // An Ed25519 signature in standard base64, written the one way Node writes it (as licences are).
    signature: z.string().regex(/^[A-Za-z0-9+/]{85}[AQgw]==$/),
  })
  .strict();

/** A signed latest.json for these manifest bytes. */
export function signLatest(kind: Kind, manifest: Manifest, privateKeyPem: string): string {
  const bytes = Buffer.from(JSON.stringify(Manifest.parse(manifest)), 'utf-8');
  const signature = crypto.sign(null, Buffer.concat([Buffer.from(SIGN_PREFIX[kind], 'utf-8'), bytes]), crypto.createPrivateKey(privateKeyPem));
  return JSON.stringify({ manifest: bytes.toString('base64'), signature: signature.toString('base64') }, null, 2) + '\n';
}

/**
 * The manifest in a latest.json, once its signature verifies for this kind. Throws ReleaseError: a
 * file that is not one ('format'), or one Evoke's key did not sign as this kind ('signature').
 */
export function openLatest(kind: Kind, text: string, publicKeyPem: string): Manifest {
  let latest: z.infer<typeof Latest>;
  try {
    latest = Latest.parse(JSON.parse(text));
  } catch {
    throw new ReleaseError('format', 'The release index is not in the expected format.');
  }
  const bytes = Buffer.from(latest.manifest, 'base64');
  const signed = Buffer.concat([Buffer.from(SIGN_PREFIX[kind], 'utf-8'), bytes]);
  let ok = false;
  try {
    ok = crypto.verify(null, signed, crypto.createPublicKey(publicKeyPem), Buffer.from(latest.signature, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new ReleaseError('signature', 'The release is not signed by Evoke.');
  let manifest: Manifest;
  try {
    manifest = Manifest.parse(JSON.parse(bytes.toString('utf-8')));
  } catch {
    throw new ReleaseError('format', 'The release index is not in the expected format.');
  }
  if (manifest.kind !== kind) throw new ReleaseError('format', 'The release index is for the ' + manifest.kind + ', not the ' + kind + '.');
  return manifest;
}

// ---------------------------------------------------------------- keys

const hkdf = (ikm: Buffer, salt: Buffer, info: string): Buffer => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf-8'), 32));

/** The Ed25519 private key's 32-byte seed: the one form of it that does not depend on how the PEM was written. */
export function seedOf(privateKeyPem: string): Buffer {
  const jwk = crypto.createPrivateKey(privateKeyPem).export({ format: 'jwk' }) as { d?: string; crv?: string };
  if (jwk.crv !== 'Ed25519' || !jwk.d) throw new Error('The signing key is not an Ed25519 key.');
  return Buffer.from(jwk.d, 'base64url');
}

/** The secret every launcher carries: half of what opens a release (the licence's seal is the other). */
export const appSecret = (seed: Buffer): Buffer => hkdf(seed, Buffer.alloc(0), 'evoke-studio/app-secret/v1');

/** How a launcher build pins the secret it was given: its hash, never the secret. */
export const appSecretFingerprint = (secret: Buffer): string => crypto.createHash('sha256').update('evoke-studio/app-secret-fingerprint/v1\0').update(secret).digest('hex');

/** A release's key. Publisher only: it needs the private key. */
export const releaseKey = (seed: Buffer, kind: Kind, releaseId: string): Buffer =>
  hkdf(seed, Buffer.alloc(0), 'evoke-studio/release-key/v1\0' + kind + '\0' + releaseId);

/** The key that opens a licence's grants: its seal, and the app's secret. */
export function kekFor(seal: string, secret: Buffer): Buffer {
  if (!/^[0-9a-f]{64}$/.test(seal)) throw new ReleaseError('no-access', 'This licence has no seal, so it cannot open the course.');
  return hkdf(Buffer.from(seal, 'hex'), secret, 'evoke-studio/kek/v1');
}

/** Where a licence's grant is, in one release's manifest. */
export const grantId = (kek: Buffer, m: Pick<Manifest, 'kind' | 'channel' | 'release'>): string =>
  crypto
    .createHmac('sha256', kek)
    .update('evoke-studio/grant-id/v1\0' + m.kind + '\0' + m.channel + '\0' + m.release.id)
    .digest('base64url')
    .slice(0, 22);

const grantAad = (m: Pick<Manifest, 'kind' | 'channel' | 'release' | 'blob'>): Buffer =>
  Buffer.from(JSON.stringify(['evoke-studio/grant/v1', m.kind, m.channel, m.release.id, m.blob.sha256]), 'utf-8');

export function wrapGrant(kek: Buffer, key: Buffer, m: Pick<Manifest, 'kind' | 'channel' | 'release' | 'blob'>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  cipher.setAAD(grantAad(m));
  const body = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** A grant that is random bytes of the right length: padding, so the number of licences does not show. */
export const decoyGrant = (): [string, string] => [crypto.randomBytes(17).toString('base64url').slice(0, 22), crypto.randomBytes(60).toString('base64')];

/** The release key, from this licence's grant. Throws 'no-access' when there is none, or it does not open. */
export function unwrapGrant(kek: Buffer, m: Manifest): Buffer {
  const grant = m.grants[grantId(kek, m)];
  if (!grant) throw new ReleaseError('no-access', 'This licence has no access to this release.');
  const raw = Buffer.from(grant, 'base64');
  if (raw.length !== 12 + 16 + 32) throw new ReleaseError('no-access', 'This licence has no access to this release.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12));
    decipher.setAAD(grantAad(m));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  } catch {
    throw new ReleaseError('no-access', 'This licence has no access to this release.');
  }
}

// ---------------------------------------------------------------- the blob

const BLOB = Buffer.from('SEB1', 'latin1');
const blobAad = (kind: Kind, releaseId: string): Buffer => Buffer.from(JSON.stringify(['evoke-studio/blob/v1', kind, releaseId]), 'utf-8');

export function encryptBlob(key: Buffer, container: Buffer, kind: Kind, releaseId: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(blobAad(kind, releaseId));
  const body = Buffer.concat([cipher.update(zlib.gzipSync(container, { level: 9 })), cipher.final()]);
  return Buffer.concat([BLOB, iv, cipher.getAuthTag(), body]);
}

export function decryptBlob(key: Buffer, blob: Buffer, kind: Kind, releaseId: string): Buffer {
  if (blob.length < 32 || !blob.subarray(0, 4).equals(BLOB)) throw new ReleaseError('decrypt', 'The release is damaged.');
  let zipped: Buffer;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(4, 16));
    decipher.setAAD(blobAad(kind, releaseId));
    decipher.setAuthTag(blob.subarray(16, 32));
    zipped = Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]);
  } catch {
    throw new ReleaseError('decrypt', 'The release could not be opened.');
  }
  try {
    return zlib.gunzipSync(zipped, { maxOutputLength: LIMITS.unpacked[kind] });
  } catch {
    throw new ReleaseError('decrypt', 'The release is damaged.');
  }
}

export const sha256 = (data: Buffer): string => crypto.createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------- the container

const CONTAINER = Buffer.from('SBX1', 'latin1');

/** Files, by path, in one buffer. Binary-safe: the page has fonts and images. */
export function packContainer(files: ReadonlyMap<string, Uint8Array>): Buffer {
  const list = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [p] of list) if (!CONTAINER_PATH.test(p)) throw new Error('A file cannot be published under the path "' + p + '".');
  const header = Buffer.from(JSON.stringify({ files: list.map(([p, data]) => ({ path: p, size: data.byteLength })) }), 'utf-8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  return Buffer.concat([CONTAINER, length, header, ...list.map(([, data]) => Buffer.from(data))]);
}

/** The files in a container, every path and size checked. */
export function unpackContainer(data: Buffer): Map<string, Buffer> {
  const bad = (): never => {
    throw new ReleaseError('decrypt', 'The release is damaged.');
  };
  if (data.length < 8 || !data.subarray(0, 4).equals(CONTAINER)) bad();
  const headerLength = data.readUInt32LE(4);
  if (headerLength > 4 * 1024 * 1024 || 8 + headerLength > data.length) bad();
  let header: { files?: unknown };
  try {
    header = JSON.parse(data.subarray(8, 8 + headerLength).toString('utf-8')) as { files?: unknown };
  } catch {
    return bad();
  }
  const entries = z
    .array(z.object({ path: z.string().regex(CONTAINER_PATH).max(300), size: z.number().int().min(0) }).strict())
    .max(LIMITS.files)
    .safeParse(header.files);
  if (!entries.success) bad();
  const files = new Map<string, Buffer>();
  let at = 8 + headerLength;
  for (const e of entries.data!) {
    if (files.has(e.path) || at + e.size > data.length) bad();
    files.set(e.path, data.subarray(at, at + e.size));
    at += e.size;
  }
  if (at !== data.length) bad();
  return files;
}

/** Text files of a container, as text (the course). */
export const asText = (files: ReadonlyMap<string, Buffer>): Map<string, string> =>
  new Map([...files.entries()].map(([p, b]) => [p, b.toString('utf-8')]));
