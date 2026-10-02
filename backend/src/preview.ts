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
const pages = new Map<string, string>();

/** Where a page is served, under the report server's own secret path. */
export const previewPath = (): string => listening.reportPath + '-page';

/** Keeps a page and returns the address the browser opens it at. */
export function savePreview(html: string): string {
  const id = crypto.randomBytes(16).toString('hex');
  pages.set(id, html);
  while (pages.size > KEEP) pages.delete(pages.keys().next().value!);
  return 'http://127.0.0.1:' + listening.reportPort + previewPath() + '/' + id;
}

/**
 * The sandbox gives the page no storage: reading localStorage throws, and a practice page that
 * remembers a login with it (Day 1's shop-home.ts) stopped on its first line. In a test the page has
 * a real origin and real storage. This stands in for both kinds of storage, kept in memory for as
 * long as the tab is open, before the page's own scripts run.
 */
const STORAGE = `<script>
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
})();
</script>
`;

/** A kept page, with the storage stand-in first: after its doctype, if it has one. */
export function previewPage(id: string): string | undefined {
  const html = pages.get(id);
  if (html === undefined) return undefined;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '';
  return doctype + STORAGE + html.slice(doctype.length);
}

/**
 * The page's own origin, with scripts, forms and dialogs allowed, as they are in a test. Nothing it
 * does can reach the studio's pages, cookies or storage.
 */
export const PREVIEW_CSP = 'sandbox allow-scripts allow-forms allow-modals allow-popups';
