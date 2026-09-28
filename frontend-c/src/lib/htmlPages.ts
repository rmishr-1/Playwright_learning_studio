import { previewPage } from '../api/client';

/**
 * View page: finds the practice pages in a piece of code, the HTML its tests hand to
 * page.setContent(), and opens one in the learner's browser.
 *
 * A page is a string in the code that holds HTML: a `const checkoutPage = \`...\`` a test opens
 * with setContent(checkoutPage), or a string written straight into setContent('<h1>Hi</h1>'). The
 * code is scanned, not run, so comments are skipped and nothing in it executes in the studio. A
 * template with a ${...} in it is left out: the page depends on a value only a run knows, so it
 * could not be shown as the test sees it.
 */

export type HtmlPage = {
  /** The variable's name, such as checkoutPage, or "Page on line 12" for one written in place. */
  name: string;
  html: string;
};

/** An element with its closing tag, or a whole document. */
const LOOKS_LIKE_HTML = /<!doctype html|<([a-z][a-z0-9-]*)\b[^<>]*>[\s\S]*<\/\1\s*>/i;

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** The value of a string literal's body, with its escapes read as JavaScript reads them. */
function unescape(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/g, (_m, e: string) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n') return '';
    return ESCAPES[e] ?? e;
  });
}

/** Every string literal in the code, in order, with where it starts. Comments are skipped. */
function literals(code: string): { start: number; value: string; computed: boolean }[] {
  const out: { start: number; value: string; computed: boolean }[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '/') {
      i = code.indexOf('\n', i);
      if (i === -1) break;
    } else if (ch === '/' && code[i + 1] === '*') {
      i = code.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const start = i;
      let body = '';
      let computed = false;
      i++;
      while (i < code.length && code[i] !== ch) {
        if (code[i] === '\\') {
          body += code.slice(i, i + 2);
          i += 2;
        } else if (ch === '`' && code[i] === '$' && code[i + 1] === '{') {
          computed = true;
          let depth = 0;
          const from = i;
          for (; i < code.length; i++) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}' && --depth === 0) break;
          }
          body += code.slice(from, ++i);
        } else if (ch !== '`' && code[i] === '\n') {
          break; // An unclosed quote: not a string.
        } else {
          body += code[i++];
        }
      }
      i++;
      out.push({ start, value: unescape(body), computed });
    } else {
      i++;
    }
  }
  return out;
}

/** The pages in a code sample. An HTML sample is itself the page. */
export function pagesIn(code: string, language: string): HtmlPage[] {
  if (/^(html|xml)$/i.test(language)) return code.trim() ? [{ name: 'This page', html: code.trim() }] : [];
  return /^(|ts|js|typescript|javascript|tsx|jsx)$/i.test(language) ? findPages(code) : [];
}

export function findPages(code: string): HtmlPage[] {
  const pages: HtmlPage[] = [];
  const seen = new Set<string>();
  for (const { start, value, computed } of literals(code)) {
    if (computed || !LOOKS_LIKE_HTML.test(value) || seen.has(value)) continue;
    const before = code.slice(Math.max(0, start - 80), start);
    const named = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*[:=]\s*$/.exec(before)?.[1];
    // Only a page: a string given a name, or one handed straight to setContent().
    if (!named && !/\.setContent\(\s*$/.test(before)) continue;
    seen.add(value);
    const line = code.slice(0, start).split('\n').length;
    pages.push({ name: named ?? 'Page on line ' + line, html: value.trim() });
  }
  return pages;
}

/** Opens a page in a new browser tab. In the desktop app, that is the computer's own browser. */
export async function openPage(page: HtmlPage): Promise<void> {
  // A page with no title of its own gets one, so its tab says which page it is.
  const html = /<title[\s>]/i.test(page.html) ? page.html : '<title>' + page.name + ' - View page</title>\n' + page.html;
  try {
    const { url } = await previewPage(html);
    window.open(url, '_blank', 'noopener');
  } catch {
    window.alert('The page could not be opened. Check that the studio is still running, and select View page again.');
  }
}

let openMenu: (() => void) | null = null;

/**
 * View page's button. With one page in the code it opens it; with several it shows a list of
 * their names under the button to choose from.
 */
export function viewPages(button: HTMLElement, pages: HtmlPage[]): void {
  openMenu?.();
  if (pages.length === 1) return void openPage(pages[0]);
  const doc = button.ownerDocument;
  const menu = doc.createElement('div');
  menu.className = 'page-menu';
  menu.setAttribute('role', 'menu');
  menu.append(Object.assign(doc.createElement('div'), { className: 'page-menu-title', textContent: 'Which page?' }));
  for (const page of pages) {
    const item = doc.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = page.name;
    item.onclick = () => {
      close();
      void openPage(page);
    };
    menu.append(item);
  }
  const box = button.getBoundingClientRect();
  menu.style.top = box.bottom + 4 + 'px';
  menu.style.right = Math.max(8, doc.documentElement.clientWidth - box.right) + 'px';
  doc.body.append(menu);
  (menu.querySelector('button[role=menuitem]') as HTMLButtonElement | null)?.focus();

  const outside = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node) && e.target !== button) close();
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
      button.focus();
    }
  };
  function close(): void {
    menu.remove();
    doc.removeEventListener('mousedown', outside);
    doc.removeEventListener('keydown', key);
    doc.removeEventListener('scroll', close, true);
    openMenu = null;
  }
  doc.addEventListener('mousedown', outside);
  doc.addEventListener('keydown', key);
  doc.addEventListener('scroll', close, true);
  openMenu = close;
}
