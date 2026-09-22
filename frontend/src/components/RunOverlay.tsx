import { useEffect, useRef, useState } from 'react';
import type { RunResult, RunStatus } from '../../../shared/contracts/run';

export type RunState = {
  status: RunStatus | 'running';
  frame: string | null;
  lines: string[];
  result: RunResult | null;
  /** Set once prepareRun() resolves. Lets the Detach button reconnect to this run's own stream. */
  run_id: string | null;
};

const STATUS_TEXT: Record<string, string> = {
  running: 'running',
  ok: 'finished',
  error: 'error',
  timeout: 'timed out',
  blocked: 'blocked',
  queued_out: 'queue full',
};

/**
 * Pops the live view out into its own window, still connected to the run's own WebSocket
 * stream - not a snapshot, so it keeps painting new frames as the run continues. Window
 * features (not just `_blank`) are what asks the browser for a separate window rather than a
 * new tab. Collapses the in-page overlay afterwards: the point of detaching is to hand the
 * editor pane its height back, not to show the same feed twice.
 *
 * The window itself seeds its starting frame from GET /run/:run_id/last-frame (see RunView.tsx)
 * rather than anything handed to it here - `noopener` means it does not share this page's
 * sessionStorage, and a run that already finished would leave it with nothing to show anyway
 * once the original listener has drained the stream (see runner.ts).
 */
function detach(runId: string, onClose: () => void): void {
  window.open('/run/' + runId, '_blank', 'popup=yes,width=980,height=760,noopener,noreferrer');
  onClose();
}

/**
 * Floats over the editor while a run is in flight; dismissible, so the editor gets its full
 * height back. Two views: the live browser and the console.
 */
export function RunOverlay({ run, onClose }: { run: RunState; onClose: () => void }) {
  const [tab, setTab] = useState<'browser' | 'console'>('browser');
  const [height, setHeight] = useState(58);
  const dragging = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // An error is the thing the learner needs to read, so surface it without a click.
  useEffect(() => {
    if (run.result && run.result.status !== 'ok') setTab('console');
  }, [run.result]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run.lines.length]);

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!dragging.current) return;
      const pane = document.querySelector('.pane-editor');
      if (!pane) return;
      const box = pane.getBoundingClientRect();
      const pct = ((box.bottom - e.clientY) / box.height) * 100;
      setHeight(Math.min(92, Math.max(22, pct)));
    };
    const up = (): void => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const shot = run.result?.screenshot ?? null;
  const image = run.frame ?? shot;

  return (
    <div className="overlay" style={{ height: height + '%' }}>
      <div className="grip" onMouseDown={() => (dragging.current = true)} />
      <div className="tabs">
        <button className={tab === 'browser' ? 'on' : ''} onClick={() => setTab('browser')}>
          Browser
        </button>
        <button className={tab === 'console' ? 'on' : ''} onClick={() => setTab('console')}>
          Console
        </button>
        <span className="spacer" />
        <span className={'status ' + run.status}>{STATUS_TEXT[run.status] ?? run.status}</span>
        {run.result && (
          <span className="status" style={{ color: '#8a94a6' }}>
            {run.result.duration_ms} ms
          </span>
        )}
        {run.run_id && (
          <button
            className="expand"
            onClick={() => detach(run.run_id!, onClose)}
            title="Detach the live browser into its own window"
          >
            ⇱
          </button>
        )}
        <button className="close" onClick={onClose} aria-label="Close results">
          ×
        </button>
      </div>

      {tab === 'browser' ? (
        <div className="view browser">
          {image ? (
            <img src={'data:image/jpeg;base64,' + image} alt="The browser being driven by your code" />
          ) : (
            <span className="waiting">
              {run.status === 'running' ? 'Waiting for the browser…' : 'This run never opened a page.'}
            </span>
          )}
        </div>
      ) : (
        <div className="view console" ref={logRef}>
          {run.lines.length === 0 && !run.result?.error && (
            <span className="waiting">No output yet.</span>
          )}
          {run.lines.length > 0 && <pre>{run.lines.join('\n')}</pre>}
          {run.result?.blocked_url && (
            <pre className="err">
              {'\nNavigation blocked: ' + run.result.blocked_url +
                '\nThe studio only lets your code reach the course’s practice apps.'}
            </pre>
          )}
          {run.status === 'timeout' && (
            <pre className="err">
              {'\nThe run was stopped at the time limit. Something may have waited indefinitely, such as a locator that never matched or a missing await.'}
            </pre>
          )}
          {run.result?.error && (
            <pre className="err">
              {'\n' + run.result.error.message + (run.result.error.stack ? '\n\n' + run.result.error.stack : '')}
            </pre>
          )}
          {run.result?.stderr && <pre className="err">{'\n' + run.result.stderr}</pre>}
        </div>
      )}
    </div>
  );
}
