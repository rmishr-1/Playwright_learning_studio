import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getCourse, getMyProgress } from '../api/client';
import { planWeeks } from '../lib/coursePlan';
import { PRODUCT_NAME } from '../components/AppHeader';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';

const dayUrl = (week: number, day: number, part = 1): string => '/learn/w' + week + '/d' + day + '/p' + part;

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/**
 * The course index: a hero with the course's name and progress, then "Your path", Option B's
 * timeline - one card per week of the plan, each open week showing its days as tiles that open that
 * day. The days are the week's key topics; a week not built yet says it opens soon.
 */
export function Dashboard() {
  const [index, setIndex] = useState<CourseIndex | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCourse()
      .then((i) => {
        setIndex(i);
        document.title = PRODUCT_NAME + ' · Option C';
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError && e.code === 'CONTENT_MISSING' ? 'The course has no lessons yet.' : (e as Error).message),
      );
    getMyProgress().then(setProgress).catch(() => undefined);
  }, []);

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;
  if (!index) return <div className="centered muted">Loading…</div>;

  const weeks = planWeeks(index);
  const dayRecord = (w: number, d: number) => progress?.progress['w' + w + 'd' + d];
  const isDone = (w: number, d: number): boolean => !!dayRecord(w, d)?.completed;
  const openDays = weeks.filter((w) => w.open).flatMap((w) => w.days.filter((d) => !d.locked).map((d) => ({ week: w.week, day: d })));

  // Overall progress, counted over open days only.
  const doneCount = openDays.filter((x) => isDone(x.week, x.day.day)).length;
  const pct = openDays.length ? Math.round((doneCount / openDays.length) * 100) : 0;

  // Where the button goes: the saved resume point when it is an open day, else the first open day.
  const r = progress?.resume;
  const resumedDay = r ? openDays.find((x) => x.week === r.week && x.day.day === r.day) : undefined;
  const next = resumedDay || openDays[0];
  const resumed = r && resumedDay ? r : null;

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-in dash-hero-in">
          {/* The course: its name. */}
          <div className="dash-intro">
            <h1>{index.title}</h1>
          </div>

          {/* Progress, as frontend v2 shows it: a ring, the days complete, and one clear next step. */}
          <div className="index-progress">
            <div className="ring" style={{ ['--pct' as string]: pct + '%' }}>
              <span>{pct}%</span>
            </div>
            <div className="muted small">{doneCount} of {openDays.length} days complete</div>
            {next && (
              <Link className="btn" to={dayUrl(next.week, next.day.day, resumed ? resumed.part : 1)}>
                {resumed ? 'Continue: Week ' + resumed.week + ', Day ' + resumed.day : 'Start Day ' + next.day.day} →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Your path: Option B's timeline, one card per week of the plan with its days as tiles. */}
      <main className="dash-path">
        <div className="dash-in">
          <div className="path-head">
            <h2>Your path</h2>
            <span className="muted">Choose a day to open its lesson</span>
          </div>

          <ol className="path">
            {weeks.map((w, i) => {
              const done = w.days.filter((d) => isDone(w.week, d.day)).length;
              return (
                <li
                  key={w.week}
                  className={'path-week' + (w.open ? ' open' : ' soon')}
                  style={{ ['--mod' as string]: w.module.color }}
                >
                  <div className="path-rail" aria-hidden="true">
                    <span className="path-num">{w.week}</span>
                    {i < weeks.length - 1 && <span className="path-line" />}
                  </div>
                  <section className="path-card" aria-label={'Week ' + w.week}>
                    <div className="path-card-head">
                      <h3>Week {w.week}</h3>
                      <span className="mod-chip">{w.module.name}</span>
                      <span className="focus">{w.focus}</span>
                      <span className="spacer" />
                      {w.open ? (
                        <span className="done-pill">{done}/{w.days.length} done</span>
                      ) : (
                        <span className="soon-chip"><LockIcon />Opens soon</span>
                      )}
                    </div>

                    {w.open && (
                      <div className="day-tiles">
                        {w.days.map((d) => {
                          const tileDone = isDone(w.week, d.day);
                          const here = next?.week === w.week && next.day.day === d.day;
                          const body = (
                            <>
                              <span className="tile-top">
                                <span className="tile-badge">DAY {d.day}</span>
                                {tileDone && <span className="tile-done">✓ Done</span>}
                              </span>
                              <span className="tile-title">{d.title}</span>
                              {here && <span className="here">You are here</span>}
                            </>
                          );
                          return d.locked ? (
                            <span key={d.day} className="day-tile locked">{body}</span>
                          ) : (
                            <Link
                              key={d.day}
                              to={dayUrl(w.week, d.day)}
                              className={'day-tile' + (tileDone ? ' done' : '')}
                              aria-label={'Open Week ' + w.week + ' Day ' + d.day + ': ' + d.title}
                            >
                              {body}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </li>
              );
            })}
          </ol>
        </div>
      </main>
    </div>
  );
}
