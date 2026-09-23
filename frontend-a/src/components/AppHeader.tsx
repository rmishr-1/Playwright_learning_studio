import { Link, useLocation } from 'react-router-dom';

/**
 * Option A's navy bar across the top of every screen: the Evoke logo on its white block (the
 * "ET block"), the product name, Course index and Lessons tabs, and the light/dark switch.
 * Where you are inside a lesson is shown by the day screen's own breadcrumb, not here.
 */
export function AppHeader({
  courseTitle,
  lessonsTo,
  theme,
  onToggleTheme,
}: {
  courseTitle: string;
  /** Where "Lessons" goes from the index: the resume point, else the first day. */
  lessonsTo: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const { pathname } = useLocation();
  const inLesson = pathname.startsWith('/learn/');

  return (
    <header className="app-header">
      {/* The ET block: the logo sits on a white block so its blue and orange read on navy. */}
      <Link to="/" className="hdr-brand" title="Go to the course index">
        <span className="hdr-logo">
          <img src="/evoke-logo.png" alt="Evoke Technologies" />
        </span>
      </Link>

      <span className="hdr-sep" aria-hidden="true" />

      <span className="hdr-product">
        <b>Playwright Learning Studio</b>
        <small>QA Practice · {courseTitle}</small>
      </span>

      <span className="hdr-spacer" />

      <nav className="hdr-nav" aria-label="Main">
        <Link to="/" className={'hdr-tab' + (inLesson ? '' : ' on')} aria-current={inLesson ? undefined : 'page'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Course index
        </Link>
        <Link
          to={inLesson ? pathname : lessonsTo}
          className={'hdr-tab' + (inLesson ? ' on' : '')}
          aria-current={inLesson ? 'page' : undefined}
        >
          Lessons
        </Link>
      </nav>

      <button
        className="hdr-btn icon"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
          </svg>
        )}
      </button>
    </header>
  );
}
