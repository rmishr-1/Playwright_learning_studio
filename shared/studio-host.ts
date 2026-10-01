/**
 * The contract between the desktop launcher (the installed .exe: desktop/src/main.ts) and the
 * studio's code bundle it downloads at every launch (backend/src/studio-app.ts: the backend and the
 * page). The bundle is published to the app repository on its channel for one launcher API, so a
 * launcher only ever runs a bundle written for it.
 *
 * Bump LAUNCHER_API for any change to these types, to what the launcher's environment provides
 * (desktop/src/env.ts: the variables, Node, Playwright, the browsers), or to the release format. A
 * new API means a new installer; the previous channel keeps serving the launchers already installed
 * until it is retired.
 */
export const LAUNCHER_API = 1;

export type StudioHostV1 = {
  api: 1;
  /** A release build: no developer tools, no overrides. */
  release: boolean;
  launcher: { product: string; appId: string; version: string; built: string };
  /** Who the studio is licensed to. Never the licence's seal: the bundle cannot open a release. */
  licence: { id: string; licensee: string; logo: string | null; expires: string | null };
  /** The course, downloaded and decrypted for this launch: path under Data/Content -> text. */
  content: { version: number; published: string; files: ReadonlyMap<string, string> };
  /** The page's built files (index.html, assets/...). */
  web: ReadonlyMap<string, Uint8Array>;
  /** The secret only the studio's window holds, for every API request. */
  token: string;
  /** The port to try first; 0 lets the system choose. */
  port: number;
  log(level: 'info' | 'warn' | 'error', message: string): void;
};

/** What a setup step of the bundle's may use: no server, no page. */
export type StudioSetupHostV1 = Omit<StudioHostV1, 'token' | 'port' | 'web'> & { progress(text: string): void };

export type RunningStudio = {
  /** The port the studio's server listens on, on 127.0.0.1. */
  port: number;
  /** Stops the server, every run and every Terminal command. */
  stop(): Promise<void>;
};

export type StudioBundleV1 = {
  api: 1;
  /** The bundle's own counter; it equals the app manifest's release.payload. */
  version: number;
  start(host: StudioHostV1): Promise<RunningStudio>;
  /** One-time setup functions, named by the app manifest's 'bundle' setup steps. */
  setup: Record<string, (host: StudioSetupHostV1) => Promise<void>>;
};
