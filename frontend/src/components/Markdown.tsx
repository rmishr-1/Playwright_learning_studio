import { useEffect, useRef } from 'react';
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

/**
 * `rewriteHarnessImports()` in backend/src/runner.ts turns an import from this path into a
 * comment - but it does that for ANY names imported from it, not just ones the harness actually
 * defines. The harness (buildProgram() in runner.ts) only ever hands the learner these five:
 * importing anything else from deno-helpers - `REPO_ROOT`, `writeProjectFile`, `runSpec` are all
 * real ones the course uses - still throws a ReferenceError, just one line later than an
 * unrecognised import path would.
 */
const HARNESS_GLOBALS = new Set(['launch', 'show', 'login', 'USERS', 'BASE_URL']);
const HARNESS_IMPORT_LINE = /^import\s+\{([^}]*)\}\s+from\s+["'](?:\.\.\/)*_shared\/deno-helpers(?:\.ts)?["'];?$/;

/**
 * The runner wraps pasted code inside an async function body, so a fence with a module-level
 * `import`/`export` (a spec file, a playwright.config.ts) cannot even parse there - those are
 * for the learner's own checkout, which is exactly what the course's own "Mode: test-runner"
 * callouts already say. A fence that reaches for `page.`/`browser.` without calling `launch()`
 * is a fragment lifted out of a bigger example, missing the one line that would make it
 * self-contained. Both throw before any of the learner's own code runs, which is worse than no
 * button at all.
 */
function isExecutable(code: string): boolean {
  const badImport = code.split('\n').some((line) => {
    if (!/^\s*(import|export)\s/.test(line)) return false;
    const m = HARNESS_IMPORT_LINE.exec(line.trim());
    if (!m) return true;
    const names = m[1].split(',').map((n) => n.trim()).filter(Boolean);
    return names.some((n) => !HARNESS_GLOBALS.has(n));
  });
  if (badImport) return false;
  if (/\b(page|browser)\./.test(code) && !/\blaunch\s*\(/.test(code)) return false;
  // test() and expect() are the Playwright TEST RUNNER's fixtures, never provided by the
  // explore-mode harness (which only hands the learner launch/show/login) - a fragment that
  // calls either one without importing it is a spec-file excerpt, not a paste-and-run snippet.
  if (/\b(test|expect)\s*\(/.test(code)) return false;
  // The course was authored against Deno's notebook kernel, where one cell's `import` and
  // `const` stay live for every cell after it. A cell that leans on that - referencing `Deno`
  // itself, or a helper the FIRST cell imported - has no such carry-over once it is copied out
  // on its own, which is exactly what "Load into editor" does.
  if (/\bDeno\b/.test(code)) return false;
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
 * Lesson markdown. Two behaviours beyond plain rendering:
 *  - fenced code blocks get a "Load into editor" button
 *  - the importer's /learn/... links are routed in-app rather than reloading the page
 */
export function Markdown({
  text,
  onLoadIntoEditor,
}: {
  text: string;
  onLoadIntoEditor?: (code: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = marked.parse(text) as string;

    for (const block of Array.from(host.querySelectorAll('pre > code'))) {
      const code = block.textContent ?? '';
      const lang = /language-(\w+)/.exec(block.className)?.[1] ?? '';
      if (hljs.getLanguage(lang)) {
        block.innerHTML = hljs.highlight(code, { language: lang }).value;
        // Concept color grading. hljs tags every call-shaped identifier - a locator, an
        // action, an assertion matcher, a wait, `test(` itself - with the SAME class
        // (`hljs-title function_`, confirmed against the real TypeScript grammar); it cannot
        // tell them apart. This adds a second, concept-specific class on top of hljs's own,
        // using the vocabulary both this and the live editor (CodePane.tsx) share.
        for (const span of block.querySelectorAll('.hljs-title.function_')) {
          const concept = classify(span.textContent ?? '');
          if (concept) span.classList.add('concept-' + concept);
        }
      }

      const pre = block.parentElement!;
      const wrap = document.createElement('div');
      wrap.className = 'example';
      const head = document.createElement('div');
      head.className = 'head';
      head.append(Object.assign(document.createElement('span'), { textContent: lang || 'code' }));

      // Only offer the button for code the editor can actually take.
      const tsOrJs = !lang || ['ts', 'js', 'typescript', 'javascript'].includes(lang);
      if (tsOrJs && onLoadIntoEditor) {
        if (isExecutable(code)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Load into editor';
          btn.onclick = () => onLoadIntoEditor(code);
          head.append(btn);
        } else {
          head.append(
            Object.assign(document.createElement('span'), {
              className: 'not-runnable',
              textContent: 'Run this in your own checkout',
            }),
          );
        }
      }
      pre.replaceWith(wrap);
      wrap.append(head, pre);
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
  }, [text, onLoadIntoEditor, navigate]);

  return <div ref={ref} />;
}
