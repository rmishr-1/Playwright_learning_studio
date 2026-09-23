import { Link, useLocation } from 'react-router-dom';
import { planWeeks } from '../lib/coursePlan';
import type { CourseIndex } from '../../../shared/contracts/course_index';

const ThemeIcon = ({ dark }: { dark: boolean }) =>
  dark ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );

/**
 * Option B's navy bar. On the dashboard: the Evoke logo block, the product name, Dashboard /
 * Lessons, and the theme switch. On a lesson it becomes the lesson's own navigation - back to the
 * dashboard, where you are, and one chip per day of the week - since the lesson has no week list.
 */
export function AppHeader({
  index,
  lessonsTo,
  theme,
  onToggleTheme,
}: {
  index: CourseIndex | null;
  lessonsTo: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const { pathname } = useLocation();
  // /learn/w1/d2/p3 -> week 1, day 2 (null on the dashboard)
  const m = /^\/learn\/w(\d+)\/d(\d+)/.exec(pathname);
  const where = m ? { week: Number(m[1]), day: Number(m[2]) } : null;

  const themeButton = (
    <button
      className="hdr-btn icon"
      onClick={onToggleTheme}
      aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      <ThemeIcon dark={theme === 'dark'} />
    </button>
  );

  // The ET block: the logo sits on a white block so its blue and orange read on navy.
  const logo = (
    <Link to="/" className="hdr-brand" title="Go to the dashboard">
      <span className="hdr-logo">
        <img src="/evoke-logo.png" alt="Evoke Technologies" />
      </span>
    </Link>
  );

  if (!where) {
    return (
      <header className="app-header">
        {logo}
        <span className="hdr-product">Playwright Learning Studio</span>
        <span className="hdr-spacer" />
        <nav className="hdr-seg" aria-label="Main">
          <Link to="/" className="on" aria-current="page">Dashboard</Link>
          <Link to={lessonsTo}>Lessons</Link>
        </nav>
        {themeButton}
      </header>
    );
  }

  const week = planWeeks(index).find((w) => w.week === where.week);
  const days = week?.days ?? [];
  const today = days.find((d) => d.day === where.day);

  return (
    <header className="app-header">
      {logo}
      <Link to="/" className="hdr-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Dashboard
      </Link>
      <span className="hdr-where">
        <small>Week {where.week}{week ? ' · ' + week.module.name : ''}</small>
        <b>Day {where.day}{today ? ' · ' + today.title : ''}</b>
      </span>
      <span className="hdr-spacer" />
      {days.length > 0 && (
        <nav className="hdr-seg days" aria-label={'Days in Week ' + where.week}>
          {days.map((d) =>
            d.locked ? (
              <span key={d.day} className="locked" title={d.title + ' (not open yet)'}>D{d.day}</span>
            ) : (
              <Link
                key={d.day}
                to={'/learn/w' + where.week + '/d' + d.day + '/p1'}
                className={d.day === where.day ? 'on' : ''}
                aria-current={d.day === where.day ? 'page' : undefined}
                aria-label={'Day ' + d.day + ': ' + d.title}
                title={d.title}
              >
                D{d.day}
              </Link>
            ),
          )}
        </nav>
      )}
      {themeButton}
    </header>
  );
}
