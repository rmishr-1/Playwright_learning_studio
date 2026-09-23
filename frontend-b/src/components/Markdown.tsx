import { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { classify } from '../lib/conceptColors';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);

marked.setOptions({ gfm: true, breaks: false });

/** Highlights code into the <code> element `el`, with the concept colors on top of hljs's own. */
export function highlightInto(el: Element, code: string, lang: string): void {
  if (!hljs.getLanguage(lang)) {
    el.textContent = code;
    return;
  }
  el.innerHTML = hljs.highlight(code, { language: lang }).value;
  // Concept color grading. hljs tags every call-shaped identifier - a locator, an action, an
  // assertion matcher, a wait, `test(` itself - with the SAME class (`hljs-title function_`); it
  // cannot tell them apart. This adds a second, concept-specific class on top of hljs's own,
  // using the vocabulary both this and the live editor (CodePane.tsx) share.
  for (const span of el.querySelectorAll('.hljs-title.function_')) {
    const concept = classify(span.textContent ?? '');
    if (concept) span.classList.add('concept-' + concept);
  }
}

/**
 * The runner wraps pasted code inside an async function body, so a fence with a module-level
 * `import`/`export` (a spec file, a playwright.config.ts) cannot even parse there. The editor's
 * helpers (launch, show) are provided without an import. A fence that
 * reaches for `page.`/`browser.` without calling `launch()` is a fragment lifted out of a bigger
 * example, missing the one line that would make it self-contained. Both throw before any of the
 * learner's own code runs, which is worse than no button at all.
 */
function isExecutable(code: string): boolean {
  if (code.split('\n').some((line) => /^\s*(import|export)\s/.test(line))) return false;
  if (/\b(page|browser)\./.test(code) && !/\blaunch\s*\(/.test(code)) return false;
  // test() and expect() are the Playwright TEST RUNNER's fixtures, never provided by the
  // editor's harness - a fragment that calls either one without importing it is a spec-file
  // excerpt, not a paste-and-run snippet.
  if (/\b(test|expect)\s*\(/.test(code)) return false;
  // A config file excerpted mid-explanation ("projects: [ ... ],") is an object literal's
  // property, not a statement - it needs the `export default defineConfig({ ... })` around it
  // that the surrounding prose deliberately left out to keep the excerpt short.
  if (/^\s*\w+\s*:/.test(code)) return false;
  // A "Syntax" callout lists two ways to write the same thing as two top-level declarations
  // of the same name ("const name = ...; const name = ...;") - valid as two lines to read,
  // a SyntaxError as one program to run.
  const names = [...code.matchAll(/^\s*(?:const|let)\s+(\w+)\s*=/gm)].map((m) => m[1]);
  if (new Set(names).size !== names.length) return false;
  // A fence with none of these is prose wearing a code fence (a directory tree, a file
  // listing) rather than a statement the runner could execute.
  if (!/[(=;{]/.test(code)) return false;
  return true;
}

/**
 * A whole spec file: it imports from @playwright/test and calls test(). The Run button cannot take
 * it, but the Terminal can, with `npx playwright test`, so it is offered to the editor too.
 * A config file imports from the same package but has no test(), so it is not one.
 */
export function isSpecFile(code: string): boolean {
  return /^\s*import\s[^;]*from\s+["']@playwright\/test["']/m.test(code) && /\btest\s*(\.\w+\s*)?\(/.test(code);
}

/**
 * The weeks a learner can open. A lesson link into any other week renders as plain text instead
 * of an anchor, so a forward reference to a later week keeps its meaning without leading to a
 * page the sidebar does not list. It is derived
 * from the course index, so the link comes back by itself when that week opens. null means
 * "unknown" (no provider), and then every link renders as a link.
 */
export const OpenWeeks = createContext<ReadonlySet<number> | null>(null);

/**
 * Lesson markdown. Two behaviours beyond plain rendering:
 *  - fenced code blocks get a "Load into editor" button
 *  - the importer's /learn/... links are routed in-app rather than reloading the page
 *  - a /learn/... link into a week that is not open renders as plain text (see OpenWeeks)
 */
export function Markdown({
  text,
  onLoadIntoEditor,
  offerAll,
}: {
  text: string;
  onLoadIntoEditor?: (code: string) => void;
  /** Offer every TypeScript fence to the editor, as a model answer's code is. */
  offerAll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const openWeeks = useContext(OpenWeeks);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = marked.parse(text) as string;

    for (const block of Array.from(host.querySelectorAll('pre > code'))) {
      const code = block.textContent ?? '';
      const lang = /language-(\w+)/.exec(block.className)?.[1] ?? '';
      if (hljs.getLanguage(lang)) highlightInto(block, code, lang);

      const pre = block.parentElement!;
      const wrap = document.createElement('div');
      wrap.className = 'example';
      const head = document.createElement('div');
      head.className = 'head';
      head.append(Object.assign(document.createElement('span'), { textContent: lang || 'code' }));

      // Only offer the button for code the editor can actually take.
      const tsOrJs = !lang || ['ts', 'js', 'typescript', 'javascript'].includes(lang);
      if (tsOrJs && onLoadIntoEditor) {
        if (offerAll || isExecutable(code)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Load into editor';
          btn.onclick = () => onLoadIntoEditor(code);
          head.append(btn);
        } else if (isSpecFile(code)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Load into editor';
          btn.onclick = () => onLoadIntoEditor(code);
          head.append(
            Object.assign(document.createElement('span'), {
              className: 'not-runnable',
              textContent: 'Run it with npx playwright test in the Terminal',
            }),
            btn,
          );
        } else {
          head.append(
            Object.assign(document.createElement('span'), {
              className: 'not-runnable',
              textContent: 'Run this in your own project',
            }),
          );
        }
      }
      pre.replaceWith(wrap);
      wrap.append(head, pre);
    }

    if (openWeeks) {
      for (const a of Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href^="/learn/w"]'))) {
        const week = Number(/^\/learn\/w(\d+)\//.exec(a.getAttribute('href') ?? '')?.[1]);
        if (!week || openWeeks.has(week)) continue;
        const span = document.createElement('span');
        span.className = 'ref-unopened';
        span.textContent = a.textContent;
        span.title = 'Week ' + week + ' is not open yet';
        a.replaceWith(span);
      }
    }

    const onClick = (e: MouseEvent): void => {
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!href?.startsWith('/')) return;
      e.preventDefault();
      navigate(href);
    };
    host.addEventListener('click', onClick);
    return () => host.removeEventListener('click', onClick);
  }, [text, onLoadIntoEditor, offerAll, navigate, openWeeks]);

  return <div ref={ref} />;
}
