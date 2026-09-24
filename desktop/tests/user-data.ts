/**
 * The tests run the app with licences of their own, in the app's data folder. That folder may
 * hold a real installation's licence and agreement, so it is moved aside while a test runs and put
 * back when it ends, however it ends.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

export function keepUserData(dir: string, exeName: string): void {
  const running = execFileSync('tasklist', ['/FI', 'IMAGENAME eq ' + exeName, '/NH'], { encoding: 'utf-8' });
  if (running.toLowerCase().includes(exeName.toLowerCase())) {
    console.error('Close ' + exeName.replace(/\.exe$/i, '') + ' first: the test uses its data folder.');
    process.exit(1);
  }
  const backup = dir + '.before-test';
  if (fs.existsSync(backup)) {
    // A test that was killed before it could put the folder back: put it back now.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.renameSync(backup, dir);
  }
  if (fs.existsSync(dir)) fs.renameSync(dir, backup);
  const restore = (): void => {
    if (!fs.existsSync(backup)) return;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.renameSync(backup, dir);
  };
  process.on('exit', restore);
  process.on('SIGINT', () => process.exit(130));
}
