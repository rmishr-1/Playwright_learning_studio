/**
 * What the Studio Tools window shows about this computer: read by tools/status.ts (a plain Node
 * script, so it can import the build scripts unchanged) and drawn by the renderer. Types only.
 */

export type Published = {
  version: number;
  payload: number;
  published: string;
  grants: number;
  revoked: number;
};

export type LicenceState = 'eligible' | 'needs-reissue' | 'revoked' | 'skipped';

export type LicenceRow = {
  id: string;
  licensee: string;
  expires: string | null;
  machine: boolean;
  /** The app it opens. */
  app: string;
  state: LicenceState;
  reason?: string;
};

export type Delivery = { artifact: string; builtAt: string; bytes: number };

export type AppRow = {
  code: string;
  name: string;
  licensee: string | null;
  licenceId: string | null;
  licenceFilePresent: boolean;
  deliveries: { standard?: Delivery; full?: Delivery };
};

export type Suggestion = { text: string; job?: string; form?: Record<string, string | boolean> };

export type Status = {
  readAt: string;
  version: string;
  tools: { node: string | null; npm: string | null; strictAllowScripts: boolean; git: string | null };
  packages: { root: boolean; desktop: boolean; electronDist: boolean; nodePty: boolean };
  key: { present: boolean; passphrase: boolean; fingerprintOk: boolean; appSecretCached: boolean; keyDir: string };
  licences: { rows: LicenceRow[]; eligible: number; needsReissue: number; revoked: number };
  apps: AppRow[];
  published: { content: Published | { error: string } | null; app: Published | { error: string } | null; unpushed: { content: number; app: number } };
  github?: { content: Published | { error: string }; app: Published | { error: string } };
  git: { branch: string | null; uncommitted: number; jobFiles: string[]; ahead: number | null; behind: number | null; remote: string | null };
  suggestions: Suggestion[];
  errors: string[];
};
