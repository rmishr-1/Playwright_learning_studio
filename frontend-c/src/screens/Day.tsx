import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  getCourse,
  getDay,
  getMyProgress,
  openRunStream,
  prepareRun,
  recordProgress,
  runCode,
} from '../api/client';
import { TheoryPane, type DayLink } from '../components/TheoryPane';
import { OpenWeeks } from '../components/Markdown';
import { CodePane } from '../components/CodePane';
import type { RunState } from '../components/RunOverlay';
import type { EditorFile } from '../components/LessonBlocks';
import { planWeeks, weeksPhrase, type PlanWeek } from '../lib/coursePlan';
import { PRODUCT_NAME } from '../components/AppHeader';
import type { CourseDay } from '../../../shared/contracts/course_day';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';
import type { PartNumber } from '../../../shared/contracts/common';

const STARTER = `// Open a lesson's code in the editor, or write your own here, then select Run.
// launch() opens a browser and show(page) takes a screenshot. You do not need to import them.

const { browser, page } = await launch();
await page.setContent('<h1>Hello from Playwright</h1>');
await show(page);
await browser.close();
`;

/** The week list's width: draggable between these, and remembered per viewer. */
const SIDEBAR_KEY = 'studio.c.sidebar_width';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 290;

/** Never wider than 45% of the window, so the lesson and editor always keep most of it. */
const clampSidebar = (w: number): number =>
  Math.round(Math.min(SIDEBAR_MAX, window.innerWidth * 0.45, Math.max(SIDEBAR_MIN, w)));

