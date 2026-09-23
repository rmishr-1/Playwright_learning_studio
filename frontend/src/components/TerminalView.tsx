import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TerminalSession } from '../lib/terminalSession';

/**
 * The display of a TerminalSession (xterm.js). It holds nothing of its own: the session keeps the
 * output, the line being typed and the running command, so this display can be recreated in a
 * popped-out window, or back in the overlay, and show exactly what it showed before.
 */
export function TerminalView({ session, active }: { session: TerminalSession; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const t = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: { background: '#12161e', foreground: '#dbe2ee', cursor: '#93b8fb', selectionBackground: '#33415c' },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el);
    term.current = t;
    fit.current = f;
    session.attach(t);

    // Ctrl+C copies when text is selected, as in most terminals; otherwise it is an interrupt.
    const win = el.ownerDocument.defaultView ?? window;
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key === 'c' && t.hasSelection()) {
        void win.navigator.clipboard?.writeText(t.getSelection()).catch(() => undefined);
        return false;
      }
      return true;
    });
    const input = t.onData((data) => session.input(data));

    // Observed from the window the display is in, which is a different one once popped out.
    const resize = new win.ResizeObserver(() => {
      try {
        f.fit();
      } catch {
        // Hidden or not yet laid out. The next visible resize fits it.
      }
    });
    resize.observe(el);

    return () => {
      resize.disconnect();
      input.dispose();
      session.detach(t);
      t.dispose();
      term.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      try {
        fit.current?.fit();
      } catch {
        // Not laid out yet.
      }
      term.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return <div className="view terminal" ref={host} />;
}
