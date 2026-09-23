import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { openRunStream, prepareRun, runTerminal, stopTerminal } from '../api/client';

const PROMPT = '\x1b[36m$\x1b[0m ';
const WELCOME =
  'This terminal runs Playwright commands on the code in the editor, such as \x1b[1mnpx playwright test\x1b[0m.\r\n' +
  'Type \x1b[1mhelp\x1b[0m to see the commands you can run.\r\n';

/**
 * The run overlay's Terminal tab. It is a real terminal display (xterm.js) with a small line
 * editor of its own: the backend never sees a keystroke, only a finished command line, which it
 * checks against the Playwright commands it accepts (backend/src/terminal/commands.ts).
 *
 * The command's output streams over the same WebSocket a Run uses. Its live browser frames are
 * handed to the overlay through onFrame, so the Browser tab shows the test as it runs.
 */
export function TerminalView({
  code,
  active,
  autorun,
  onStart,
  onFrame,
  onEnd,
}: {
  /** The editor's current code. Every command saves it as the spec file it runs. */
  code: string;
  /** True while the Terminal tab is the one showing, so the display can be sized and focused. */
  active: boolean;
  /** A command to type and run, as when Run is selected on a spec file. Ignored while busy. */
  autorun: { command: string; nonce: number } | null;
  onStart: () => void;
  onFrame: (jpegBase64: string) => void;
  onEnd: (exitCode: number | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const typeAndRun = useRef<((command: string) => void) | null>(null);

  // Read at the moment a command starts, so a command always runs what the editor shows then.
  const codeRef = useRef(code);
  codeRef.current = code;
  const handlers = useRef({ onStart, onFrame, onEnd });
  handlers.current = { onStart, onFrame, onEnd };

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: { background: '#12161e', foreground: '#dbe2ee', cursor: '#93b8fb', selectionBackground: '#33415c' },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
    fit.current = f;

    let line = '';
    let cursor = 0;
    const history: string[] = [];
    let historyAt = 0;
    let runId: string | null = null;
    /** From Enter until the command's exit: typing is ignored, and Ctrl+C stops the command. */
    let busy = false;
    let closeStream: (() => void) | null = null;
    // Set when this terminal is torn down: closing the overlay, or React's development-mode
    // double mount. A command whose stream was still being prepared must then never start,
    // or it would run on in the background with nothing showing it.
    let disposed = false;

    const redraw = (): void => {
      t.write('\r' + PROMPT + line + '\x1b[K');
      const back = line.length - cursor;
      if (back > 0) t.write('\x1b[' + back + 'D');
    };
    const prompt = (): void => {
      line = '';
      cursor = 0;
      t.write(PROMPT);
    };
    const insert = (text: string): void => {
      line = line.slice(0, cursor) + text + line.slice(cursor);
      cursor += text.length;
      redraw();
    };

    const finish = (exitCode: number | null): void => {
      if (!busy) return;
      busy = false;
      closeStream?.();
      closeStream = null;
      runId = null;
      handlers.current.onEnd(exitCode);
      t.write('\r\n');
      prompt();
    };

    const submit = async (command: string): Promise<void> => {
      t.write('\r\n');
      const trimmed = command.trim();
      if (!trimmed) return prompt();
      if (history[history.length - 1] !== trimmed) history.push(trimmed);
      historyAt = history.length;
      if (trimmed === 'clear' || trimmed === 'cls') {
        t.clear();
        t.write('\x1b[2J\x1b[H');
        return prompt();
      }

      busy = true;
      try {
        // Attach the stream BEFORE starting the command, exactly as a Run does.
        const { run_id } = await prepareRun();
        if (disposed) return;
        runId = run_id;
        handlers.current.onStart();
        closeStream = openRunStream(run_id, (event) => {
          if (event.event === 'term') t.write(event.data);
          else if (event.event === 'frame') handlers.current.onFrame(event.data);
          else if (event.event === 'exit') {
            if (event.open_url) window.open(event.open_url, '_blank', 'noopener');
            finish(event.code);
          }
        });
        await runTerminal(run_id, trimmed, codeRef.current);
      } catch (e) {
        t.write('\x1b[31m' + (e as Error).message + '\x1b[0m\r\n');
        finish(1);
      }
    };

    // Ctrl+C copies when text is selected, as in most terminals; otherwise it is an interrupt.
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key === 'c' && t.hasSelection()) {
        void navigator.clipboard?.writeText(t.getSelection()).catch(() => undefined);
        return false;
      }
      return true;
    });

    const input = t.onData((data) => {
      if (busy) {
        // While a command runs, the only key that means anything is Ctrl+C.
        if (data === '\x03' && runId) void stopTerminal(runId).catch(() => undefined);
        return;
      }
      switch (data) {
        case '\r':
          void submit(line);
          return;
        case '\x7f':
        case '\b':
          if (cursor > 0) {
            line = line.slice(0, cursor - 1) + line.slice(cursor);
            cursor--;
            redraw();
          }
          return;
        case '\x1b[3~':
          if (cursor < line.length) {
            line = line.slice(0, cursor) + line.slice(cursor + 1);
            redraw();
          }
          return;
        case '\x03':
          t.write('^C\r\n');
          return prompt();
        case '\x0c':
          t.clear();
          return redraw();
        case '\x15':
          line = '';
          cursor = 0;
          return redraw();
        case '\x1b[A':
          if (historyAt > 0) {
            line = history[--historyAt];
            cursor = line.length;
            redraw();
          }
          return;
        case '\x1b[B':
          if (historyAt < history.length) {
            historyAt++;
            line = history[historyAt] ?? '';
            cursor = line.length;
            redraw();
          }
          return;
        case '\x1b[D':
          if (cursor > 0) {
            cursor--;
            t.write(data);
          }
          return;
        case '\x1b[C':
          if (cursor < line.length) {
            cursor++;
            t.write(data);
          }
          return;
        case '\x1b[H':
        case '\x1bOH':
          cursor = 0;
          return redraw();
        case '\x1b[F':
        case '\x1bOF':
          cursor = line.length;
          return redraw();
      }
      if (data.startsWith('\x1b')) return;
      // Typing, or a paste. A pasted line break runs what came before it.
      const newline = data.search(/[\r\n]/);
      const text = (newline === -1 ? data : data.slice(0, newline)).replace(/[\x00-\x1f]/g, '');
      if (text) insert(text);
      if (newline !== -1) void submit(line);
    });

    t.write(WELCOME);
    prompt();
    typeAndRun.current = (command) => {
      if (busy) return;
      line = command;
      cursor = command.length;
      redraw();
      void submit(line);
    };

    const resize = new ResizeObserver(() => {
      try {
        f.fit();
      } catch {
        // Hidden or not yet laid out. The next visible resize fits it.
      }
    });
    resize.observe(host.current);

    return () => {
      disposed = true;
      resize.disconnect();
      input.dispose();
      if (runId) void stopTerminal(runId).catch(() => undefined);
      closeStream?.();
      t.dispose();
      term.current = null;
      typeAndRun.current = null;
    };
  }, []);

  useEffect(() => {
    if (autorun) typeAndRun.current?.(autorun.command);
  }, [autorun?.nonce]);

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

  return <div className="view terminal" ref={host} style={{ display: active ? undefined : 'none' }} />;
}
