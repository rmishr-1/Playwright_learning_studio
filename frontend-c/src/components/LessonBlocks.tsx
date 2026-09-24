import { useEffect, useId, useRef, useState } from 'react';
import { Markdown, highlightInto } from './Markdown';
import { fence } from '../lib/fence';
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

const DIAGRAM_FONT = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif';

/**
 * Diagram colours for each page theme, from the app's palette: boxes a soft tint with a navy (light
 * blue on dark) outline and text in the heading colour, lines in the muted grey, notes in the
 * warning wash, and the panel colour behind edge labels. Every key is set for every theme, because
 * mermaid keeps variables from one initialize to the next.
 */
const DIAGRAM_COLOURS: Record<string, Record<string, string | boolean>> = {
  light: {
    darkMode: false, background: '#ffffff', textColor: '#14213d', lineColor: '#56627a',
    primaryColor: '#eef2fa', primaryBorderColor: '#1a4fa0', primaryTextColor: '#0e1f45',
    secondaryColor: '#fff1e8', secondaryBorderColor: '#c2410c', secondaryTextColor: '#0e1f45',
    tertiaryColor: '#f4f6fa', tertiaryBorderColor: '#9aa6ba', tertiaryTextColor: '#14213d',
    mainBkg: '#eef2fa', nodeBorder: '#1a4fa0', clusterBkg: '#f4f6fa', clusterBorder: '#c9d1de',
    edgeLabelBackground: '#ffffff', titleColor: '#0e1f45',
    noteBkgColor: '#fdf3e3', noteBorderColor: '#d9a441', noteTextColor: '#14213d',
    actorBkg: '#eef2fa', actorBorder: '#1a4fa0', actorTextColor: '#0e1f45', actorLineColor: '#7d889d',
    signalColor: '#56627a', signalTextColor: '#14213d', labelBoxBkgColor: '#eef2fa', labelBoxBorderColor: '#1a4fa0',
    labelTextColor: '#0e1f45', loopTextColor: '#14213d', activationBkgColor: '#dfe7f7', activationBorderColor: '#1a4fa0',
    sequenceNumberColor: '#ffffff',
  },
  paper: {
    darkMode: false, background: '#fbf6ea', textColor: '#2f2a21', lineColor: '#675d48',
    primaryColor: '#f1e7d2', primaryBorderColor: '#2e4274', primaryTextColor: '#1f2b4d',
    secondaryColor: '#f6e2d3', secondaryBorderColor: '#b4410f', secondaryTextColor: '#2f2a21',
    tertiaryColor: '#efe5d0', tertiaryBorderColor: '#cdbd9c', tertiaryTextColor: '#2f2a21',
    mainBkg: '#f1e7d2', nodeBorder: '#2e4274', clusterBkg: '#f4eddd', clusterBorder: '#d6c7a8',
    edgeLabelBackground: '#fbf6ea', titleColor: '#1f2b4d',
    noteBkgColor: '#f5e4c4', noteBorderColor: '#c9a45c', noteTextColor: '#2f2a21',
    actorBkg: '#f1e7d2', actorBorder: '#2e4274', actorTextColor: '#1f2b4d', actorLineColor: '#958667',
    signalColor: '#675d48', signalTextColor: '#2f2a21', labelBoxBkgColor: '#f1e7d2', labelBoxBorderColor: '#2e4274',
    labelTextColor: '#1f2b4d', loopTextColor: '#2f2a21', activationBkgColor: '#e8dcc3', activationBorderColor: '#2e4274',
    sequenceNumberColor: '#fbf6ea',
  },
  dark: {
    darkMode: true, background: '#1a1f29', textColor: '#d7dde9', lineColor: '#97a2b7',
    primaryColor: '#243049', primaryBorderColor: '#8fb0f2', primaryTextColor: '#e9edf6',
    secondaryColor: '#3a2618', secondaryBorderColor: '#ff7a3d', secondaryTextColor: '#f6e6da',
    tertiaryColor: '#232936', tertiaryBorderColor: '#4a5468', tertiaryTextColor: '#d7dde9',
    mainBkg: '#243049', nodeBorder: '#8fb0f2', clusterBkg: '#20263a', clusterBorder: '#3a4560',
    edgeLabelBackground: '#1a1f29', titleColor: '#e9edf6',
    noteBkgColor: '#33260f', noteBorderColor: '#e3a250', noteTextColor: '#f3e3c8',
    actorBkg: '#243049', actorBorder: '#8fb0f2', actorTextColor: '#e9edf6', actorLineColor: '#6b7690',
    signalColor: '#97a2b7', signalTextColor: '#d7dde9', labelBoxBkgColor: '#243049', labelBoxBorderColor: '#8fb0f2',
    labelTextColor: '#e9edf6', loopTextColor: '#d7dde9', activationBkgColor: '#2d3a58', activationBorderColor: '#8fb0f2',
    sequenceNumberColor: '#1a1f29',
  },
};

