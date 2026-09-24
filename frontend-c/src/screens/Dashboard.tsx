import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getCourse, getMyProgress } from '../api/client';
import { planWeeks } from '../lib/coursePlan';
import { PRODUCT_NAME } from '../components/AppHeader';
import { YourPath, type PathWeek } from '../components/YourPath';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';

const dayUrl = (week: number, day: number, part = 1): string => '/learn/w' + week + '/d' + day + '/p' + part;

/**
 * The course index: a navy hero with the course's name and what to do next, then
 * "Your path" - one line per week of the plan, each open week with its days beneath it, each of
 * which opens that day. The days are the week's key topics; a week not built yet says so.
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

  // Every week of the plan for Your path, each day resolved against progress and "Up next".
  const pathWeeks: PathWeek[] = weeks.map((w) => {
    const days = w.days.map((d) => ({
      week: w.week,
      day: d.day,
      title: d.title,
      url: dayUrl(w.week, d.day),
      done: isDone(w.week, d.day),
      next: next?.week === w.week && next.day.day === d.day,
      locked: d.locked,
    }));
    return { week: w.week, module: w.module.name, color: w.module.color, focus: w.focus, open: w.open, days, done: days.filter((d) => d.done).length };
  });

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

      <YourPath weeks={pathWeeks} />
    </div>
  );
}
