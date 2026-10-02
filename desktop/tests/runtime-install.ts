/**
 * The runtime installer (src/runtime-install.ts), in plain Node, against a local server serving
 * small zips made with Windows' own tar.exe: what a standard build's first start does with Node and
 * the browsers, and everything that must refuse.
 *
 *   npm run test:runtime     (in desktop/; seconds)
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { systemExe } from '../../backend/src/system-exe';
import { RuntimeError, ensureRuntime, installPiece, isInstalled, pieceDir, type RuntimePiece } from '../src/runtime-install';
import { buildMachineDownload } from '../scripts/runtime';

let failures = 0;
function expect(ok: boolean, what: string, detail = ''): void {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + what + (detail ? '  (' + detail + ')' : ''));
}
async function rejects(p: Promise<unknown>, code: string, what: string): Promise<string> {
  try {
    await p;
    expect(false, what, 'did not throw');
    return '';
  } catch (e) {
    const got = e instanceof RuntimeError ? e.code : (e as Error).message;
    expect(got === code, what, e instanceof RuntimeError ? e.message : got);
    return (e as Error).message;
  }
}

async function main(): Promise<void> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-runtime-test-'));
  const tar = systemExe('tar.exe');

  // Two pieces, made as the official archives are: a browser zip with its own top folder, and a
  // Node zip with node.exe, LICENSE and npm's package.json under node-v<version>-win-x64/.
  const src = path.join(work, 'src');
  fs.mkdirSync(path.join(src, 'browser', 'fake-win64', 'locales'), { recursive: true });
  fs.writeFileSync(path.join(src, 'browser', 'fake-win64', 'fake.exe'), 'a browser');
  fs.writeFileSync(path.join(src, 'browser', 'fake-win64', 'locales', 'en.pak'), 'english');
  const nodeTop = 'node-v1.2.3-win-x64';
  fs.mkdirSync(path.join(src, 'node', nodeTop, 'node_modules', 'npm'), { recursive: true });
  fs.writeFileSync(path.join(src, 'node', nodeTop, 'node.exe'), 'a node');
  fs.writeFileSync(path.join(src, 'node', nodeTop, 'LICENSE'), 'the licence');
  fs.writeFileSync(path.join(src, 'node', nodeTop, 'node_modules', 'npm', 'package.json'), '{"name":"npm","version":"9.8.7"}');
  fs.writeFileSync(path.join(src, 'node', nodeTop, 'npx.cmd'), 'not wanted');
  const served = path.join(work, 'served');
  fs.mkdirSync(served);
  execFileSync(tar, ['-a', '-cf', path.join(served, 'fake_browser-7.zip'), '-C', path.join(src, 'browser'), 'fake-win64']);
  execFileSync(tar, ['-a', '-cf', path.join(served, 'node.zip'), '-C', path.join(src, 'node'), nodeTop]);

  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? '');
    const file = path.join(served, path.basename(req.url ?? ''));
    if (!(req.url ?? '').startsWith('/good/') || !fs.existsSync(file)) return void res.writeHead(404).end();
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'content-length': data.length }).end(data);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/';
  const download = buildMachineDownload(null, true, [base]);
  // The first address is missing, as an unreachable mirror is: the next one is tried.
  const urls = (name: string): string[] => [base + 'missing/' + name + '.zip', base + 'good/' + name + '.zip'];

  console.log('Pinning');
  const unknown = { size: 0, sha256: '', tree: '', unpacked: 0 };
  const loose: RuntimePiece[] = [
    { name: 'node', kind: 'node', urls: urls('node'), exe: 'node.exe', archiveRoot: nodeTop, ...unknown },
    { name: 'fake_browser-7', kind: 'browser', urls: urls('fake_browser-7'), exe: 'fake-win64/fake.exe', ...unknown },
  ];
  const pinRoot = path.join(work, 'pin');
  const pieces: RuntimePiece[] = [];
  for (const p of loose) pieces.push({ ...p, ...(await installPiece(pinRoot, p, download, { pin: true })) });
  expect(pieces.every((p) => p.size > 0 && /^[0-9a-f]{64}$/.test(p.sha256) && /^[0-9a-f]{64}$/.test(p.tree) && p.unpacked > 0), 'pinning measures each archive and the folder it unpacks to');

  console.log('\nA first start');
  const root = path.join(work, 'root');
  const progress: number[] = [];
  const first = await ensureRuntime(root, pieces, download, { onProgress: (p) => progress.push(p.done) });
  expect(first.installed.join() === 'node,fake_browser-7', 'both pieces are installed', first.installed.join());
  const node = pieceDir(root, pieces[0]);
  expect(fs.readdirSync(node).sort().join() === 'LICENSE,node.exe,npm-version.txt', 'Node: its program, its licence and its npm version, nothing else', fs.readdirSync(node).join());
  expect(fs.readFileSync(path.join(node, 'npm-version.txt'), 'utf-8') === '9.8.7\n', 'npm\'s version is taken from the archive');
  const browser = pieceDir(root, pieces[1]);
  expect(
    fs.readFileSync(path.join(browser, 'fake-win64', 'fake.exe'), 'utf-8') === 'a browser' && fs.existsSync(path.join(browser, 'INSTALLATION_COMPLETE')) && fs.existsSync(path.join(browser, 'DEPENDENCIES_VALIDATED')),
    'the browser is laid out as Playwright lays it out, with its markers',
  );
  expect(requests.some((r) => r.startsWith('/missing/')) && requests.some((r) => r.startsWith('/good/')), 'a missing mirror is skipped for the next one');
  expect(progress.length > 0 && progress[progress.length - 1] === pieces[0].size + pieces[1].size, 'progress counts up to the total', String(progress[progress.length - 1]));
  expect(!fs.existsSync(path.join(root, '.studio', 'partial')) || fs.readdirSync(path.join(root, '.studio', 'partial')).length === 0, 'nothing is left half-made');

  console.log('\nThe next start');
  const before = requests.length;
  const again = await ensureRuntime(root, pieces, download);
  expect(again.installed.length === 0 && requests.length === before, 'a second start downloads nothing');

  console.log('\nWhat must refuse');
  const badSha = { ...pieces[1], sha256: '0'.repeat(64) };
  const shaRoot = path.join(work, 'sha');
  await rejects(ensureRuntime(shaRoot, [badSha], download), 'checksum', 'an archive that is not the pinned one is refused');
  expect(!fs.existsSync(pieceDir(shaRoot, badSha)) && !isInstalled(shaRoot, badSha), 'and nothing of it is installed');
  const badTree = { ...pieces[1], tree: '0'.repeat(64) };
  const treeRoot = path.join(work, 'tree');
  await rejects(ensureRuntime(treeRoot, [badTree], download), 'checksum', 'an archive that unpacks to other files than pinned is refused');
  expect(!fs.existsSync(pieceDir(treeRoot, badTree)), 'and nothing of it is installed');
  const spaceMessage = await rejects(ensureRuntime(path.join(work, 'small'), pieces, download, { freeBytes: () => 1024 }), 'space', 'too little disk space is said before downloading anything');
  expect(/MB of free disk space/.test(spaceMessage), 'and says how much is needed', spaceMessage);

  console.log('\nRepairs and upgrades');
  fs.rmSync(path.join(browser, 'fake-win64', 'fake.exe'));
  const count = (what: string): number => requests.filter((r) => r.includes(what)).length;
  const [browserBefore, nodeBefore] = [count('fake_browser'), count('node.zip')];
  const repaired = await ensureRuntime(root, pieces, download);
  expect(repaired.installed.join() === 'fake_browser-7' && fs.existsSync(path.join(browser, 'fake-win64', 'fake.exe')), 'a piece with a file deleted is downloaded again, alone', repaired.installed.join());
  expect(count('fake_browser') > browserBefore && count('node.zip') === nodeBefore, 'Node, which is intact, is not downloaded again');
  fs.mkdirSync(path.join(root, 'ms-playwright', 'old_browser-1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.studio', 'old_browser-1.verified'), '{}');
  await ensureRuntime(root, pieces, download);
  expect(!fs.existsSync(path.join(root, 'ms-playwright', 'old_browser-1')) && !fs.existsSync(path.join(root, '.studio', 'old_browser-1.verified')), 'a browser no longer pinned (after an update) is removed');

  server.close();
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('\n' + (failures ? failures + ' FAILED' : 'All passed') + '.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
