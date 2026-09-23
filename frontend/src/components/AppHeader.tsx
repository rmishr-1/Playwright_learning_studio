import { Link, useLocation } from 'react-router-dom';

/**
 * The navy bar across the top of every screen: Evoke logo (the "ET block"), the course name,
 * where you are, a way back to the course index, and the light/dark switch.
 * It fetches nothing - "where you are" is read straight from the URL.
 */
export function AppHeader({
  courseTitle,
  theme,
  onToggleTheme,
}: {
  courseTitle: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const { pathname } = useLocation();

  // /learn/w1/d2/p3 -> week 1, day 2 (null on the index page)
  const m = /^\/learn\/w(\d+)\/d(\d+)/.exec(pathname);
  const where = m ? { week: Number(m[1]), day: Number(m[2]) } : null;

  return (
    <header className="app-header">
      {/* The ET block: the logo sits on a white chip so its blue and orange read on navy. */}
      <Link to="/" className="hdr-brand" title="Go to the course index">
        <span className="hdr-logo">
          <img src="/evoke-logo.png" alt="Evoke Technologies" />
        </span>
        <span className="hdr-product">QA Practice</span>
      </Link>

      <span className="hdr-sep" aria-hidden="true" />

      {/* Breadcrumb: course title, then week and day when on a lesson. */}
      <nav className="hdr-crumbs" aria-label="Breadcrumb">
        <Link to="/" className="crumb">{courseTitle}</Link>
        {where && (
          <>
            <span className="crumb-sep" aria-hidden="true">›</span>
            <span className="crumb">Week {where.week}</span>
            <span className="crumb-sep" aria-hidden="true">›</span>
            <span className="crumb current">Day {where.day}</span>
          </>
        )}
      </nav>

      <span className="hdr-spacer" />

      {/* Only shown on a lesson - on the index it would link to itself. */}
      {where && (
        <Link to="/" className="hdr-btn">
          <span aria-hidden="true">▦</span> Course index
        </Link>
      )}

      <button
        className="hdr-btn icon"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}
