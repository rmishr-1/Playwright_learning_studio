/**
 * Builds the Studio Tools window into desktop/tools/dist/ (gitignored): the Electron main process
 * and preload (Node, CommonJS; electron and node-pty stay external), and the page (one script and
 * one stylesheet, xterm's CSS included). Fast: esbuild only, no obfuscation, nothing ships.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';

const TOOLS = __dirname;
export const DIST = path.join(TOOLS, 'dist');

export async function buildTools(): Promise<string> {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  await esbuild.build({
    entryPoints: { main: path.join(TOOLS, 'main.ts'), preload: path.join(TOOLS, 'preload.ts') },
    outdir: DIST,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'node-pty'],
    sourcemap: 'inline',
    logLevel: 'warning',
  });
  await esbuild.build({
    entryPoints: { renderer: path.join(TOOLS, 'renderer', 'renderer.ts') },
    outdir: DIST,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
    sourcemap: 'inline',
    logLevel: 'warning',
  });
  fs.copyFileSync(path.join(TOOLS, 'renderer', 'index.html'), path.join(DIST, 'index.html'));
  fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify({ name: 'evoke-studio-tools', private: true, main: 'main.js' }, null, 2) + '\n');
  return DIST;
}

if (require.main === module) {
  buildTools()
    .then((dist) => console.log('Built the Studio Tools window into ' + dist))
    .catch((e) => {
      console.error((e as Error).message);
      process.exitCode = 1;
    });
}
