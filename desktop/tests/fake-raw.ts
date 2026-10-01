/**
 * A stand-in for raw.githubusercontent.com, on 127.0.0.1, for the tests: it serves a folder laid out
 * as the distribution repositories are (<root>/content/..., <root>/app/...), and can misbehave the
 * ways the real one can. A development build of the app reads from it when STUDIO_DIST_BASE names
 * it; a release never does.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

export type Mode = 'ok' | 'offline' | 'busy' | 'corrupt';

export type FakeRaw = { base: string; mode: Mode; requests: string[]; close(): Promise<void> };

export async function fakeRaw(root: string): Promise<FakeRaw> {
  const state: FakeRaw = { base: '', mode: 'ok', requests: [], close: async () => {} };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    state.requests.push(url.pathname);
    if (state.mode === 'offline') return void req.socket.destroy();
    if (state.mode === 'busy') return void res.writeHead(429).end('Too Many Requests');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel.split('/').includes('..')) return void res.writeHead(400).end();
    const file = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end('404: Not Found');
    let data = fs.readFileSync(file);
    if (state.mode === 'corrupt' && rel.includes('/blobs/')) {
      data = Buffer.from(data);
      data[data.length - 1] ^= 1;
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': data.length });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  state.base = 'http://127.0.0.1:' + (typeof address === 'object' && address ? address.port : 0) + '/';
  state.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}
