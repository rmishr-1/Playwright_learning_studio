/**
 * View in Page: shows a practice page from a lesson's code, the HTML a test passes to
 * page.setContent(), in the learner's own browser.
 *
 * The page is served by the report's server (server.ts), not the studio's: its scripts run, so the
 * page behaves as it does in the test, and they run with no rights in the studio. The server also
 * sends it with a Content Security Policy sandbox, so it has an origin of its own that matches no
 * other page. Pages are kept in memory only, the most recent few, under an address that cannot be
 * guessed.
 */
import * as crypto from 'node:crypto';
import { listening } from './config';

const KEEP = 20;
type Kept = { html: string; responses: Record<string, unknown> };
const pages = new Map<string, Kept>();

/** Where a page is served, under the report server's own secret path. */
export const previewPath = (): string => listening.reportPath + '-page';

/**
 * Keeps a page and returns the address the browser opens it at. `responses` are what the page gets
 * when it fetches one of those paths (the lesson's sample data, as its test answers with
 * page.route()).
 */
export function savePreview(html: string, responses: Record<string, unknown> = {}): string {
  const id = crypto.randomBytes(16).toString('hex');
  pages.set(id, { html, responses });
  while (pages.size > KEEP) pages.delete(pages.keys().next().value!);
  return 'http://127.0.0.1:' + listening.reportPort + previewPath() + '/' + id;
}

/**
 * Run before the page's own scripts, so the page behaves as it does in its test:
 * - Storage. The sandbox gives the page none: reading localStorage throws, and a practice page that
 *   remembers a login with it (Day 1's shop-home.ts) stopped on its first line. In a test the page
 *   has a real origin and real storage. This stands in for both kinds, kept in memory while the tab
 *   is open.
 * - Requests. A page that fetches data (Day 2's products page) gets the lesson's sample answer for
 *   that path, as its test gives it with page.route(). Other requests go out as usual.
 * - The tab's icon is set to nothing: the browser would otherwise ask the report server for
 *   /favicon.ico, which a sandboxed page may not load, and report that as an error.
 * - Links to a page the practice site does not have (href="/forgot") would leave for an empty
 *   error page. They show a note instead; in a test such a link leads nowhere either.
 */
const helpers = (responses: Record<string, unknown>): string => `<link rel="icon" href="data:,">
<script>
(() => {
  const memory = () => {
    const items = new Map();
    return {
      get length() { return items.size; },
      key: (i) => [...items.keys()][i] ?? null,
      getItem: (k) => (items.has(String(k)) ? items.get(String(k)) : null),
      setItem: (k, v) => void items.set(String(k), String(v)),
      removeItem: (k) => void items.delete(String(k)),
      clear: () => items.clear(),
    };
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    try { window[name]; } catch { Object.defineProperty(window, name, { value: memory(), configurable: true }); }
  }

  const answers = ${JSON.stringify(responses).replace(/</g, '\\u003c')};
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (Object.prototype.hasOwnProperty.call(answers, url.pathname)) {
      return Promise.resolve(new Response(JSON.stringify(answers[url.pathname]), { headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(input, init);
  };

  const note = (text) => {
    let box = document.getElementById('studio-preview-note');
    if (!box) {
      box = document.createElement('div');
      box.id = 'studio-preview-note';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
        'background:#1f2937;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:6px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:90vw';
      document.documentElement.append(box);
    }
    box.textContent = text;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.remove(), 5000);
  };
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || event.defaultPrevented) return;
    const href = link.getAttribute('href');
    if (href === '' || href.startsWith('#') || href.startsWith('javascript:')) return;
    event.preventDefault();
    note('This practice page has no page at ' + href + '. In a test, the link leads nowhere too.');
  });
})();
</script>
`;

/** A kept page, with the helpers first: after its doctype, if it has one. */
export function previewPage(id: string): string | undefined {
  const kept = pages.get(id);
  if (kept === undefined) return undefined;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(kept.html)?.[0] ?? '';
  return doctype + helpers(kept.responses) + kept.html.slice(doctype.length);
}

/**
 * The page's own origin, with scripts, forms and dialogs allowed, as they are in a test. Nothing it
 * does can reach the studio's pages, cookies or storage.
 */
export const PREVIEW_CSP = 'sandbox allow-scripts allow-forms allow-modals allow-popups';
