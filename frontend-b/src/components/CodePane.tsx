import { useEffect, useRef, useState } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { RunOverlay, type OverlayRequest, type RunState } from './RunOverlay';
import { isSpecFile } from './Markdown';
import { conceptHighlight } from '../lib/conceptHighlight';
import type { EditorFile } from './LessonBlocks';
import type { Workspace } from '../../../shared/contracts/course_day';

const LANGUAGES = [
  { id: 'ts', label: 'TypeScript', ready: true },
  { id: 'js', label: 'JavaScript', ready: false },
  { id: 'py', label: 'Python', ready: false },
  { id: 'java', label: 'Java', ready: false },
];

const THEME_KEY = 'studio.editor_theme';

/** Per-viewer convenience only, so a throw in a private window must not break the editor. */
function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function CodePane({
  code,
  onChange,
  onRun,
  running,
  run,
  onCloseRun,
  enabled,
  appTheme,
  editorFile,
  workspace,
  command,
}: {
  code: string;
  onChange: (v: string) => void;
  onRun: () => void;
  running: boolean;
  run: RunState | null;
  onCloseRun: () => void;
  /** False on a part with nothing to run - the editor shows an honest empty state instead. */
  enabled: boolean;
  /** The page theme. The editor follows it, and can then be overridden on its own. */
  appTheme: 'dark' | 'light';
  /** The lesson file the editor holds, and the command that runs it. */
  editorFile: EditorFile;
  /** The day's Terminal workspace. */
  workspace: Workspace;
  /** A command a lesson asked the Terminal to run. */
  command: { text: string; nonce: number } | null;
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);
  // The Terminal keeps the overlay open without a Run. The nonce re-selects its tab when the
  // overlay is already open on another one.
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [request, setRequest] = useState<OverlayRequest | null>(null);
  const openTerminal = (command?: string): void => {
    setTerminalOpen(true);
    setRequest({ tab: 'terminal', nonce: Date.now(), command });
  };
  // A lesson file runs with its own command, in the Terminal, exactly as the lesson says. A spec
  // file with no file of its own cannot run in the Run button's harness either, so Run hands it to
  // the Terminal instead of failing on the import line. Anything else is the harness's.
  const run_ = (): void =>
    editorFile.run ? openTerminal(editorFile.run) : isSpecFile(code) ? openTerminal('npx playwright test') : onRun();

  useEffect(() => {
    if (command) openTerminal(command.text);
  }, [command]); // eslint-disable-line react-hooks/exhaustive-deps

  // Two toggles exist - the page one bottom-left and this one - so they must not fight.
  // Changing the page theme resets the editor to match; the editor toggle then deviates.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setTheme(appTheme);
  }, [appTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Remembering the choice is a convenience, never a requirement.
    }
  }, [theme]);

  const toggle = (
    <button
      className="icon-btn"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? 'Switch the editor to light' : 'Switch the editor to dark'}
      aria-label={theme === 'dark' ? 'Switch the editor to light' : 'Switch the editor to dark'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );

  if (!enabled) {
    return (
      <div className="pane-editor" data-editor-theme={theme}>
        <div className="editor-head">
          <span>editor</span>
          <span className="spacer" />
          {toggle}
        </div>
        <div className="editor-empty">
          <div>
            <p style={{ margin: '0 0 6px' }}>This part has no code to run.</p>
            <p style={{ margin: 0, fontSize: 12.5 }}>
              It is written material. The editor returns on the next part.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pane-editor" data-editor-theme={theme}>
      <div className="editor-head">
        {/* The course is TypeScript throughout; the other three are listed so the shape of
            the platform is honest about what is coming, and disabled so it cannot mislead. */}
        <select className="lang" value="ts" onChange={() => undefined}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} disabled={!l.ready}>
              {l.label}
              {l.ready ? '' : ' — soon'}
            </option>
          ))}
        </select>
        {editorFile.file && (
          <span className="editor-file" title={'The editor holds ' + editorFile.file + '. The Terminal saves it there before each command.'}>
            {editorFile.file}
          </span>
        )}
        <span className="spacer" />
        {toggle}
        <button className="term-btn" onClick={() => openTerminal()} title="Open the Terminal, to run npx playwright test on this code">
          &gt;_ Terminal
        </button>
        <button
          className="run-btn"
          onClick={run_}
          disabled={running}
          title={editorFile.run ? 'Runs ' + editorFile.run + ' in the Terminal' : undefined}
        >
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="editor-body">
        <CodeMirror
          value={code}
          height="100%"
          theme={theme === 'dark' ? oneDark : 'light'}
          // Wrap rather than scroll sideways: code that runs off the edge is code the
          // learner does not read. EditorView comes from @uiw/react-codemirror, NOT from
          // @codemirror/view - importing that directly pulls in a second copy of
          // @codemirror/state and the editor dies on "Unrecognized extension value". (This is
          // also why conceptHighlight.ts imports Decoration/ViewPlugin straight from
          // @codemirror/view instead - vite.config.ts's resolve.dedupe is what makes that
          // safe, by forcing a single copy of the package regardless of import path.)
          extensions={[javascript({ typescript: true }), EditorView.lineWrapping, conceptHighlight]}
          onChange={onChange}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
        />
      </div>

      {/* Fills what was otherwise a large dead area below a few lines of code, and tells the
          learner what Run will actually do before they press it. */}
      {!run && !terminalOpen && (
        <div className="editor-idle">
          <b>Select ▶ Run</b> to run this code. If it opens a browser, you see a screenshot of the
          page. Anything it prints with <span className="k">console.log</span> appears in the Console tab.
          <br />
          <span className="k">launch()</span> and <span className="k">show()</span> are already
          available, so you do not need to import them.
          <br />
          <b>Select &gt;_ Terminal</b> to type the course's commands, such as{' '}
          <span className="k">npx playwright test</span> and <span className="k">node day3/hello.ts</span>.
        </div>
      )}

      {(run || terminalOpen) && (
        <RunOverlay
          run={run}
          code={code}
          file={editorFile.file}
          workspace={workspace}
          request={request}
          onClose={() => {
            setTerminalOpen(false);
            onCloseRun();
          }}
        />
      )}
    </div>
  );
}
