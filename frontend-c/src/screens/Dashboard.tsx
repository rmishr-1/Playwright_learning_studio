import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getCourse, getMyProgress } from '../api/client';
import { planWeeks } from '../lib/coursePlan';
import { PRODUCT_NAME } from '../components/AppHeader';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';

const dayUrl = (week: number, day: number, part = 1): string => '/learn/w' + week + '/d' + day + '/p' + part;

/**
 * The course index: a hero with the course's name and progress, then "Your path", Option A's
 * schedule table - one row per week of the plan (Duration | Module | Focus Area | Key Topics). A
 * week's key topics are its days, and each opens that day; a week not built yet says so.
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

      {/* Your path: Option A's schedule table, in the same shape as the course plan sheet. */}
      <main className="dash-path">
        <div className="dash-in">
          <div className="yp-top">
            <h2 className="yp-title">Your path</h2>
          </div>
          <div className="index-table-wrap">
            <table className="index-table">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Duration</th>
                  <th style={{ width: '14%' }}>Module</th>
                  <th style={{ width: '18%' }}>Focus Area</th>
                  <th>Key Topics Covered</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => {
                  const doneInWeek = w.days.filter((d) => isDone(w.week, d.day)).length;
                  return (
                    <tr key={w.week} className={w.open ? '' : 'soon'}>
                      <td className="duration">
                        <b>Week {w.week}</b>
                        <span className={'wk-count' + (w.open && doneInWeek === w.days.length ? ' all' : '')}>
                          {w.open ? doneInWeek + '/' + w.days.length + ' done' : 'soon'}
                        </span>
                      </td>
                      <td className="module" style={{ background: w.module.color }}>{w.module.name}</td>
                      <td className="focus">{w.focus}</td>
                      <td className="topics">
                        {w.open ? (
                          <ul>
                            {w.days.map((d) => {
                              const done = isDone(w.week, d.day);
                              const current = resumed?.week === w.week && resumed?.day === d.day;
                              return (
                                <li key={d.day}>
                                  {d.locked ? (
                                    <span className="day-link locked">
                                      <span className="day-state" aria-hidden="true" />
                                      <span className="day-no">Day {d.day}</span>
                                      <span className="day-title">{d.title}</span>
                                    </span>
                                  ) : (
                                    // Clicking a day lands on that day's first tab.
                                    <Link to={dayUrl(w.week, d.day)} className={'day-link' + (done ? ' done' : '')}>
                                      <span className="day-state" aria-hidden="true">{done ? '✓' : ''}</span>
                                      <span className="day-no">Day {d.day}</span>
                                      <span className="day-title">{d.title}</span>
                                      {current && <span className="here">You are here</span>}
                                      <span className="go" aria-hidden="true">→</span>
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className="lock-line">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                            Days are listed here once Week {w.week} is published
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
