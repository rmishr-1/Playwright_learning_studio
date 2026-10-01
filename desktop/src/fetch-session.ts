/**
 * The launcher's one way onto the internet: downloads from the two distribution repositories, and
 * nothing else. A session of its own, kept in memory only (no cache, no cookies on disk), that uses
 * the computer's proxy settings and Windows' certificate store (so it works behind a company proxy)
 * and refuses every address but those repositories. The studio's own windows stay in the default
 * session, which reaches nothing outside the studio (main.ts lockSession).
 */
import { session } from 'electron';
import { NetworkError, type Get } from './release';

const TIMEOUT_MS = 20_000;
/** A large download is given longer: about 256 KB a second at worst, after the first 20 seconds. */
const timeoutFor = (max: number): number => TIMEOUT_MS + Math.ceil(max / (256 * 1024)) * 1000;

/** Chromium's network errors, by what the learner can do about them. */
function classify(e: unknown): NetworkError {
  const text = String((e as Error)?.message ?? e);
  if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') {
    return new NetworkError('timeout', 'The download took too long.');
  }
  if (/ERR_CERT|ERR_SSL|CERTIFICATE/i.test(text)) {
    return new NetworkError('certificate', 'The connection to GitHub could not be trusted (a certificate problem): ' + text);
  }
  if (/ERR_BLOCKED|ERR_ACCESS_DENIED/i.test(text)) return new NetworkError('refused', 'The download was blocked: ' + text);
  return new NetworkError('offline', 'GitHub could not be reached: ' + text);
}

/**
 * A download function for these repository addresses only (each ends in '/'). allowLocal lets a
 * development build read from a test server on 127.0.0.1 too; a release never does.
 */
export async function makeGet(bases: string[], allowLocal = false): Promise<Get> {
  const ses = session.fromPartition('studio-fetch', { cache: false });
  await ses.setProxy({ mode: 'system' });
  const allowed = (url: string): boolean =>
    bases.some((b) => url.startsWith(b)) && (url.startsWith('https://raw.githubusercontent.com/') || (allowLocal && url.startsWith('http://127.0.0.1:')));
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowed(details.url) }));
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  return async (url, max) => {
    // Checked here as well: ses.fetch can read file: addresses, which no request handler sees.
    if (!allowed(url)) throw new NetworkError('refused', 'The studio does not download from ' + url + '.');
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
    if (res.status === 404) throw new NetworkError('not-found', 'The release is not there (' + url + ').');
    if (res.status === 429 || res.status === 403) throw new NetworkError('rate-limited', 'GitHub is turning requests away for now.');
    if (!res.ok || !res.body) throw new NetworkError('offline', 'GitHub answered ' + res.status + '.');
    const length = Number(res.headers.get('content-length') ?? '0');
    if (length > max) throw new NetworkError('too-large', 'The download is larger than expected.');
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body.getReader();
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
      if (e instanceof NetworkError) throw e;
      throw classify(e);
    }
    return Buffer.concat(chunks);
  };
}
