import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { weeksPhrase } from '../lib/coursePlan';

/** One day of the path, already resolved against progress by the course index. */
export type PathDay = {
  week: number;
  day: number;
  title: string;
  url: string;
  done: boolean;
  /** The day "Up next" points at. */
  next: boolean;
  locked: boolean;
};

/** One week of the plan. A week that is not built yet has no days. */
export type PathWeek = {
  week: number;
  module: string;
  /** The module's colour from the plan, tinting the week's heading line in the Rows view. */
  color: string;
  focus: string;
  open: boolean;
  days: PathDay[];
  done: number;
};

/**
 * Five ways to lay out the path, switched from the toggle beside the heading:
 * rows (one line per week, its days in a row beneath), contents (a book's table of contents),
 * this week (only the current week open), strip (the weeks as one progress bar), and columns
 * (the weeks side by side, like a timetable).
 */
type View = 'rows' | 'contents' | 'focus' | 'strip' | 'columns';

const VIEWS: { id: View; label: string }[] = [
  { id: 'rows', label: 'Rows' },
  { id: 'contents', label: 'Contents' },
  { id: 'focus', label: 'This week' },
  { id: 'strip', label: 'Strip' },
  { id: 'columns', label: 'Columns' },
];

const VIEW_KEY = 'studio.c.path_view';

/** Per-viewer convenience, so a throw in a private window must not break the page. */
function readView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((v) => v.id === saved) ? (saved as View) : 'rows';
  } catch {
    return 'rows';
  }
}

/** A day as a link to its lesson, or plain text while it is locked. */
function DayLink({ d, className, children }: { d: PathDay; className: string; children: ReactNode }) {
  const cls = className + (d.done ? ' done' : '') + (d.next ? ' next' : '') + (d.locked ? ' locked' : '');
  if (d.locked) return <span className={cls}>{children}</span>;
  return (
    <Link
      to={d.url}
      className={cls}
      aria-label={'Week ' + d.week + ' Day ' + d.day + ': ' + d.title + (d.done ? ', done' : '') + (d.next ? ', up next' : '')}
    >
      {children}
    </Link>
  );
}

/** The week that holds the day up next, else the first open week. */
const currentWeek = (weeks: PathWeek[]): number | undefined =>
  (weeks.find((w) => w.days.some((d) => d.next)) ?? weeks.find((w) => w.open))?.week;

const soonPhrase = (weeks: PathWeek[]): string | null => {
  const soon = weeks.filter((w) => !w.open).map((w) => w.week);
  return soon.length ? weeksPhrase(soon) + ' · coming soon' : null;
};

/**
 * Rows: one line per week - name, module and focus, progress - on a band tinted with the module's
 * colour, with an open week's days beneath.
 */
