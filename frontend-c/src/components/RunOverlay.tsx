import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RunResult, RunStatus } from '../../../shared/contracts/run';
import type { Workspace } from '../../../shared/contracts/course_day';
import { TerminalSession } from '../lib/terminalSession';
import { PopOut } from './PopOut';
import { TerminalView } from './TerminalView';

export type RunState = {
  status: RunStatus | 'running';
  frame: string | null;
  lines: string[];
  result: RunResult | null;
  /** Set once prepareRun() resolves. */
  run_id: string | null;
};

const STATUS_TEXT: Record<string, string> = {
  running: 'running',
  ok: 'finished',
  error: 'error',
  timeout: 'timed out',
  blocked: 'blocked',
  queued_out: 'queue full',
  stopped: 'stopped',
};

export type PanelId = 'browser' | 'console' | 'terminal';
/** Shows a panel; with `command`, also types that command into the Terminal and runs it. */
export type OverlayRequest = { tab: PanelId; nonce: number; command?: string };

/** Terminal command status, shown in the same kind of chip as a Run's. */
type TermStatus = 'running' | 'ok' | 'error' | 'stopped' | null;

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'browser', label: 'Browser' },
  { id: 'console', label: 'Console' },
  { id: 'terminal', label: 'Terminal' },
];

// ---------------------------------------------------------------- remembered layout

type Layout = {
  /** Which panels show in the overlay. A popped-out panel shows in its window instead. */
  visible: Record<PanelId, boolean>;
  /** Relative widths of the panels, adjusted by dragging the dividers between them. */
  weights: Record<PanelId, number>;
  /** The overlay's height, as a percentage of the editor pane. */
  height: number;
};

const LAYOUT_KEY = 'studio.runPanels.v1';
const DEFAULT_LAYOUT: Layout = {
  visible: { browser: true, console: false, terminal: false },
  weights: { browser: 1, console: 1, terminal: 1 },
  height: 58,
};

function readLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Partial<Layout> | null;
    if (!raw) return DEFAULT_LAYOUT;
    return {
      visible: { ...DEFAULT_LAYOUT.visible, ...raw.visible },
      weights: { ...DEFAULT_LAYOUT.weights, ...raw.weights },
      height: typeof raw.height === 'number' ? raw.height : DEFAULT_LAYOUT.height,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Remembering the layout is a convenience, never a requirement.
  }
}

// ---------------------------------------------------------------- the overlay

/**
 * Floats over the editor while a Run is in flight or the Terminal is open; dismissible, so the
 * editor gets its full height back. It has three panels, Browser, Console and Terminal, and
 * each can be shown or hidden with its toggle in the header, or popped out into a window of its
 * own with the button on the panel. The panels shown in the overlay sit side by side, and the
 * dividers between them can be dragged. Which panels show, their widths and the overlay's
 * height are remembered in this browser. Popped-out windows are not reopened on the next visit,
 * because a browser opens a window only when the learner clicks something.
 *
 * The Browser panel shows whichever started last, a Run or a Terminal command.
 */
