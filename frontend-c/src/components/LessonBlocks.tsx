import { useEffect, useId, useRef, useState } from 'react';
import { Markdown, highlightInto } from './Markdown';
import type { ContentBlock } from '../../../shared/contracts/course_day';

/** A file the editor holds: where it is saved, and the command that runs it. */
export type EditorFile = { file: string | null; run: string | null };

/**
 * A code sample. A sample that belongs to a file can be opened in the editor as that file, and one
 * with a command can be run: Run opens it in the editor and runs the command in the Terminal, so
 * the file the Terminal runs is exactly the one on the page.
 */
export function CodeBlock({
  block,
  onOpen,
  onRun,
}: {
  block: ContentBlock;
  onOpen: (code: string, meta: EditorFile) => void;
  onRun: (command: string, code: string, meta: EditorFile) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const meta = block.code;
  const lang = meta?.language ?? 'ts';

  useEffect(() => {
    if (ref.current) highlightInto(ref.current, block.text, lang);
  }, [block.text, lang]);

  if (!meta) return null;
  const file: EditorFile = { file: meta.file, run: meta.run };
  const editable = meta.mode === 'editor';

  return (
    <div className="example code-block">
      <div className="head">
        <span className="file">{meta.file ?? lang}</span>
        <span className="tags">
          {meta.expect_error && <span className="tag warn">Fails on purpose</span>}
          {meta.network && <span className="tag">Needs the internet</span>}
        </span>
        <span className="spacer" />
        {editable && (
          <button type="button" onClick={() => onOpen(block.text, file)}>
            Open in editor
          </button>
        )}
        {editable && meta.run && (
          <button type="button" className="run" onClick={() => onRun(meta.run!, block.text, file)}>
            ▶ Run
          </button>
        )}
      </div>
      <pre>
        <code ref={ref} />
      </pre>
    </div>
  );
}

/**
 * Commands to type in a terminal. Each command can be run in the studio's Terminal, which runs it
 * on the file in the editor and on the files the learner has saved. A line starting with # is a
 * comment and is shown only.
 */
export function TerminalBlock({ text, onRun }: { text: string; onRun: (command: string) => void }) {
  const lines = text.split('\n');
  return (
    <div className="terminal-block">
      <div className="head">
        <span>Terminal</span>
      </div>
      <div className="lines">
        {lines.map((line, i) =>
          line.trim().startsWith('#') || !line.trim() ? (
            <div className="line comment" key={i}>
              {line}
            </div>
          ) : (
            <div className="line" key={i}>
              <span className="prompt">$</span>
              <code>{line}</code>
              <button type="button" onClick={() => onRun(line.trim())} title="Run this command in the Terminal">
                Run
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

const CALLOUT_LABELS: Record<string, string> = {
  tip: 'Tip',
  note: 'Note',
  warning: 'Warning',
  tester: "The tester's view",
  deepdive: 'Deep dive',
};

export function Callout({ block }: { block: ContentBlock }) {
  const variant = block.callout?.variant ?? 'note';
  return (
    <div className={'callout ' + variant}>
      <span className="label">{CALLOUT_LABELS[variant] ?? 'Note'}</span>
      {block.callout?.title && <div className="title">{block.callout.title}</div>}
      <Markdown text={block.text} />
    </div>
  );
}

/**
 * A mermaid diagram. mermaid is large, so it is loaded only when a page has a diagram. It draws in
 * the app's theme, and again when the theme changes. If it cannot draw the source, the source is
 * shown instead, so the lesson never loses the content.
 */
export function Diagram({ source }: { source: string }) {
  const id = 'dgm' + useId().replace(/[^\w]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'light');

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'light'),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // Warm paper takes mermaid's softer neutral look, which sits better on the paper tone than the default.
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : theme === 'paper' ? 'neutral' : 'default' });
        const out = await mermaid.render(id + theme, source);
        if (live) setSvg(out.svg);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, source, theme]);

  if (failed) return <Markdown text={'```text\n' + source + '\n```'} />;
  return (
    <div className="diagram" role="img" aria-label="Diagram">
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="muted">Drawing the diagram…</span>}
    </div>
  );
}
