/**
 * Starts the Learning Studio backend. Binds loopback only.
 *
 * In development (index.ts) the Vite dev server proxies to it on a fixed port. The desktop app
 * starts it on a free port, with a token and the built page:
 *
 *   - token: every request must carry it in the studio_token cookie, which the app sets in its
 *     own window only. A browser or a script elsewhere on the computer gets 401, so it cannot read
 *     the course out of the API. The one exception is the Terminal's frame endpoint, which the
 *     learner's own test processes post to; it takes a key of its own, new for every command.
 *   - webDir: the built Option C page, served from the same origin, so /api and the WebSocket
 *     work exactly as they do behind the dev server.
 *
 * With or without a token, a request must name this server in its Host header, and a browser's
 * Origin must be this computer: a web page that points a DNS name at 127.0.0.1 (DNS rebinding) is
 * refused. Nothing is cached: the course is served decrypted, and a browser cache would keep it on
 * disk in plain text.
 *
 * The HTML report of the Terminal's last test run is served by a second server of its own
 * (reportServer below), which knows nothing of the API or the token: the report holds whatever the
 * learner's tests put in it, and it must not run with the studio's rights.
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
import { currentReportDir, frameExpected } from './terminal';

export type ServerOptions = { port: number; token?: string | null; webDir?: string | null };
export type RunningServer = { port: number; close: () => Promise<void> };

const FRAME_POST = /^\/api\/terminal\/[0-9a-f-]{36}\/frame$/;

/**
 * The page's Content Security Policy in the desktop app: only its own scripts, and connections only
 * to itself. Styles may be inline (CodeMirror, Mermaid and xterm set them); images may be data or
 * blob URLs (the live view's frames, the customer's logo, Mermaid).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** A cookie's raw value. The token is hex, so it is compared as sent, never decoded. */
function cookie(req: http.IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function sameSecret(a: string | null, b: string): boolean {
  if (a === null) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** The addresses this server answers to: 127.0.0.1, and in development also localhost. */
function hostsFor(port: number, strict: boolean): string[] {
  return strict ? ['127.0.0.1:' + port] : ['127.0.0.1:' + port, 'localhost:' + port];
}

/** The Vite dev server's page (frontend-c/vite.config.ts), which proxies to this server in development. */
const DEV_PAGE_PORT = 5185;

/** In development, a browser's Origin, when it sends one, must be this server or the dev page. */
const devOrigin = (origin: string, port: number): boolean =>
  [port, DEV_PAGE_PORT].some((p) => origin === 'http://127.0.0.1:' + p || origin === 'http://localhost:' + p);

/** No caching anywhere, and the usual hardening headers. */
function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  next();
}

/** Problem+json for anything that throws, without a stack trace or a file path. */
function problem(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 500) console.error('[studio] ' + ((err as Error)?.message ?? String(err)));
  if (res.headersSent) return;
  // A request the studio cannot read (malformed JSON, a body over the limit) is the caller's error.
  const code = status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title: code, status, code, detail: status >= 500 ? 'The studio hit an error.' : 'The request could not be read.' });
}

/**
 * The HTML report of the last test run, on a port of its own. It serves the report's files and
 * nothing else, under a path that is new every time the studio starts (listening.reportPath), so
 * only the studio, which opens it, knows where it is. It checks the Host header like the studio
 * does, and serves no file that resolves (through a link the learner's tests made, say) to
 * anywhere outside the report.
 */
function reportServer(): Promise<http.Server> {
  const app = express();
  app.disable('x-powered-by');
  app.use(noStore);
  app.use((req, res, next) => {
    if (!hostsFor(listening.reportPort, false).includes(req.headers.host ?? '')) return void res.status(403).end();
    next();
  });
  app.use(listening.reportPath, (req, res, next) => {
    let root: string;
    let file: string;
    try {
      root = fs.realpathSync(currentReportDir());
      file = path.join(root, ...decodeURIComponent(req.path).split('/'));
    } catch {
      return void res.status(404).end();
    }
    let real: string;
    try {
      real = fs.realpathSync(file);
    } catch {
      return void res.status(404).end();
    }
    if (real !== root && !real.startsWith(root + path.sep)) return void res.status(403).end();
    express.static(root, { cacheControl: false, dotfiles: 'deny' })(req, res, next);
  });
  app.use((_req, res) => void res.status(404).end());
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      listening.reportPort = typeof address === 'object' && address ? address.port : 0;
      resolve(server);
    });
  });
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const token = opts.token ?? null;
  const app = express();
  app.disable('x-powered-by');

  // Checked on every request once the port is known: the right host and origin (so a web page
  // cannot reach the studio through a DNS name that points at 127.0.0.1) and, in the desktop app,
  // the token.
  const allowed = (req: http.IncomingMessage): boolean => {
    if (!hostsFor(listening.port, token !== null).includes(req.headers.host ?? '')) return false;
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (token ? origin !== 'http://127.0.0.1:' + listening.port : !devOrigin(origin, listening.port)) return false;
    }
    if (!token) return true;
    // The frame endpoint checks its own key, which only the running command has (routes.ts).
    if (req.method === 'POST' && FRAME_POST.test(req.url ?? '')) return true;
    return sameSecret(cookie(req, 'studio_token'), token);
  };
  // Even a refusal is not cached.
  app.use(noStore);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (allowed(req)) return next();
    res.status(401).type('text/plain').send('Unauthorized');
  });

  // A live-view frame's body is read only for the command that is running, with its key.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && FRAME_POST.test(req.url ?? '')) {
      const runId = (req.url ?? '').split('/')[3];
      if (!frameExpected(runId, req.get('x-studio-frame-key'))) return void res.status(410).end();
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', router);
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const webDir = opts.webDir ?? null;
  if (webDir) {
    const indexHtml = path.join(webDir, 'index.html');
    const page = (res: Response): void => {
      res.set({ 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY' });
    };
    app.use(express.static(webDir, { index: false, cacheControl: false, setHeaders: (res) => page(res as unknown as Response) }));
    // The page routes in the browser (/learn/w1/d1), so every other address gets the page itself.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      page(res);
      res.type('html').send(fs.readFileSync(indexHtml));
    });
  }
  app.use(problem);

  const server = http.createServer(app);
  const report = await reportServer();

  /**
   * Live browser view. One socket per run: the client attaches using the run_id it minted,
   * then POSTs /api/run. Frames buffered before the socket attaches are replayed on connect.
   */
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const match = /^\/api\/run\/([0-9a-f-]{36})\/stream$/.exec(req.url ?? '');
    if (!match || !allowed(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const detach = attachStream(match[1], (event) => {
        if (ws.readyState !== ws.OPEN) return;
        // A window that has stopped reading gets nothing more until it catches up, except the
        // end of the run, which it must always get.
        if (ws.bufferedAmount > 8_000_000 && event.event !== 'ended' && event.event !== 'exit') return;
        ws.send(JSON.stringify(event));
      });
      ws.on('close', detach);
      ws.on('error', detach);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      report.close();
      reject(e);
    });
    server.listen(opts.port, '127.0.0.1', () => {
      const address = server.address();
      listening.port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port: listening.port,
        close: () =>
          new Promise<void>((done) => {
            wss.close();
            report.close();
            report.closeAllConnections();
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