/** Per-viewer convenience, so a throw in a private window must not break the page. */
function readSidebarWidth(): number {
  try {
    const n = Number(localStorage.getItem(SIDEBAR_KEY));
    return n >= SIDEBAR_MIN && n <= SIDEBAR_MAX ? n : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

/**
 * The week list, kept minimal: text and whitespace only. A week is its name and a faint count, and
 * clicking it folds its days away. A day is its number and its full title - titles wrap rather
 * than being cut off - with a tick in place of the number once it is done, and the day you are on
 * set in dark bold text with a thin orange line. Weeks not built yet share one faint line.
 */
function Sidebar({
  weeks,
  progress,
  week,
  day,
}: {
  weeks: PlanWeek[];
  progress: Progress | null;
  week: number;
  day: number;
}) {
  const navigate = useNavigate();
  // Only the week you are in is open to begin with; opening another leaves the current one open.
  const [open, setOpen] = useState<number[]>([week]);

  useEffect(() => {
    setOpen((prev) => (prev.includes(week) ? prev : [...prev, week]));
  }, [week]);

  const toggle = (n: number): void =>
    setOpen((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const isDone = (w: number, d: number): boolean => !!progress?.progress['w' + w + 'd' + d]?.completed;
  const built = weeks.filter((w) => w.open);
  const soon = weeks.filter((w) => !w.open).map((w) => w.week);

  return (
    <nav className="sidebar" aria-label="Weeks and days">
      {/* The product's name heads the week list. The list opens and closes from the ☰ button at
          the start of the lesson's tab row. */}
      <div className="sb-brand">{PRODUCT_NAME}</div>

      {built.map((w) => {
        const isOpen = open.includes(w.week);
        const done = w.days.filter((d) => isDone(w.week, d.day)).length;
        return (
          <div className="sb-week" key={w.week}>
            <button
              className="sb-week-head"
              onClick={() => toggle(w.week)}
              aria-expanded={isOpen}
              title={w.module.name + ' · ' + done + ' of ' + w.days.length + ' days done'}
            >
              <span>Week {w.week}</span>
              <span className="sb-week-count">{done}/{w.days.length}</span>
            </button>
            {/* Links straight inside a div, not a list: v2's `.sidebar li a` rules would restyle them. */}
            <div className="sb-days" hidden={!isOpen}>
              {w.days.map((d) => {
                const on = w.week === week && d.day === day;
                const dayDone = isDone(w.week, d.day);
                const url = '/learn/w' + w.week + '/d' + d.day + '/p1';
                return (
                  <a
                    key={d.day}
                    href={d.locked ? undefined : url}
                    className={'sb-day' + (on ? ' on' : '') + (dayDone ? ' done' : '') + (d.locked ? ' locked' : '')}
                    aria-current={on ? 'page' : undefined}
                    aria-label={'Day ' + d.day + ': ' + d.title + (dayDone ? ', done' : '')}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!d.locked) navigate(url);
                    }}
                  >
                    <span className="sb-num" aria-hidden="true">{dayDone ? '✓' : d.day}</span>
                    <span className="sb-title">{d.title}</span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}

      {soon.length > 0 && <div className="sb-soon">{weeksPhrase(soon)} · coming soon</div>}
    </nav>
  );
}

export function Day({
  appTheme,
  weeksOpen,
  onSetWeeksOpen,
}: {
  /** The editor starts on the page theme, and can then be overridden on its own. */
  appTheme: 'light' | 'dark';
  /**
   * Owned by App, because it outlives any one day. The week list and the course title trade
   * places: closed, the title sits on the tab row; open, the list takes that space instead.
   */
  weeksOpen: boolean;
  onSetWeeksOpen: (open: boolean) => void;
}) {
  // Drives the sidebar ticks and the gating. There is only the one record - see api/client.ts.
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    getMyProgress().then(setProgress).catch(() => undefined);
  }, []);
  const params = useParams();
  const navigate = useNavigate();
  // URLs read /learn/w2/d1/p3. The prefixes are part of the segment (see App.tsx), so strip
  // them here rather than in the route pattern.
  const week = Number((params.week ?? '').replace(/^w/, ''));
  const day = Number((params.day ?? '').replace(/^d/, ''));
  // The URL is user-editable, so narrow rather than cast: /p9 falls back to part 1 instead of
  // sending an invalid part number to the progress endpoint.
  const parsedPart = Number((params.part ?? '').replace(/^p/, ''));
  const part: PartNumber = parsedPart === 2 || parsedPart === 3 || parsedPart === 4 ? parsedPart : 1;
  // /plast means "this day's last tab" - where Previous goes from the next day's first tab, since the
  // number of tabs is only known once the day has loaded.
  const wantsLast = params.part === 'plast';

  const [index, setIndex] = useState<CourseIndex | null>(null);
  const [content, setContent] = useState<CourseDay | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState(false);
  const [code, setCode] = useState(STARTER);
  // The lesson file the editor holds, if any: the Terminal saves the editor there before a command.
  const [editorFile, setEditorFile] = useState<EditorFile>({ file: null, run: null });
  // A command a lesson asked the Terminal to run. The nonce makes the same command run again.
  const [command, setCommand] = useState<{ text: string; nonce: number } | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [running, setRunning] = useState(false);
  const [split, setSplit] = useState(52);
  // Remembered per viewer, so someone who works with the list open does not have to open it again
  // on every day.
  const weeksShown = weeksOpen;
  const setWeeksShown = onSetWeeksOpen;
  const problemRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  // The week list's width, dragged from the bar on its right edge like the lesson/editor bar.
  const [sidebarW, setSidebarW] = useState(readSidebarWidth);
  const sbDraggingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarW));
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [sidebarW]);

  useEffect(() => {
    getCourse()
      .then((i) => {
        setIndex(i);
        document.title = i.title;
      })
      .catch((e: unknown) => {
        // With no course at all, say so, rather than the "day does not exist" the day request
        // would otherwise report.
        if (e instanceof ApiError && e.code === 'CONTENT_MISSING') setEmpty(true);
      });
  }, []);

  useEffect(() => {
    setContent(null);
    setLocked(null);
    setError('');
    getDay(week, day)
      .then(setContent)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'DAY_LOCKED') setLocked(e.message);
        else setError((e as Error).message);
      });
  }, [week, day]);

  // Viewing a part is what completes it, so record on arrival. A URL can name a part the day no
  // longer has - a removed tab, or /p1 from a link that means "the start of this day" - so that is
  // sent on to the day's first tab instead, with `replace` so Back does not return to it, and
  // nothing is recorded for a part that does not exist.
  useEffect(() => {
    if (!content) return;
    if (wantsLast) {
      // Wait for THIS day's content, not the previous day's still on screen.
      if (content.week !== week || content.day !== day) return;
      navigate('/learn/w' + week + '/d' + day + '/p' + content.parts[content.parts.length - 1].part, { replace: true });
      return;
    }
    if (!content.parts.some((p) => p.part === part)) {
      navigate('/learn/w' + week + '/d' + day + '/p' + content.parts[0].part, { replace: true });
      return;
    }
    // Arriving only moves the resume point here. The part counts as read once the learner reaches
    // the end of its content (reachedEnd, below), not merely by opening it.
    recordProgress({ week, day, part, viewed: false })
      .then(setProgress)
      .catch(() => undefined);
  }, [content, week, day, part, wantsLast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (sbDraggingRef.current) {
        const body = document.querySelector('.body');
        if (body) setSidebarW(clampSidebar(e.clientX - body.getBoundingClientRect().left));
        return;
      }
      if (!draggingRef.current) return;
      const host = document.querySelector('.split');
      if (!host) return;
      const box = host.getBoundingClientRect();
      const pct = ((e.clientX - box.left) / box.width) * 100;
      setSplit(Math.min(78, Math.max(24, pct)));
    };
    const up = (): void => {
      draggingRef.current = false;
      sbDraggingRef.current = false;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  // The learner has reached the end of this part's content: record it as read. Once per part per
  // visit - the lesson pane can scroll past the end many times.
  const reportedRef = useRef<string | null>(null);
  const reachedEnd = useCallback(() => {
    const key = week + '/' + day + '/' + part;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    recordProgress({ week, day, part })
      .then(setProgress)
      .catch(() => {
        // Not recorded, so let the next time the end comes into view try again.
        reportedRef.current = null;
      });
  }, [week, day, part]);

  const loadIntoEditor = useCallback((snippet: string, meta?: EditorFile) => {
    problemRef.current = null;
    setCode(snippet);
    setEditorFile(meta ?? { file: null, run: null });
  }, []);

  const startProblem = useCallback((snippet: string, problemNumber: number, meta: EditorFile) => {
    problemRef.current = problemNumber;
    setCode(snippet.trim() + '\n');
    setEditorFile(meta);
  }, []);

  const runCommand = useCallback((text: string, load?: { code: string; meta: EditorFile }) => {
    if (load) {
      problemRef.current = null;
      setCode(load.code);
      setEditorFile(load.meta);
    }
    setCommand({ text, nonce: Date.now() });
  }, []);

  async function doRun(): Promise<void> {
    if (running) return;
    setRunning(true);
    setRun({ status: 'running', frame: null, lines: [], result: null, run_id: null });

    let close: (() => void) | undefined;
    try {
      // Attach the socket BEFORE the run so the first frames are not missed.
      const { run_id } = await prepareRun();
      // The Detach button needs the id to open its own connection to this run's stream.
      setRun((prev) => (prev ? { ...prev, run_id } : prev));
      close = openRunStream(run_id, (event) => {
        if (event.event === 'frame') {
          setRun((prev) => (prev ? { ...prev, frame: event.data } : prev));
        } else if (event.event === 'stdout') {
          setRun((prev) => (prev ? { ...prev, lines: [...prev.lines, event.text] } : prev));
        }
      });

      const result = await runCode({
        run_id,
        week,
        day,
        part,
        problem_number: problemRef.current,
        code,
      });
      setRun((prev) => ({
        status: result.status,
        frame: prev?.frame ?? null,
        lines: prev?.lines ?? [],
        result,
        run_id,
      }));
    } catch (e) {
      setRun({
        status: 'error',
        frame: null,
        lines: [],
        result: {
          run_id: '',
          status: 'error',
          stdout: '',
          stderr: '',
          error: { message: (e as Error).message, stack: '' },
          screenshot: null,
          duration_ms: 0,
          blocked_url: null,
        },
        run_id: null,
      });
    } finally {
      close?.();
      setRunning(false);
    }
  }

  // Declared before the early returns below, as every hook must be. The index lists open weeks
  // only, so this is the set a lesson link may lead into.
  const openWeeks = useMemo(() => (index ? new Set(index.weeks.map((w) => w.week)) : null), [index]);
  // Every planned week, for the sidebar and the breadcrumb's module name.
  const weeks = useMemo(() => planWeeks(index), [index]);
  // Every open day in course order, so Previous / Next can carry on past the ends of this day.
  const sequence = useMemo(
    () => weeks.filter((w) => w.open).flatMap((w) => w.days.filter((d) => !d.locked).map((d) => ({ week: w.week, day: d.day, title: d.title }))),
    [weeks],
  );
  const at = sequence.findIndex((x) => x.week === week && x.day === day);
  const dayLink = (x: (typeof sequence)[number] | undefined, lastTab: boolean): DayLink | undefined =>
    x && {
      label: (x.week !== week ? 'Week ' + x.week + ' · ' : '') + 'Day ' + x.day + ': ' + x.title,
      onGo: () => navigate('/learn/w' + x.week + '/d' + x.day + (lastTab ? '/plast' : '/p1')),
    };
  // Previous from the first tab lands on the day before's LAST tab; Next from the last tab on the
  // next day's first. Neither exists at the very start or end of what is published.
  const prevDay = at > 0 ? dayLink(sequence[at - 1], true) : undefined;
  const nextDay = at >= 0 ? dayLink(sequence[at + 1], false) : undefined;

  if (empty) {
    return (
      <div className="centered">
        <div className="notice">The course has no lessons yet.</div>
      </div>
    );
  }

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;

  if (locked !== null) {
    return (
      <div className="body">
        {index && weeksShown && (
          <Sidebar weeks={weeks} progress={progress} week={week} day={day} />
        )}
        <div className="centered">
          {!weeksShown && (
            <p style={{ margin: '0 0 14px' }}>
              <button className="btn ghost small" onClick={() => setWeeksShown(true)}>
                ☰ Show weeks
              </button>
            </p>
          )}
          <h1>Week {week} - Day {day}</h1>
          <p className="muted" style={{ fontSize: 16 }}>{locked}</p>
          <div className="notice" style={{ marginTop: 18 }}>
            This day is not open yet.
          </div>
          <p style={{ marginTop: 20 }}>
            <button className="btn ghost" onClick={() => navigate('/learn/w1/d1/p1')}>
              Back to the first day
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (!content || !index) return <div className="centered muted">Loading…</div>;

  const activePart = content.parts.find((p) => p.part === part) ?? content.parts[0];
  const viewed = progress?.progress['w' + week + 'd' + day]?.parts_viewed ?? [];

  return (
    <OpenWeeks.Provider value={openWeeks}>
    <div className="body" style={{ ['--sb-w' as string]: sidebarW + 'px' }}>
      {weeksShown && (
        <>
          <Sidebar weeks={weeks} progress={progress} week={week} day={day} />
          <div
            className="gutter sb-gutter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the week list"
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            aria-valuenow={sidebarW}
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onMouseDown={(e) => {
              e.preventDefault();
              sbDraggingRef.current = true;
              document.body.classList.add('resizing');
            }}
            onDoubleClick={() => setSidebarW(SIDEBAR_DEFAULT)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              setSidebarW((w) => clampSidebar(w + (e.key === 'ArrowRight' ? 16 : -16)));
            }}
          />
        </>
      )}
      {/* Where you are and the day's title live in the header, so the split starts right here. */}
      <div className="day-main">
      <div className="split">
        <div style={{ flex: '0 0 ' + split + '%', minWidth: 0, display: 'flex' }}>
          <TheoryPane
            parts={content.parts}
            active={activePart.part}
            onSelect={(p) => navigate('/learn/w' + week + '/d' + day + '/p' + p)}
            viewed={viewed}
            onLoadIntoEditor={loadIntoEditor}
            onRunCommand={runCommand}
            onStartProblem={startProblem}
            weeksShown={weeksShown}
            onToggleWeeks={() => setWeeksShown(!weeksShown)}
            courseTitle={index.title}
            prevDay={prevDay}
            nextDay={nextDay}
            onReachedEnd={reachedEnd}
          />
        </div>
        <div className="gutter" onMouseDown={() => (draggingRef.current = true)} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <CodePane
            code={code}
            onChange={setCode}
            onRun={() => void doRun()}
            running={running}
            run={run}
            onCloseRun={() => setRun(null)}
            enabled={activePart.has_runnable_code}
            appTheme={appTheme}
            editorFile={editorFile}
            workspace={content.workspace}
            command={command}
          />
        </div>
      </div>
      </div>
    </div>
    </OpenWeeks.Provider>
  );
}
