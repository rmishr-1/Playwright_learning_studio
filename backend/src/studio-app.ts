/**
 * The studio's code bundle: what the desktop launcher downloads from the app repository at every
 * start and runs in memory (desktop/src/bundle-loader.ts). It is the backend and, handed over by the
 * launcher with the course, the page. The launcher keeps the licence, the windows and the security;
 * this starts the server they talk to. See shared/studio-host.ts for the contract.
 *
 * Built by desktop/scripts/build.ts (buildBundle) into studio-app.js, which sets module.exports to
 * the StudioBundleV1 below. Never imports electron: the launcher's process is Electron, but the
 * bundle is plain Node, and the build refuses an import of it.
 */
import type { RunningStudio, StudioBundleV1, StudioHostV1 } from '../../shared/studio-host';
import { setBranding } from './branding';
import { useContent } from './content';
import { startServer } from './server';
import { ensureReconciled } from './store';
import { stopAll } from './terminal';
import { stopRuns } from './runner';

declare const __STUDIO_BUNDLE_VERSION__: number;

async function start(host: StudioHostV1): Promise<RunningStudio> {
  setBranding({ licensee: host.licence.licensee, logo: host.licence.logo });
  // The licence ID marks every lesson as it is served (routes.ts).
  useContent({ files: host.content.files, mark: host.licence.id });
  // The learner's record is brought up to date with this course now, not when the page first asks:
  // a start that closes before the page loads still records what the course was, so the next
  // start's tags compare with it.
  try {
    await ensureReconciled();
  } catch (e) {
    host.log('warn', 'The progress record could not be brought up to date yet: ' + (e as Error).message);
  }
  let server;
  try {
    server = await startServer({ port: host.port, token: host.token, web: host.web });
  } catch {
    // The port the app kept is taken: any free one does.
    server = await startServer({ port: 0, token: host.token, web: host.web });
  }
  const running = server;
  return {
    port: running.port,
    stop: async () => {
      stopAll();
      stopRuns();
      await running.close();
    },
  };
}

const bundle: StudioBundleV1 = {
  api: 1,
  version: typeof __STUDIO_BUNDLE_VERSION__ === 'number' ? __STUDIO_BUNDLE_VERSION__ : 0,
  start,
  // One-time steps an app release can ask for (its manifest's 'bundle' setup steps), by name.
  setup: {},
};

export default bundle;
