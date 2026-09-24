/**
 * What a process the studio starts may see and run.
 *
 * The learner's code (a Run, a Terminal command, a check) gets only the environment variables a
 * program needs on Windows, and the browsers need to start, plus what the studio passes itself.
 * Anything else the studio was started with (credentials, tokens, a code-signing certificate in
 * CSC_LINK, cloud keys) stays out: an allowlist, because a list of what to remove always misses one.
 *
 * Windows' own tools are run by their full path: by bare name, Windows looks in the current
 * folder first, where a planted reg.exe or taskkill.exe would run instead.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const KEEP = new Set(
  [
    'ALLUSERSPROFILE',
    'APPDATA',
    'COMMONPROGRAMFILES',
    'COMMONPROGRAMFILES(X86)',
    'COMMONPROGRAMW6432',
    'COMPUTERNAME',
    'COMSPEC',
    'HOMEDRIVE',
    'HOMEPATH',
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'PATH',
    'PATHEXT',
    'PLAYWRIGHT_BROWSERS_PATH',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION',
    'PROGRAMDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMW6432',
    'PUBLIC',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TZ',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
  ].map((k) => k.toUpperCase()),
);

/** The environment for a learner's process: the allowlist above, and what the studio adds. */
export function learnerEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && KEEP.has(key.toUpperCase())) env[key] = value;
  }
  return { ...env, ...extra };
}

/** A program in Windows' System32, by its full path. */
export function systemExe(name: string): string {
  const standard = path.join('C:\\Windows', 'System32', name);
  if (fs.existsSync(standard)) return standard;
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', name);
}
