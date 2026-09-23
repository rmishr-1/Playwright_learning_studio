/**
 * Starts the Learning Studio backend. Binds loopback only.
 *
 * In development (index.ts) the Vite dev server proxies to it on a fixed port. The desktop app
 * starts it on a free port, with a token and the built page:
 *
 *   - token: every request must carry it in the studio_token cookie, which the app sets in its
 *     own window only. A browser or a script elsewhere on the computer gets 401, so it cannot read
 *     the course out of the API. The one exception is the Terminal's frame endpoint, which the
 *     learner's own test processes post to; it only accepts frames for the command running now.
 *   - webDir: the built Option C page, served from the same origin, so /api and the WebSocket
 *     work exactly as they do behind the dev server.
 */
import * as crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import { listening } from './config';
import { router } from './routes';
import { attachStream } from './runner';

export type ServerOptions = { port: number; token?: string | null; webDir?: string | null };
export type RunningServer = { port: number; close: () => Promise<void> };

const FRAME_POST = /^\/api\/terminal\/[0-9a-f-]{36}\/frame$/;

function cookie(req: http.IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function sameSecret(a: string | null, b: string): boolean {
  if (a === null) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const token = opts.token ?? null;
  const app = express();
  app.disable('x-powered-by');

  // Checked on every request once the port is known: the right host (so a web page cannot reach
  // the studio through a DNS name that points at 127.0.0.1) and the token.
  const allowed = (req: http.IncomingMessage): boolean => {
    if (!token) return true;
    if (req.headers.host !== '127.0.0.1:' + listening.port) return false;
    if (req.method === 'POST' && FRAME_POST.test(req.url ?? '')) return true;
    return sameSecret(cookie(req, 'studio_token'), token);
  };
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (allowed(req)) return next();
    res.status(401).type('text/plain').send('Unauthorized');
  });

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', router);
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const webDir = opts.webDir ?? null;
  if (webDir) {
    const indexHtml = path.join(webDir, 'index.html');
    app.use(express.static(webDir, { index: false }));
    // The page routes in the browser (/learn/w1/d1), so every other address gets the page itself.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.type('html').send(fs.readFileSync(indexHtml));
    });
  }

  const server = http.createServer(app);

  /**
   * Live browser view. One socket per run: the client attaches using the run_id it minted,
   * then POSTs /api/run. Frames buffered before the socket attaches are replayed on connect.
   */
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const match = /^\/api\/run\/([0-9a-f-]{36})\/stream$/.exec(req.url ?? '');
    if (!match || !allowed(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const detach = attachStream(match[1], (event) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
      });
      ws.on('close', detach);
      ws.on('error', detach);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      const address = server.address();
      listening.port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port: listening.port,
        close: () =>
          new Promise<void>((done) => {
            wss.close();
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
