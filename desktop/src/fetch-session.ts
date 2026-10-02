/**
 * The launcher's one way onto the internet, and nothing else: a session of its own, kept in memory
 * only (no cache, no cookies on disk), that uses the computer's proxy settings and Windows'
 * certificate store (so it works behind a company proxy), and refuses every address but:
 *
 *   - the two distribution repositories, for the course and the studio's code (get), and
 *   - a standard build's runtime hosts, for Node and the browsers on the first start (download):
 *     nodejs.org, Chrome for Testing and Playwright's CDN, as runtime-sources.json lists them.
 *
 * The studio's own windows stay in the default session, which reaches nothing outside the studio
 * (main.ts lockSession). Nothing downloaded is trusted for where it came from: release.ts and
 * runtime-install.ts check every byte against hashes built into the launcher.
 */
import * as fs from 'node:fs';
import { session } from 'electron';
import { NetworkError, type Get } from './release';
import type { Download } from './runtime-install';

const TIMEOUT_MS = 20_000;
/** A large file is given longer: about 256 KB a second at worst, after the first 20 seconds. */
const timeoutFor = (max: number): number => TIMEOUT_MS + Math.ceil(max / (256 * 1024)) * 1000;
/** A runtime download is stopped only when nothing arrives for this long, however long it takes in all. */
const IDLE_MS = 60_000;

/** Chromium's network errors, by what the learner can do about them. */
function classify(e: unknown): NetworkError {
  if (e instanceof NetworkError) return e;
  const text = String((e as Error)?.message ?? e);
  if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') {
    return new NetworkError('timeout', 'The download took too long.');
  }
  if (/ERR_CERT|ERR_SSL|CERTIFICATE/i.test(text)) {
    return new NetworkError('certificate', 'The connection could not be trusted (a certificate problem): ' + text);
  }
  if (/ERR_BLOCKED|ERR_ACCESS_DENIED/i.test(text)) return new NetworkError('refused', 'The download was blocked: ' + text);
  return new NetworkError('offline', 'The server could not be reached: ' + text);
}

function statusError(res: Response, url: string): NetworkError | null {
  if (res.status === 404) return new NetworkError('not-found', 'The file is not there (' + url + ').');
  if (res.status === 429 || res.status === 403) return new NetworkError('rate-limited', 'The server is turning requests away for now.');
  if (!res.ok || !res.body) return new NetworkError('offline', 'The server answered ' + res.status + '.');
  return null;
}

export type Fetcher = { get: Get; download: Download };

/**
 * The launcher's fetcher. `get` reads only under the repository addresses in `repos`; `download`
 * only under the prefixes in `runtime` (both end in '/'). allowLocal lets a development build use a
 * test server on 127.0.0.1 as well; a release never does.
 */
export async function openFetchSession(repos: string[], runtime: string[], allowLocal = false): Promise<Fetcher> {
  const ses = session.fromPartition('studio-fetch', { cache: false });
  await ses.setProxy({ mode: 'system' });
  const secure = (url: string): boolean => url.startsWith('https://') || (allowLocal && url.startsWith('http://127.0.0.1:'));
  const forGet = (url: string): boolean => secure(url) && repos.some((b) => url.startsWith(b));
  const forDownload = (url: string): boolean => secure(url) && runtime.some((b) => url.startsWith(b));
  // Every request, a redirect's next one included, must be for one of those addresses.
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !(forGet(details.url) || forDownload(details.url)) }));
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const get: Get = async (url, max) => {
    // Checked here as well: ses.fetch can read file: addresses, which no request handler sees.
    if (!forGet(url)) throw new NetworkError('refused', 'The studio does not download from ' + url + '.');
    let res: Response;
    try {
      res = await ses.fetch(url, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutFor(max)),
        bypassCustomProtocolHandlers: true,
      });
    } catch (e) {
      throw classify(e);
    }
    const bad = statusError(res, url);
    if (bad) throw bad;
    const length = Number(res.headers.get('content-length') ?? '0');
    if (length > max) throw new NetworkError('too-large', 'The download is larger than expected.');
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
          await reader.cancel();
          throw new NetworkError('too-large', 'The download is larger than expected.');
        }
        chunks.push(Buffer.from(value));
      }
    } catch (e) {
      throw classify(e);
    }
    return Buffer.concat(chunks);
  };

  /**
   * Streams a runtime archive to a file, trying the piece's URLs in turn. Redirects are followed,
   * but only to addresses on the list (the request handler cancels any other), and the address the
   * file finally came from is checked again. Stops when nothing arrives for a minute, or when more
   * arrives than the piece's size; runtime-install.ts then checks the file's hash.
   */
  const download: Download = async (piece, file, onBytes) => {
    let last: NetworkError | null = null;
    for (const url of piece.urls) {
      if (!forDownload(url)) {
        last = new NetworkError('refused', 'The studio does not download from ' + url + '.');
        continue;
      }
      const controller = new AbortController();
      let idle: NodeJS.Timeout | undefined;
      const kick = (): void => {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), IDLE_MS);
      };
      let out: fs.WriteStream | null = null;
      try {
        kick();
        const res = await ses.fetch(url, {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'follow',
          signal: controller.signal,
          bypassCustomProtocolHandlers: true,
        });
        if (res.url && !forDownload(res.url)) throw new NetworkError('refused', url + ' sent the download on to ' + res.url + '.');
        const bad = statusError(res, url);
        if (bad) throw bad;
        if (Number(res.headers.get('content-length') ?? '0') > piece.size) throw new NetworkError('too-large', 'The download is larger than expected.');
        out = fs.createWriteStream(file);
        const done = new Promise<void>((resolve, reject) => {
          out!.on('error', reject);
          out!.on('finish', () => resolve());
        });
        let size = 0;
        const reader = res.body!.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          kick();
          size += chunk.value.byteLength;
          if (size > piece.size) {
            await reader.cancel();
            throw new NetworkError('too-large', 'The download is larger than expected.');
          }
          if (!out.write(chunk.value)) await new Promise<void>((r) => out!.once('drain', () => r()));
          onBytes(size);
        }
        out.end();
        await done;
        clearTimeout(idle);
        if (size !== piece.size) throw new NetworkError('offline', 'The download stopped part-way.');
        return;
      } catch (e) {
        clearTimeout(idle);
        out?.destroy();
        fs.rmSync(file, { force: true });
        last = classify(e);
      }
    }
    throw last ?? new NetworkError('offline', 'Nothing could be downloaded.');
  };

  return { get, download };
}
