import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getCourse, getMyProgress } from '../api/client';
import { planWeeks } from '../lib/coursePlan';
import type { CourseIndex as CourseIndexData } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';

/** Link to the first tab of a day. */
const dayUrl = (week: number, day: number): string => '/learn/w' + week + '/d' + day + '/p1';

/**
 * The course index: one row per week of the plan (Duration | Module | Focus Area | Key Topics).
 * A week's key topics are its days, and each is a link that lands on that day. Weeks the plan
 * lists but the course has not built yet show as "soon".
 */
export function CourseIndex() {
  const [index, setIndex] = useState<CourseIndexData | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCourse()
      .then((i) => {
        setIndex(i);
        document.title = i.title + ' · Option A';
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError && e.code === 'CONTENT_MISSING' ? 'The course has no lessons yet.' : (e as Error).message),
      );
    // Progress is optional here - the table still works without ticks.
    getMyProgress().then(setProgress).catch(() => undefined);
  }, []);

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;
  if (!index) return <div className="centered muted">Loading…</div>;

  const weeks = planWeeks(index);
  const isDone = (w: number, d: number): boolean => !!progress?.progress['w' + w + 'd' + d]?.completed;

  // Overall progress, counted over open days only.
  const openDays = weeks.filter((w) => w.open).flatMap((w) => w.days.filter((d) => !d.locked).map((d) => ({ w: w.week, d: d.day })));
  const doneCount = openDays.filter((x) => isDone(x.w, x.d)).length;
  const pct = openDays.length ? Math.round((doneCount / openDays.length) * 100) : 0;

  // Where "Continue" goes: the saved resume point, else Day 1.
  const r = progress?.resume;
  const resumeUrl = '/learn/w' + (r?.week ?? 1) + '/d' + (r?.day ?? 1) + '/p' + (r?.part ?? 1);

  return (
    <div className="index-page">
      {/* Hero: title, numbers, progress and one clear next step. */}
      <section className="index-hero">
        <div className="index-hero-text">
          <span className="eyebrow">Course index</span>
          <h1>{index.title}</h1>
          <p className="sub">
            Read the lesson on the left, write real Playwright code on the right, press Run and watch the browser.
          </p>
          <div className="stats">
            <div className="stat"><b>{weeks.length}</b><span>Weeks</span></div>
            <div className="stat"><b>{openDays.length}</b><span>Days</span></div>
            <div className="stat"><b>{index.totals.parts}</b><span>Lessons</span></div>
            <div className="stat"><b>{index.totals.practice_problems}</b><span>Practice problems</span></div>
          </div>
        </div>
        <div className="index-progress">
          <div className="ring" style={{ ['--pct' as string]: pct + '%' }}>
            <span>{pct}%</span>
          </div>
          <div className="muted small">{doneCount} of {openDays.length} days complete</div>
          <Link className="btn" to={resumeUrl}>
            {r ? 'Continue: Week ' + r.week + ', Day ' + r.day : 'Start Day 1'} →
          </Link>
        </div>
      </section>

      {/* The schedule table, in the same shape as the course plan sheet. */}
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
                          const current = r?.week === w.week && r?.day === d.day;
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
  );
}
