import { useEffect, useRef, useState } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { RunOverlay, type RunState } from './RunOverlay';
import { conceptHighlight } from '../lib/conceptHighlight';

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
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);

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
        <span className="spacer" />
        {toggle}
        <button className="run-btn" onClick={onRun} disabled={running}>
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
      {!run && (
        <div className="editor-idle">
          <b>Press ▶ Run</b> to run this against a real browser. You will see it drive the page
          live, along with anything you <span className="k">console.log</span>.
          <br />
          <span className="k">launch()</span> <span className="k">show()</span>{' '}
          <span className="k">login()</span> <span className="k">USERS</span>{' '}
          <span className="k">BASE_URL</span> are already available, so you do not need to import them.
        </div>
      )}

      {run && <RunOverlay run={run} onClose={onCloseRun} />}
    </div>
  );
}
