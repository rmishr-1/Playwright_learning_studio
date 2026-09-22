import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TheoryPane } from '../components/TheoryPane';
import { CodePane } from '../components/CodePane';
import type { RunState } from '../components/RunOverlay';
import type { CourseDay } from '../../../shared/contracts/course_day';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';
import type { PartNumber } from '../../../shared/contracts/common';

const STARTER = `// The studio gives you launch(), show(), login(), USERS and BASE_URL.
// No imports needed - just write the body of your test.

const { browser, page } = await launch();
await page.goto(BASE_URL);
await show(page);
`;

function Sidebar({
  index,
  progress,
  week,
  day,
  onHide,
}: {
  index: CourseIndex;
  progress: Progress | null;
  week: number;
  day: number;
  /** Collapses the entire week list so the lesson gets the space. */
  onHide: () => void;
}) {
  const navigate = useNavigate();
  // Weeks collapse. Only the week you are in is open to begin with, so the whole 8-week
  // course fits without scrolling; opening another leaves the current one open too.
  const [open, setOpen] = useState<number[]>([week]);

  useEffect(() => {
    setOpen((prev) => (prev.includes(week) ? prev : [...prev, week]));
  }, [week]);

  const toggle = (n: number): void =>
    setOpen((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const totalDone = index.weeks.reduce(
    (n, w) => n + w.days.filter((d) => progress?.progress['w' + w.week + 'd' + d.day]?.completed).length,
    0,
  );
  const totalAvailable = index.weeks
    .filter((w) => !w.locked)
    .reduce((n, w) => n + w.days.length, 0);

  return (
    <nav className="sidebar">
      {/* No logo file ships in the repo yet - this mark is a text placeholder, styled to sit
          where a real Evoke Technologies logo image would go, and swaps in cleanly once one
          is added. */}
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">ET</span>
        <span className="brand-text">
          <span className="brand-org">Evoke Technologies</span>
          <span className="brand-title">QA Practice</span>
        </span>
      </div>

      {/* The master control: one click hides every week and hands the width to the lesson. */}
      <button className="wk-all" onClick={onHide} title="Hide the week list">
        <span className="chev-left" aria-hidden="true">
          ◂
        </span>
        <span>All weeks</span>
        <span className="spacer" />
        <span className="count">
          {totalDone}/{totalAvailable}
        </span>
      </button>

      {index.weeks.map((w) => {
        const isOpen = open.includes(w.week);
        const done = w.days.filter(
          (d) => progress?.progress['w' + w.week + 'd' + d.day]?.completed,
        ).length;
        return (
        <div className="wk" key={w.week}>
          <button
            className={'wk-title' + (isOpen ? ' open' : '')}
            onClick={() => toggle(w.week)}
            aria-expanded={isOpen}
          >
            <span className="chev" aria-hidden="true">
              ▸
            </span>
            <span>Week {w.week}</span>
            {w.locked && <span className="pill">soon</span>}
            <span className="spacer" />
            {/* A collapsed week still has to show whether it is finished. */}
            {!w.locked && (
              <span className={'count' + (done === w.days.length ? ' all' : '')}>
                {done}/{w.days.length}
              </span>
            )}
          </button>
          <ul hidden={!isOpen}>
            {w.days.map((d) => {
              const done = progress?.progress['w' + w.week + 'd' + d.day]?.completed;
              const on = w.week === week && d.day === day;
              return (
                <li key={d.day}>
                  <a
                    href={d.locked ? undefined : '/learn/w' + w.week + '/d' + d.day + '/p1'}
                    className={(on ? 'on' : '') + (d.locked ? ' locked' : '')}
                    title={d.title}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!d.locked) navigate('/learn/w' + w.week + '/d' + d.day + '/p1');
                    }}
                  >
                    <span className="tick">{done ? '✓' : ''}</span>
                    {/* One line with an ellipsis, full title on hover - three-line wrapping
                        made the sidebar impossible to scan. */}
                    <span className="dayno">Day {d.day}</span>
                    <span className="daytitle" title={d.title}>
                      {d.title}
                    </span>
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
}: {
  /** The editor starts on the page theme, and can then be overridden on its own. */
  appTheme: 'light' | 'dark';
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
  const [code, setCode] = useState(STARTER);
  const [run, setRun] = useState<RunState | null>(null);
  const [running, setRunning] = useState(false);
  const [split, setSplit] = useState(52);
  // Whether the week list is showing. Remembered per viewer - someone who works with it
  // hidden should not have to hide it again on every day.
  const [weeksShown, setWeeksShown] = useState<boolean>(() => {
    try {
      return localStorage.getItem('studio.weeks_hidden') !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('studio.weeks_hidden', weeksShown ? '0' : '1');
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [weeksShown]);
  const problemRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    getCourse().then(setIndex).catch(() => undefined);
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

  // Viewing a part is what completes it, so record on arrival.
  useEffect(() => {
    if (!content) return;
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

  const loadIntoEditor = useCallback((snippet: string) => {
    problemRef.current = null;
    setCode(snippet);
  }, []);

  const startProblem = useCallback((snippet: string, problemNumber: number) => {
    problemRef.current = problemNumber;
    setCode(snippet.trim() + '\n\n');
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

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;

  if (locked !== null) {
    return (
      <div className="body">
        {index && weeksShown && (
          <Sidebar index={index} progress={progress} week={week} day={day} onHide={() => setWeeksShown(false)} />
        )}
        <div className="centered">
          {!weeksShown && (
            <p style={{ margin: '0 0 14px' }}>
              <button className="btn ghost small" onClick={() => setWeeksShown(true)}>
                ☰ Show weeks
              </button>
            </p>
          )}
          <h1>Week {week}, Day {day}</h1>
          <p className="muted" style={{ fontSize: 16 }}>{locked}</p>
          <div className="notice" style={{ marginTop: 18 }}>
            This day is written but not open yet. Weeks 1 and 2 are ready today; the rest unlock as
            each week is prepared.
          </div>
          <p style={{ marginTop: 20 }}>
            <button className="btn ghost" onClick={() => navigate('/learn/w1/d1/p1')}>
              Back to Week 1
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
    <div className="body">
      {weeksShown && (
        <Sidebar index={index} progress={progress} week={week} day={day} onHide={() => setWeeksShown(false)} />
      )}
      <div className="split">
        <div style={{ flex: '0 0 ' + split + '%', minWidth: 0, display: 'flex' }}>
          <TheoryPane
            parts={content.parts}
            active={activePart.part}
            onSelect={(p) => navigate('/learn/w' + week + '/d' + day + '/p' + p)}
            viewed={viewed}
            onLoadIntoEditor={loadIntoEditor}
            onStartProblem={startProblem}
            weeksShown={weeksShown}
            onToggleWeeks={() => setWeeksShown((shown) => !shown)}
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
          />
        </div>
      </div>
    </div>
  );
}
