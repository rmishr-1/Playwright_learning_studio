/**
 * Learning Studio backend, run on its own: `npm run dev:backend`. Binds loopback only - the Vite
 * dev server proxies to it. With STUDIO_WEB_DIR set it also serves the built page itself. The
 * desktop app starts the server through server.ts, with its own port and token.
 */
import { WEB_DIR, config } from './config';
import { startServer } from './server';

void startServer({ port: config.port, webDir: WEB_DIR }).then(({ port }) => {
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
});
