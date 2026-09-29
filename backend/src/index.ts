/**
 * Learning Studio backend, run on its own: `npm run dev:backend`. Binds loopback only - the Vite
 * dev server proxies to it. With STUDIO_WEB_DIR set it also serves the built page itself. The
 * desktop app starts the server through server.ts, with its own port and token.
 */
import { WEB_DIR, config } from './config';
import { startServer } from './server';

<<<<<<< HEAD
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
=======
startServer({ port: config.port, webDir: WEB_DIR }).then(
  ({ port }) => {
    console.log('Learning Studio backend on http://127.0.0.1:' + port);
    console.log(
      '  runs: ' +
        config.run.max_concurrent +
        ' concurrent, ' +
        config.run.timeout_ms +
        'ms timeout, ' +
        config.run.allowed_origins.length +
        ' allowed origins',
    );
  },
  (err: NodeJS.ErrnoException) => {
    // A second copy started while one is already running - a second launcher window, say - used to
    // crash here with an unhandled EADDRINUSE and a Node stack trace. Say what is going on instead:
    // the copy already running keeps serving the studio, so this one is simply not needed.
    if (err.code !== 'EADDRINUSE') throw err;
    console.error('');
    console.error('Port ' + config.port + ' is already in use: the Learning Studio backend is most likely already running,');
    console.error('in another launcher window or terminal. That copy keeps serving the studio, so this one is not needed.');
    console.error('To restart the backend, close the window that is running it and start it again.');
    console.error('');
    process.exit(1);
  },
);
>>>>>>> origin/main
