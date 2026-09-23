/**
 * Learning Studio backend. Binds loopback only - the Vite dev server proxies to it, and a
 * deployment puts a TLS edge in front. It is never directly reachable.
 */
import express from 'express';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { router } from './routes';
import { attachStream } from './runner';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);

/**
 * Live browser view. One socket per run: the client attaches using the run_id it minted,
 * then POSTs /api/run. Frames buffered before the socket attaches are replayed on connect.
 */
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const match = /^\/api\/run\/([0-9a-f-]{36})\/stream$/.exec(req.url ?? '');
  if (!match) {
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

/**
 * A second copy started while one is already running - a second launcher window, say - used to
 * crash here with an unhandled EADDRINUSE and a Node stack trace. Say what is going on instead:
 * the copy already running keeps serving every frontend, so this one is simply not needed.
 */
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error('');
  console.error('Port ' + config.port + ' is already in use: the Learning Studio backend is most likely already running,');
  console.error('in another launcher window or terminal. That copy keeps serving the studio, so this one is not needed.');
  console.error('To restart the backend, close the window that is running it and start it again.');
  console.error('');
  process.exit(1);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log('Learning Studio backend on http://127.0.0.1:' + config.port);
  console.log(
    '  runs: ' +
      config.run.max_concurrent +
      ' concurrent, ' +
      config.run.timeout_ms +
      'ms timeout, ' +
      config.run.allowed_origins.length +
      ' allowed origins',
  );
});