export function RunOverlay({
  run,
  code,
  file,
  workspace,
  request,
  onClose,
}: {
  run: RunState | null;
  /** The editor's code, which Terminal commands save before they run. */
  code: string;
  /** The lesson file the editor holds, where the Terminal saves it. */
  file: string | null;
  /** The day's Terminal workspace. */
  workspace: Workspace;
  /** Asks the overlay to show a panel, such as the Terminal button in the editor's toolbar. */
  request: OverlayRequest | null;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = readLayout();
    // Opened for a particular panel: make sure that panel shows.
    const first: PanelId = request?.tab ?? 'browser';
    return { ...saved, visible: { ...saved.visible, [first]: true } };
  });
  const [poppedOut, setPoppedOut] = useState<Record<PanelId, boolean>>({ browser: false, console: false, terminal: false });
  const [source, setSource] = useState<'run' | 'terminal'>(run ? 'run' : 'terminal');
  const [termFrame, setTermFrame] = useState<string | null>(null);
  const [termStatus, setTermStatus] = useState<TermStatus>(null);

  useEffect(() => saveLayout(layout), [layout]);

  const show = (id: PanelId): void => setLayout((l) => (l.visible[id] ? l : { ...l, visible: { ...l.visible, [id]: true } }));
  const toggle = (id: PanelId): void => setLayout((l) => ({ ...l, visible: { ...l.visible, [id]: !l.visible[id] } }));
  const popOut = (id: PanelId): void => setPoppedOut((p) => ({ ...p, [id]: true }));
  const dockBack = (id: PanelId): void => {
    setPoppedOut((p) => ({ ...p, [id]: false }));
    show(id);
  };

  // The Terminal outlives its display, which is recreated when it moves to or from a window.
  const editorRef = useRef({ code, file, workspace });
  editorRef.current = { code, file, workspace };
  const [session] = useState(
    () => new TerminalSession(() => editorRef.current, { onStart: () => undefined, onFrame: () => undefined, onEnd: () => undefined }),
  );
  session.events = {
    onStart: () => {
      setSource('terminal');
      setTermFrame(null);
      setTermStatus('running');
    },
    onFrame: setTermFrame,
    onEnd: (exitCode) => setTermStatus(exitCode === 0 ? 'ok' : exitCode === 130 ? 'stopped' : 'error'),
  };
  useEffect(() => {
    session.revive();
    return () => session.dispose();
  }, [session]);

  useEffect(() => {
    if (!request) return;
    show(request.tab);
    if (request.command) session.typeAndRun(request.command);
  }, [request]);

  // A new Run takes over the Browser panel, and makes sure it can be seen.
  useEffect(() => {
    if (run?.status === 'running') {
      setSource('run');
      show('browser');
    }
  }, [run?.status, run?.run_id]);

  // An error is the thing the learner needs to read, so surface the Console without a click.
  useEffect(() => {
    if (run?.result && run.result.status !== 'ok') show('console');
  }, [run?.result]);

  // Dragging the grip resizes the overlay; dragging a divider resizes the panels either side.
  const dragging = useRef<null | { kind: 'height' } | { kind: 'divider'; left: PanelId; right: PanelId; x: number; width: number }>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const d = dragging.current;
      if (!d) return;
      if (d.kind === 'height') {
        const pane = document.querySelector('.pane-editor');
        if (!pane) return;
        const box = pane.getBoundingClientRect();
        const pct = ((box.bottom - e.clientY) / box.height) * 100;
        setLayout((l) => ({ ...l, height: Math.min(92, Math.max(22, pct)) }));
        return;
      }
      const dx = e.clientX - d.x;
      d.x = e.clientX;
      setLayout((l) => {
        const shown = PANELS.filter((p) => l.visible[p.id] && !poppedOut[p.id]).map((p) => p.id);
        const total = shown.reduce((n, id) => n + l.weights[id], 0);
        const delta = (dx / Math.max(d.width, 1)) * total;
        const min = total * 0.12;
        const a = l.weights[d.left] + delta;
        const b = l.weights[d.right] - delta;
        if (a < min || b < min) return l;
        return { ...l, weights: { ...l.weights, [d.left]: a, [d.right]: b } };
      });
    };
    const up = (): void => {
      dragging.current = null;
      document.body.classList.remove('dragging-divider');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [poppedOut]);

  // ---------------------------------------------------------------- panel contents

  const shot = run?.result?.screenshot ?? null;
  const image = source === 'terminal' ? termFrame : (run?.frame ?? shot);
  const browserStatus = source === 'terminal' ? termStatus : (run?.status ?? null);

  const chip = (status: string | null): ReactNode =>
    status ? <span className={'status ' + status}>{STATUS_TEXT[status] ?? status}</span> : null;

  const content: Record<PanelId, { status: ReactNode; body: (active: boolean) => ReactNode }> = {
    browser: {
      // Only when there is a page to report on: a Terminal command such as help opens none.
      status: image || browserStatus === 'running' ? chip(browserStatus) : null,
      body: () => (
        <div className="view browser">
          {image ? (
            <img src={'data:image/jpeg;base64,' + image} alt="The browser being driven by your code" />
          ) : (
            <span className="waiting">
              {browserStatus === 'running'
                ? 'Waiting for the browser…'
                : source === 'terminal'
                  ? 'Run npx playwright test in the Terminal to see the browser here.'
                  : 'This run never opened a page.'}
            </span>
          )}
        </div>
      ),
    },
    console: {
      status: (
        <>
          {chip(run?.status ?? null)}
          {run?.result && <span className="status muted">{run.result.duration_ms} ms</span>}
        </>
      ),
      body: () => <ConsoleBody run={run} />,
    },
    terminal: {
      status: chip(termStatus),
      body: (active) => <TerminalView session={session} active={active} />,
    },
  };

  const docked = PANELS.filter((p) => layout.visible[p.id] && !poppedOut[p.id]);

  const panel = (id: PanelId, label: string, inWindow: boolean): ReactNode => (
    <section className={'panel ' + id}>
      <header className="panel-head">
        <span className="panel-title">{label}</span>
        {content[id].status}
        <span className="spacer" />
        {inWindow ? (
          <button className="panel-btn" onClick={() => dockBack(id)} title={'Put the ' + label + ' back in the studio'}>
            ⇲ Back to the studio
          </button>
        ) : (
          <>
            <button className="panel-btn" onClick={() => popOut(id)} title={'Open the ' + label + ' in its own window'} aria-label={'Pop out the ' + label}>
              ⇱
            </button>
            <button className="panel-btn" onClick={() => toggle(id)} title={'Hide the ' + label} aria-label={'Hide the ' + label}>
              –
            </button>
          </>
        )}
      </header>
      {content[id].body(true)}
    </section>
  );

  return (
    <>
      <div className="overlay" style={{ height: layout.height + '%' }}>
        <div className="grip" onMouseDown={() => (dragging.current = { kind: 'height' })} />
        <div className="tabs">
          {PANELS.map((p) => (
            <button
              key={p.id}
              className={(layout.visible[p.id] || poppedOut[p.id] ? 'on' : '') + (poppedOut[p.id] ? ' out' : '')}
              aria-pressed={layout.visible[p.id] || poppedOut[p.id]}
              onClick={() => (poppedOut[p.id] ? window.open('', 'studio-' + p.id)?.focus() : toggle(p.id))}
              title={poppedOut[p.id] ? 'The ' + p.label + ' is in its own window' : (layout.visible[p.id] ? 'Hide' : 'Show') + ' the ' + p.label}
            >
              {p.label}
              {poppedOut[p.id] && <span className="out-mark"> ⇱</span>}
            </button>
          ))}
          <span className="spacer" />
          <button className="close" onClick={onClose} aria-label="Close results">
            ×
          </button>
        </div>

        <div className="panels" ref={row}>
          {docked.length === 0 && (
            <span className="waiting empty">
              {PANELS.some((p) => poppedOut[p.id])
                ? 'The panels are in their own windows. Select a name above to show a panel here too.'
                : 'Select Browser, Console, or Terminal above to show a panel.'}
            </span>
          )}
          {docked.map((p, i) => (
            <div key={p.id} className="panel-slot" style={{ flexGrow: layout.weights[p.id], flexBasis: 0 }}>
              {i > 0 && (
                <div
                  className="divider"
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={(e) => {
                    dragging.current = {
                      kind: 'divider',
                      left: docked[i - 1].id,
                      right: p.id,
                      x: e.clientX,
                      width: row.current?.getBoundingClientRect().width ?? 1,
                    };
                    document.body.classList.add('dragging-divider');
                    e.preventDefault();
                  }}
                />
              )}
              {panel(p.id, p.label, false)}
            </div>
          ))}
        </div>
      </div>

      {PANELS.filter((p) => poppedOut[p.id]).map((p) => (
        <PopOut key={p.id} name={p.id} title={p.label} onClosed={() => dockBack(p.id)}>
          {panel(p.id, p.label, true)}
        </PopOut>
      ))}
    </>
  );
}

