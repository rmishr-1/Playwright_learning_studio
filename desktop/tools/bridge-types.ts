/** The bridge the page gets (tools/preload.ts), and what crosses it. Types only. */
import type { Status } from './status-types';

export type Form = Record<string, string | boolean>;

export type Info = { root: string; desktop: string; electron: string; windowsBuild: number; builtAt: string };

export type RunResult = { ok: true; commandLine: string } | { error: string };

export type Started = { jobId: string; commandLine: string; startedAt: string };
export type Exited = { jobId: string; code: number; durationMs: number };

export type FileFilter = { name: string; extensions: string[] };
export type PickFile = { mode: 'open' | 'save'; title: string; filters: FileFilter[]; defaultPath?: string };

export type Folder = 'deliveries' | 'licences' | 'key-dir' | 'desktop' | 'root';

export type ToolsApi = {
  info(): Promise<Info>;
  status(): Promise<Status | { error: string }>;
  checkGithub(): Promise<Status['github'] | { error: string }>;
  run(req: { jobId: string; form: Form; cols: number; rows: number }): Promise<RunResult>;
  input(data: string): Promise<void>;
  resize(size: { cols: number; rows: number }): Promise<void>;
  stop(): Promise<void>;
  pickFile(req: PickFile): Promise<string | null>;
  openFolder(req: { what: Folder; code?: string }): Promise<void>;
  onData(fn: (data: string) => void): void;
  onStarted(fn: (s: Started) => void): void;
  onExit(fn: (e: Exited) => void): void;
};
