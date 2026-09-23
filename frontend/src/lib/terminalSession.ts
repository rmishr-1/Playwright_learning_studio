import type { Terminal } from '@xterm/xterm';
import { openRunStream, prepareRun, runTerminal, stopTerminal } from '../api/client';
import type { Workspace } from '../../../shared/contracts/course_day';

/** What a command needs from the editor: its code, the file it holds, and the day's workspace. */
export type EditorState = { code: string; file: string | null; workspace: Workspace };

const PROMPT = '\x1b[36m$\x1b[0m ';
const WELCOME =
  "This terminal runs the course's commands, such as \x1b[1mnpx playwright test\x1b[0m and \x1b[1mnode day3/hello.ts\x1b[0m.\r\n" +
  'Type \x1b[1mhelp\x1b[0m to see the commands you can run.\r\n';

/** Output kept for redrawing the terminal when it moves to or from its own window. */
const REPLAY_LIMIT = 2_000_000;

export type SessionEvents = {
  onStart: () => void;
  onFrame: (jpegBase64: string) => void;
  onEnd: (exitCode: number | null) => void;
};

/**
 * One Terminal's state: what it has printed, the line being typed, the history, and the command
 * that is running. It is kept apart from the xterm.js display (TerminalView), because the
 * display is recreated whenever the Terminal moves between the overlay and its own window. The
 * new display replays everything this session has written, and a running command carries on
 * without noticing the move.
 *
 * The backend never sees a keystroke, only a finished command line, which it checks against the
 * Playwright commands it accepts (backend/src/terminal/commands.ts). The command's output streams
 * over the same WebSocket a Run uses.
 */
export class TerminalSession {
  events: SessionEvents;
  private readonly getEditor: () => EditorState;
  private term: Terminal | null = null;
  private chunks: string[] = [];
  private size = 0;

  private line = '';
  private cursor = 0;
  private history: string[] = [];
  private historyAt = 0;
  private runId: string | null = null;
  /** From Enter until the command's exit: typing is ignored, and Ctrl+C stops the command. */
  private busy = false;
  private closeStream: (() => void) | null = null;
  /** A command whose stream was still being prepared must never start once this is set. */
  private disposed = false;

  constructor(getEditor: () => EditorState, events: SessionEvents) {
    this.getEditor = getEditor;
    this.events = events;
    this.write(WELCOME);
    this.prompt();
  }

  /** Shows this session in a display: everything written so far, then whatever comes next. */
  attach(t: Terminal): void {
    this.term = t;
    t.write(this.chunks.join(''));
  }

  detach(t: Terminal): void {
    if (this.term === t) this.term = null;
  }

  /** Undoes dispose(). React's development-mode double mount disposes a session it then keeps. */
  revive(): void {
    this.disposed = false;
  }

  /** Stops a running command and lets the stream go. The overlay calls this when it closes. */
  dispose(): void {
    this.disposed = true;
    if (this.runId) void stopTerminal(this.runId).catch(() => undefined);
    this.closeStream?.();
  }

  /** Types a command and runs it, as when Run is selected on a spec file. Ignored while busy. */
  typeAndRun(command: string): void {
    if (this.busy) return;
    this.line = command;
    this.cursor = command.length;
    this.redraw();
    void this.submit(this.line);
  }