/** The last Run's output, its error, and anything that stopped it. */
function ConsoleBody({ run }: { run: RunState | null }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run?.lines.length]);

  if (!run) {
    return (
      <div className="view console">
        <span className="waiting">Select ▶ Run to see what your code prints. Terminal output appears in the Terminal panel.</span>
      </div>
    );
  }
  return (
    <div className="view console" ref={logRef}>
      {run.lines.length === 0 && !run.result?.error && <span className="waiting">No output yet.</span>}
      {run.lines.length > 0 && <pre>{run.lines.join('\n')}</pre>}
      {run.result?.blocked_url && (
        <pre className="err">
          {'\nNavigation blocked: ' + run.result.blocked_url + '\nThe studio only lets your code reach the course’s practice apps.'}
        </pre>
      )}
      {run.status === 'timeout' && (
        <pre className="err">
          {'\nThe run was stopped at the time limit. Something may have waited indefinitely, such as a locator that never matched or a missing await.'}
        </pre>
      )}
      {run.result?.error && (
        <pre className="err">{'\n' + run.result.error.message + (run.result.error.stack ? '\n\n' + run.result.error.stack : '')}</pre>
      )}
      {run.result?.stderr && <pre className="err">{'\n' + run.result.stderr}</pre>}
    </div>
  );
}
