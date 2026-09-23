import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { TheoryPane } from '../components/TheoryPane';
import { OpenWeeks } from '../components/Markdown';
import { CodePane } from '../components/CodePane';
import type { RunState } from '../components/RunOverlay';
import type { EditorFile } from '../components/LessonBlocks';
import { planWeeks, type PlanWeek } from '../lib/coursePlan';
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

function Sidebar({
  weeks,
  progress,
  week,
  day,
  onHide,
}: {
  weeks: PlanWeek[];
  progress: Progress | null;
  week: number;
  day: number;
  /** Collapses the entire week list so the lesson gets the space. */
  onHide: () => void;
}) {
  const navigate = useNavigate();
  // Open weeks collapse. Only the week you are in is open to begin with; opening another leaves
  // the current one open too. Weeks not built yet are one line each and do not open.
  const [open, setOpen] = useState<number[]>([week]);

  useEffect(() => {
    setOpen((prev) => (prev.includes(week) ? prev : [...prev, week]));
  }, [week]);

  const toggle = (n: number): void =>
    setOpen((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const isDone = (w: number, d: number): boolean => !!progress?.progress['w' + w + 'd' + d]?.completed;
  const openWeeks = weeks.filter((w) => w.open);
  const totalDone = openWeeks.reduce((n, w) => n + w.days.filter((d) => isDone(w.week, d.day)).length, 0);
  const totalAvailable = openWeeks.reduce((n, w) => n + w.days.length, 0);

  return (
    <nav className="sidebar" aria-label="Weeks and days">
      {/* The master control: one click hides every week and hands the width to the lesson. */}
      <button className="wk-all" onClick={onHide} title="Hide the week list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span>All weeks</span>
        <span className="spacer" />
        <span className="count">
          {totalDone}/{totalAvailable}
        </span>
      </button>

      {weeks.map((w) => {
        if (!w.open) {
          return (
            <div className="wk-locked" key={w.week}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>Week {w.week}</span>
              <span className="pill">soon</span>
            </div>
          );
        }
        const isOpen = open.includes(w.week);
        const done = w.days.filter((d) => isDone(w.week, d.day)).length;
        return (
          <div className="wk" key={w.week}>
            <button
              className={'wk-title' + (isOpen ? ' open' : '')}
              onClick={() => toggle(w.week)}
              aria-expanded={isOpen}
            >
              <span className="dot" style={{ background: w.module.color }} aria-hidden="true" />
              <span>Week {w.week} · {w.module.name}</span>
              <span className="spacer" />
              {/* A collapsed week still has to show whether it is finished. */}
              <span className={'count' + (done === w.days.length ? ' all' : '')}>
                {done}/{w.days.length}
              </span>
            </button>
            <ul hidden={!isOpen}>
              {w.days.map((d) => {
                const on = w.week === week && d.day === day;
                const url = '/learn/w' + w.week + '/d' + d.day + '/p1';
                return (
                  <li key={d.day}>
                    <a
                      href={d.locked ? undefined : url}
                      className={(on ? 'on' : '') + (d.locked ? ' locked' : '') + (isDone(w.week, d.day) ? ' done' : '')}
                      aria-current={on ? 'page' : undefined}
                      title={d.title}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!d.locked) navigate(url);
                      }}
                    >
                      <span className="badge">{isDone(w.week, d.day) ? '✓' : 'D' + d.day}</span>
                      {/* One line with an ellipsis, full title on hover. */}
                      <span className="daytitle">{d.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
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
    if (!content.parts.some((p) => p.part === part)) {
      navigate('/learn/w' + week + '/d' + day + '/p' + content.parts[0].part, { replace: true });
      return;
    }
    recordProgress({ week, day, part })
      .then(setProgress)
      .catch(() => undefined);
  }, [content, week, day, part]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!draggingRef.current) return;
      const host = document.querySelector('.split');
      if (!host) return;
      const box = host.getBoundingClientRect();
      const pct = ((e.clientX - box.left) / box.width) * 100;
      setSplit(Math.min(78, Math.max(24, pct)));
    };
    const up = (): void => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

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
          <Sidebar weeks={weeks} progress={progress} week={week} day={day} onHide={() => setWeeksShown(false)} />
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
  const moduleName = weeks.find((w) => w.week === week)?.module.name;

  return (
    <OpenWeeks.Provider value={openWeeks}>
    <div className="body">
      {weeksShown && (
        <Sidebar weeks={weeks} progress={progress} week={week} day={day} onHide={() => setWeeksShown(false)} />
      )}
      <div className="day-main">
      {/* Where you are and what today is, above the lesson and the editor. */}
      <div className="day-head">
        <nav className="day-crumbs" aria-label="Breadcrumb">
          <Link to="/">Course index</Link>
          <span aria-hidden="true">/</span>
          <span>Week {week}{moduleName ? ' · ' + moduleName : ''}</span>
          <span aria-hidden="true">/</span>
          <b>Day {day}</b>
        </nav>
        <h1>{content.title}</h1>
      </div>
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
