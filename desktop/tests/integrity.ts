/**
 * The start-up checks of the files outside app.asar (src/integrity.ts), in plain Node: an app.asar
 * made the way electron-builder makes one, with files unpacked beside it, and a runtime piece laid
 * out as runtime-install.ts installs one; each changed the ways someone might change them. Then, when
 * they are there, the real thing: desktop/release/win-unpacked (npm run package) and desktop/runtime
 * (npm run runtime) must pass as they are.
 *
 *   npm run test:integrity     (in desktop/; seconds)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as asar from '@electron/asar';
import { checkRuntimePiece, checkUnpacked, runtimeFilesFrom } from '../src/integrity';

const DESKTOP = path.resolve(__dirname, '..');

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}

const write = (file: string, text: string | Buffer): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const sha = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');

async function main(): Promise<void> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-integrity-test-'));
  try {
    // ---------------------------------------------------------------- app.asar.unpacked
    const src = path.join(work, 'app');
    write(path.join(src, 'main.js'), 'the launcher');
    write(path.join(src, 'node_modules', 'pkg', 'package.json'), '{"name":"pkg","main":"index.js"}');
    write(path.join(src, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;');
    write(path.join(src, 'node_modules', 'pkg', 'lib', 'deep.js'), 'module.exports = 2;');
    const asarFile = path.join(work, 'resources', 'app.asar');
    fs.mkdirSync(path.dirname(asarFile), { recursive: true });
    await asar.createPackageWithOptions(src, asarFile, { unpack: '**/node_modules/**' });
    const unpacked = asarFile + '.unpacked';
    const index = path.join(unpacked, 'node_modules', 'pkg', 'index.js');

    expect((await checkUnpacked(fs, asarFile)) === null, 'unpacked packages as built pass');

    fs.writeFileSync(index, 'module.exports = 3;');
    expect((await checkUnpacked(fs, asarFile)) === 'node_modules/pkg/index.js', 'a file changed to the same size is found');
    fs.writeFileSync(index, 'require("child_process").exec("calc"); module.exports = 1;');
    expect((await checkUnpacked(fs, asarFile)) === 'node_modules/pkg/index.js', 'a file changed to another size is found');
    fs.writeFileSync(index, 'module.exports = 1;');
    expect((await checkUnpacked(fs, asarFile)) === null, 'put back, it passes again');

    write(path.join(unpacked, 'node_modules', 'pkg', 'index.node'), 'a planted add-on');
    expect((await checkUnpacked(fs, asarFile)) === 'node_modules/pkg/index.node', 'a file added beside them is found');
    fs.rmSync(path.join(unpacked, 'node_modules', 'pkg', 'index.node'));

    fs.rmSync(path.join(unpacked, 'node_modules', 'pkg', 'lib', 'deep.js'));
    expect((await checkUnpacked(fs, asarFile)) === 'node_modules/pkg/lib/deep.js', 'a file removed is found');
    fs.rmSync(unpacked, { recursive: true });
    expect((await checkUnpacked(fs, asarFile)) !== null, 'the whole folder removed is found');

    // ---------------------------------------------------------------- a runtime piece
    const runtime = path.join(work, 'runtime');
    const exe = 'Mozilla Firefox' + '/firefox.exe';
    write(path.join(runtime, 'ms-playwright', 'fake-7', exe), 'a browser');
    write(path.join(runtime, 'ms-playwright', 'fake-7', 'Mozilla Firefox', 'xul.dll'), 'its library');
    write(path.join(runtime, 'node', 'node.exe'), 'a node');
    const manifest = filesIn(runtime)
      .map((f) => sha(fs.readFileSync(path.join(runtime, ...f.split('/')))) + '  ' + f)
      .join('\n');
    const files = runtimeFilesFrom(runtime, manifest + '\n' + sha('x') + '  .studio/node.verified\n');
    expect(Object.keys(files).sort().join() === 'fake-7,node', 'the manifest gives one entry per piece, and none for the markers', Object.keys(files).join());
    expect(files['fake-7'].files[exe].length === 2 && files['fake-7'].files['Mozilla Firefox/xul.dll'].length === 1, 'programs are hashed, other files sized');
    const piece = files['fake-7'];
    const dll = path.join(runtime, 'ms-playwright', 'fake-7', 'Mozilla Firefox', 'xul.dll');

    expect((await checkRuntimePiece(fs, runtime, piece)) === null, 'a piece as installed passes');
    expect((await checkRuntimePiece(fs, runtime, files.node)) === null, 'Node as installed passes');

    fs.writeFileSync(path.join(runtime, 'ms-playwright', 'fake-7', exe), 'a brOwser');
    expect((await checkRuntimePiece(fs, runtime, piece)) === 'ms-playwright/fake-7/' + exe, 'a program changed to the same size is found');
    fs.writeFileSync(path.join(runtime, 'ms-playwright', 'fake-7', exe), 'a browser');
    fs.writeFileSync(path.join(runtime, 'node', 'node.exe'), 'a nodE');
    expect((await checkRuntimePiece(fs, runtime, files.node)) === 'node/node.exe', 'node.exe changed is found');
    fs.writeFileSync(path.join(runtime, 'node', 'node.exe'), 'a node');

    fs.writeFileSync(dll, 'its library, changed');
    expect((await checkRuntimePiece(fs, runtime, piece)) === 'ms-playwright/fake-7/Mozilla Firefox/xul.dll', 'a library changed to another size is found');
    fs.writeFileSync(dll, 'its librarY');
    expect((await checkRuntimePiece(fs, runtime, piece)) === null, 'a library changed to the same size is not (the quick check: sizes only)');
    fs.writeFileSync(dll, 'its library');

    write(path.join(runtime, 'ms-playwright', 'fake-7', 'Mozilla Firefox', 'version.dll'), 'a planted library');
    expect((await checkRuntimePiece(fs, runtime, piece)) === 'ms-playwright/fake-7/Mozilla Firefox/version.dll', 'a library placed beside a program is found');
    fs.rmSync(path.join(runtime, 'ms-playwright', 'fake-7', 'Mozilla Firefox', 'version.dll'));
    write(path.join(runtime, 'node', 'node.exe.local', 'x'), 'a DLL redirection folder');
    expect((await checkRuntimePiece(fs, runtime, files.node)) === 'node/node.exe.local/x', 'a .local redirection beside node.exe is found');
    fs.rmSync(path.join(runtime, 'node', 'node.exe.local'), { recursive: true });

    write(path.join(runtime, 'ms-playwright', 'fake-7', 'Mozilla Firefox', 'debug.log'), 'a log the browser wrote');
    expect((await checkRuntimePiece(fs, runtime, piece)) === null, 'a log the browser wrote is allowed');
    fs.rmSync(path.join(runtime, 'ms-playwright', 'fake-7'), { recursive: true });
    expect((await checkRuntimePiece(fs, runtime, piece)) === 'ms-playwright/fake-7', 'a piece removed is found');

    // ---------------------------------------------------------------- the real files, when built
    const shipped = path.join(DESKTOP, 'release', 'win-unpacked', 'resources', 'app.asar');
    if (fs.existsSync(shipped)) {
      const started = Date.now();
      const wrong = await checkUnpacked(fs, shipped);
      expect(wrong === null, 'release/win-unpacked: the shipped packages pass', (wrong ?? Date.now() - started + ' ms'));
    } else console.log('skip  release/win-unpacked (npm run package)');

    const realRuntime = path.join(DESKTOP, 'runtime');
    const realManifest = path.join(realRuntime, 'MANIFEST.sha256');
    if (fs.existsSync(realManifest)) {
      const real = runtimeFilesFrom(realRuntime, fs.readFileSync(realManifest, 'utf-8'));
      const started = Date.now();
      let wrong: string | null = null;
      for (const p of Object.values(real)) wrong ??= await checkRuntimePiece(fs, realRuntime, p);
      expect(wrong === null, 'desktop/runtime: Node and the browsers pass', (wrong ?? Date.now() - started + ' ms') + ', ' + Object.keys(real).length + ' pieces');
      expect(JSON.stringify(real).length < 200_000, 'runtime-files.json stays small', JSON.stringify(real).length + ' bytes');
      expect(real.node.files['node.exe'].length === 2, 'node.exe is hashed at every start');
      const unhashed = Object.values(real).flatMap((p) => Object.entries(p.files).filter(([f, v]) => /\.exe$/i.test(f) && v.length === 1).map(([f]) => f));
      expect(unhashed.length <= 1, 'every program but the headless shell is hashed', unhashed.join(', '));
    } else console.log('skip  desktop/runtime (npm run runtime)');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(failures ? '\n' + failures + ' failed' : '\nall passed');
  process.exit(failures ? 1 : 0);
}

function filesIn(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name],
  );
}

void main();