/** Every mermaid draw gets its own id: see drawDiagram. */
let drawCount = 0;
/** mermaid's settings are page-wide, so draws take turns: each sets the theme, then draws. */
let drawQueue: Promise<unknown> = Promise.resolve();

/**
 * Draws one diagram as SVG text, one draw at a time. Each draw has an id never used before:
 * before drawing, mermaid removes whatever element on the page already has the id it is given,
 * and reusing an id - the same diagram drawn again in the same theme, or two overlapping draws
 * of it - deleted the diagram already on screen, or the other draw's scratch space, leaving a
 * blank box or the source text. A failed draw is tried once more before giving up.
 */
function drawDiagram(base: string, source: string, theme: string): Promise<string> {
  const run = async (): Promise<string> => {
    const { default: mermaid } = await import('mermaid');
    // mermaid's 'base' theme, coloured from the app's own palette for each page theme. Its stock
    // themes clash: 'dark' draws near-black boxes that vanish into the dark panel, and 'neutral'
    // puts cool grey boxes and pure black text on warm paper.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: { ...(DIAGRAM_COLOURS[theme] ?? DIAGRAM_COLOURS.light), fontFamily: DIAGRAM_FONT, fontSize: '14px' },
    });
    for (let attempt = 1; ; attempt++) {
      const id = base + 'x' + ++drawCount;
      try {
        return (await mermaid.render(id, source)).svg;
      } catch (e) {
        // A failed draw can leave its scratch elements behind; clear them before trying again.
        document.getElementById(id)?.remove();
        document.getElementById('d' + id)?.remove();
        if (attempt >= 2) throw e;
      }
    }
  };
  const next = drawQueue.then(run, run);
  drawQueue = next.catch(() => undefined);
  return next;
}

/**
 * A mermaid diagram. mermaid is large, so it is loaded only when a page has a diagram. It draws in
 * the app's theme, and again when the theme changes. If it cannot draw the source, the source is
 * shown instead, so the lesson never loses the content.
 */
export function Diagram({ source }: { source: string }) {
  const id = 'dgm' + useId().replace(/[^\w]/g, '');
  // The SVG and a number that changes with every draw, so React always puts the new drawing in.
  const [drawn, setDrawn] = useState<{ svg: string; n: number } | null>(null);
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
    drawDiagram(id, source, theme)
      .then((svg) => {
        if (!live) return;
        setFailed(false);
        setDrawn((prev) => ({ svg, n: (prev?.n ?? 0) + 1 }));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, source, theme]);

  if (failed) return <Markdown text={fence('text', source)} />;
  return (
    <div className="diagram" role="img" aria-label="Diagram">
      {drawn ? (
        <div key={drawn.n} dangerouslySetInnerHTML={{ __html: drawn.svg }} />
      ) : (
        <span className="muted">Drawing the diagram…</span>
      )}
    </div>
  );
}
