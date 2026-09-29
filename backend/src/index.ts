/**
 * Learning Studio backend, run on its own: `npm run dev:backend`. Binds loopback only - the Vite
 * dev server proxies to it. With STUDIO_WEB_DIR set it also serves the built page itself. The
 * desktop app starts the server through server.ts, with its own port and token.
 */
import { WEB_DIR, config } from './config';
import { startServer } from './server';

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
