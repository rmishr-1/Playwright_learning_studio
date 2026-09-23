import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getCourse, getMyProgress } from '../api/client';
import { courseDescription, planWeeks } from '../lib/coursePlan';
import { PRODUCT_NAME } from '../components/AppHeader';
import { YourPath, type PathWeek } from '../components/YourPath';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress } from '../../../shared/contracts/progress';

/** Every day is built as four tabs: Prerequisites, Fundamentals, Implementation, Practice. */
const PARTS_PER_DAY = 4;

const dayUrl = (week: number, day: number, part = 1): string => '/learn/w' + week + '/d' + day + '/p' + part;

/**
 * The course index: a navy hero with the course's name and description and what to do next, then
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

  // Up next: the saved resume point, else the first open day.
  const r = progress?.resume;
  const next = (r && openDays.find((x) => x.week === r.week && x.day.day === r.day)) || openDays[0];
  const viewed = next ? dayRecord(next.week, next.day.day)?.parts_viewed.length ?? 0 : 0;

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
          {/* The course: its name and what it covers (the description lives in course-plan.json). */}
          <div className="dash-intro">
            <h1>{index.title}</h1>
            {courseDescription && <p className="dash-desc">{courseDescription}</p>}
          </div>

          {next && (
            <div className="upnext">
              <div className="upnext-top">
                <span className="eyebrow">Up next</span>
                <span className="mono">Week {next.week} · Day {next.day.day}</span>
              </div>
              <div className="upnext-title">{next.day.title}</div>
              <div className="upnext-progress">
                <div className="upnext-bar" aria-hidden="true">
                  {Array.from({ length: PARTS_PER_DAY }, (_, i) => (
                    <span key={i} className={i < viewed ? 'on' : ''} />
                  ))}
                </div>
                <span className="muted small">{Math.min(viewed, PARTS_PER_DAY)} of {PARTS_PER_DAY} parts viewed</span>
              </div>
              <Link
                className="btn action"
                to={dayUrl(next.week, next.day.day, r && r.week === next.week && r.day === next.day.day ? r.part : 1)}
              >
                {viewed > 0 ? 'Continue' : 'Start'} Day {next.day.day} →
              </Link>
            </div>
          )}
        </div>
      </section>

      <YourPath weeks={pathWeeks} />
    </div>
  );
}