function RowsView({ weeks }: { weeks: PathWeek[] }) {
  return (
    <ol className="yp">
      {weeks.map((w) => (
        <li key={w.week} className={'yp-week' + (w.open ? '' : ' soon')} style={{ ['--mod' as string]: w.color }}>
          <div className="yp-head">
            <h3>Week {w.week}</h3>
            <span className="yp-meta">{w.module} · {w.focus}</span>
            <span className="yp-status">{w.open ? w.done + '/' + w.days.length + ' done' : 'Coming soon'}</span>
          </div>
          {w.open && (
            <div className="yp-days">
              {w.days.map((d) => (
                <DayLink key={d.day} d={d} className="yp-day">
                  <span className="yp-day-no">
                    {d.done ? '✓ ' : ''}Day {d.day}
                    {d.next ? ' · Up next' : ''}
                  </span>
                  <span className="yp-day-title">{d.title}</span>
                </DayLink>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Contents: like a book's table of contents. Finished days fade, the next day is orange. */
function ContentsView({ weeks }: { weeks: PathWeek[] }) {
  const soon = soonPhrase(weeks);
  return (
    <div className="ypc">
      {weeks.filter((w) => w.open).map((w) => (
        <section key={w.week} className="ypc-week" aria-label={'Week ' + w.week}>
          <div className="ypc-head">
            <h3>Week {w.week}</h3>
            <span>{w.module}</span>
          </div>
          <ol className="ypc-days">
            {w.days.map((d) => (
              <li key={d.day}>
                <DayLink d={d} className="ypc-day">
                  <span className="ypc-no">{d.day}</span>
                  <span className="ypc-title">{d.title}</span>
                </DayLink>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {soon && <p className="yp-soon">{soon}</p>}
    </div>
  );
}

/** This week: only the current week is open, with a progress line; the others fold to one line. */
function FocusView({ weeks }: { weeks: PathWeek[] }) {
  const [openWeek, setOpenWeek] = useState<number | undefined>(() => currentWeek(weeks));
  const soon = soonPhrase(weeks);
  return (
    <div className="ypf">
      {weeks.filter((w) => w.open).map((w) => {
        const isOpen = w.week === openWeek;
        const pct = w.days.length ? Math.round((w.done / w.days.length) * 100) : 0;
        return (
          <section key={w.week} className={'ypf-week' + (isOpen ? ' open' : '')}>
            <button
              type="button"
              className="ypf-row"
              aria-expanded={isOpen}
              onClick={() => setOpenWeek(isOpen ? undefined : w.week)}
            >
              <span className="ypf-name">Week {w.week} · {w.module}</span>
              <span className="ypf-count">{w.done} of {w.days.length}</span>
              <svg className="ypf-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <>
                <div className="ypf-bar" role="img" aria-label={w.done + ' of ' + w.days.length + ' days done'}>
                  <span style={{ width: pct + '%' }} />
                </div>
                <div className="ypf-days">
                  {w.days.map((d) => (
                    <DayLink key={d.day} d={d} className="ypf-day">{d.title}</DayLink>
                  ))}
                </div>
              </>
            )}
          </section>
        );
      })}
      {soon && <p className="yp-soon ypf-soon">{soon}</p>}
    </div>
  );
}

/** Strip: every week as one segment of a progress bar; the chosen week's days listed beneath. */
function StripView({ weeks }: { weeks: PathWeek[] }) {
  const [sel, setSel] = useState<number | undefined>(() => currentWeek(weeks));
  const chosen = weeks.find((w) => w.week === sel);
  return (
    <div className="yps">
      <div className="yps-bar" role="group" aria-label="Weeks">
        {weeks.map((w) => {
          const pct = w.days.length ? Math.round((w.done / w.days.length) * 100) : 0;
          return (
            <button
              key={w.week}
              type="button"
              className={'yps-week' + (w.week === sel ? ' on' : '') + (w.open ? '' : ' soon')}
              aria-pressed={w.week === sel}
              onClick={() => setSel(w.week)}
            >
              <span className="yps-track"><span className="yps-fill" style={{ width: pct + '%' }} /></span>
              <span className="yps-label">Week {w.week}</span>
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className="yps-sel">
          <div className="yps-head">
            <b>Week {chosen.week}</b>
            <span>{chosen.module} · {chosen.focus}</span>
          </div>
          {chosen.open ? (
            <div className="yps-days">
              {chosen.days.map((d) => (
                <DayLink key={d.day} d={d} className="yps-day">{d.title}</DayLink>
              ))}
            </div>
          ) : (
            <p className="yp-soon">Coming soon</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Columns: the weeks side by side, each listing its days - a timetable. */
function ColumnsView({ weeks }: { weeks: PathWeek[] }) {
  return (
    <div className="ypk" style={{ ['--cols' as string]: weeks.length }}>
      {weeks.map((w) => (
        <section key={w.week} className={'ypk-col' + (w.open ? '' : ' soon')} aria-label={'Week ' + w.week}>
          <div className="ypk-head">
            <h3>Week {w.week}</h3>
            <span>{w.module}</span>
          </div>
          {w.open ? (
            <ol className="ypk-days">
              {w.days.map((d) => (
                <li key={d.day}>
                  <DayLink d={d} className="ypk-day">{d.title}</DayLink>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ypk-soon">Coming soon</p>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * "Your path" on the course index: the heading, a toggle between the five layouts, and the chosen
 * layout. The choice is remembered per viewer.
 */
export function YourPath({ weeks }: { weeks: PathWeek[] }) {
  const [view, setView] = useState<View>(readView);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [view]);

  return (
    <main className="dash-path">
      <div className="dash-in">
        <div className="yp-top">
          <h2 className="yp-title">Your path</h2>
          <div className="yp-views" role="group" aria-label="Layout for your path">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={'yp-view' + (v.id === view ? ' on' : '')}
                aria-pressed={v.id === view}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {view === 'rows' && <RowsView weeks={weeks} />}
        {view === 'contents' && <ContentsView weeks={weeks} />}
        {view === 'focus' && <FocusView weeks={weeks} />}
        {view === 'strip' && <StripView weeks={weeks} />}
        {view === 'columns' && <ColumnsView weeks={weeks} />}
      </div>
    </main>
  );
}