  /** Every key and paste from the display. */
  input(data: string): void {
    if (this.busy) {
      // While a command runs, the only key that means anything is Ctrl+C.
      if (data === '\x03' && this.runId) void stopTerminal(this.runId).catch(() => undefined);
      return;
    }
    switch (data) {
      case '\r':
        void this.submit(this.line);
        return;
      case '\x7f':
      case '\b':
        if (this.cursor > 0) {
          this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
          this.cursor--;
          this.redraw();
        }
        return;
      case '\x1b[3~':
        if (this.cursor < this.line.length) {
          this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
          this.redraw();
        }
        return;
      case '\x03':
        this.write('^C\r\n');
        return this.prompt();
      case '\x0c':
        return this.clear();
      case '\x15':
        this.line = '';
        this.cursor = 0;
        return this.redraw();
      case '\x1b[A':
        if (this.historyAt > 0) {
          this.line = this.history[--this.historyAt];
          this.cursor = this.line.length;
          this.redraw();
        }
        return;
      case '\x1b[B':
        if (this.historyAt < this.history.length) {
          this.historyAt++;
          this.line = this.history[this.historyAt] ?? '';
          this.cursor = this.line.length;
          this.redraw();
        }
        return;
      case '\x1b[D':
        if (this.cursor > 0) {
          this.cursor--;
          this.write(data);
        }
        return;
      case '\x1b[C':
        if (this.cursor < this.line.length) {
          this.cursor++;
          this.write(data);
        }
        return;
      case '\x1b[H':
      case '\x1bOH':
        this.cursor = 0;
        return this.redraw();
      case '\x1b[F':
      case '\x1bOF':
        this.cursor = this.line.length;
        return this.redraw();
    }
    if (data.startsWith('\x1b')) return;
    // Typing, or a paste. A pasted line break runs what came before it.
    const newline = data.search(/[\r\n]/);
    const text = (newline === -1 ? data : data.slice(0, newline)).replace(/[\x00-\x1f]/g, '');
    if (text) {
      this.line = this.line.slice(0, this.cursor) + text + this.line.slice(this.cursor);
      this.cursor += text.length;
      this.redraw();
    }
    if (newline !== -1) void this.submit(this.line);
  }

  // ------------------------------------------------------------ internals

  private write(s: string): void {
    this.chunks.push(s);
    this.size += s.length;
    while (this.size > REPLAY_LIMIT && this.chunks.length > 1) this.size -= this.chunks.shift()!.length;
    this.term?.write(s);
  }

  private clear(): void {
    // Forget the replay too, so a display opened later does not bring the old output back.
    this.chunks = [];
    this.size = 0;
    this.term?.clear();
    this.write('\x1b[2J\x1b[H');
    this.redraw();
  }

  private redraw(): void {
    this.write('\r' + PROMPT + this.line + '\x1b[K');
    const back = this.line.length - this.cursor;
    if (back > 0) this.write('\x1b[' + back + 'D');
  }

  private prompt(): void {
    this.line = '';
    this.cursor = 0;
    this.write(PROMPT);
  }

  private finish(exitCode: number | null): void {
    if (!this.busy) return;
    this.busy = false;
    this.closeStream?.();
    this.closeStream = null;
    this.runId = null;
    this.events.onEnd(exitCode);
    this.write('\r\n');
    this.prompt();
  }

  private async submit(command: string): Promise<void> {
    this.write('\r\n');
    const trimmed = command.trim();
    if (!trimmed) return this.prompt();
    if (this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    this.historyAt = this.history.length;
    if (trimmed === 'clear' || trimmed === 'cls') {
      this.line = '';
      this.cursor = 0;
      return this.clear();
    }

    this.busy = true;
    try {
      // Attach the stream BEFORE starting the command, exactly as a Run does.
      const { run_id } = await prepareRun();
      if (this.disposed) {
        this.busy = false;
        return;
      }
      this.runId = run_id;
      this.events.onStart();
      this.closeStream = openRunStream(run_id, (event) => {
        if (event.event === 'term') this.write(event.data);
        else if (event.event === 'frame') this.events.onFrame(event.data);
        else if (event.event === 'exit') {
          if (event.open_url) window.open(event.open_url, '_blank', 'noopener');
          this.finish(event.code);
        }
      });
      const editor = this.getEditor();
      await runTerminal(run_id, trimmed, editor.code, editor.file, editor.workspace);
    } catch (e) {
      this.write('\x1b[31m' + (e as Error).message + '\x1b[0m\r\n');
      this.finish(1);
    }
  }
}
