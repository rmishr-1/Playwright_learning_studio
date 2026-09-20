import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';

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
      }

      const pre = block.parentElement!;
      const wrap = document.createElement('div');
      wrap.className = 'example';
      const head = document.createElement('div');
      head.className = 'head';
      head.append(Object.assign(document.createElement('span'), { textContent: lang || 'code' }));

      // Only offer the button for code the editor can actually take.
      const runnable = !lang || ['ts', 'js', 'typescript', 'javascript'].includes(lang);
      if (runnable && onLoadIntoEditor) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Load into editor';
        btn.onclick = () => onLoadIntoEditor(code);
        head.append(btn);
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
