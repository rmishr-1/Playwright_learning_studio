/**
 * Windows' own tools, by their full path: by bare name, Windows looks in the current folder first,
 * where a planted reg.exe or taskkill.exe would run instead.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A program in Windows' System32, by its full path. */
export function systemExe(name: string): string {
  const standard = path.join('C:\\Windows', 'System32', name);
  if (fs.existsSync(standard)) return standard;
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', name);
}
