import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getBranding, type Branding } from '../api/client';
import { planWeeks } from '../lib/coursePlan';
import { nextTheme, THEME_NAMES, type Theme } from '../lib/theme';
import type { CourseIndex } from '../../../shared/contracts/course_index';

/** The product's name: in the top strip on the course index, and heading the week list. */
export const PRODUCT_NAME = 'QA Practice Training Studio';

/** Sun for light, a sheet of paper for warm paper, moon for dark. */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (theme === 'dark') return <svg {...common}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
  if (theme === 'paper')
    return (
      <svg {...common}>
        <path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h7M9 16h5" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/**
 * Option C’s navy bar across the top of every screen: the white Evoke logo straight on the navy,
 * the product name on the course index - or on a lesson the course name and where you are (week and
 * module, day, and the day’s title) - the Course index / Lessons tabs, the theme switch (light,
 * warm paper, dark), and in the desktop app the logo of the customer it is licensed to, when their
 * licence carries one. "Where you are" is read from the URL and the index.
 */
export function AppHeader({
  index,
  lessonsTo,
  theme,
  onToggleTheme,
}: {
  index: CourseIndex | null;
  /** Where "Lessons" goes from the index: the resume point, else the first day. */
  lessonsTo: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { pathname } = useLocation();
  // /learn/w1/d3/p1 -> week 1, day 3 (null on the course index)
  const m = /^\/learn\/w(\d+)\/d(\d+)/.exec(pathname);
  const where = m ? { week: Number(m[1]), day: Number(m[2]) } : null;
  const week = where ? planWeeks(index).find((w) => w.week === where.week) : undefined;
  const title = where ? week?.days.find((d) => d.day === where.day)?.title : undefined;
  // The customer's logo, when the studio is licensed to someone whose licence carries one.
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    getBranding().then(setBranding, () => setBranding(null));
  }, []);

  return (
    <header className={'app-header' + (where ? ' in-lesson' : '')}>
      <Link to="/" className="hdr-brand" title="Go to the course index">
        <img className="hdr-logo-white" src="/evoke-logo-white.png" alt="Evoke Technologies" />
      </Link>

      {/* Course index: logo | product name. A lesson: logo | course name | the current lesson. */}
      <span className="hdr-sep hdr-course-sep" aria-hidden="true" />
      <span className="hdr-course">{where ? index?.title ?? '' : PRODUCT_NAME}</span>

      {where && (
        <>
          <span className="hdr-sep" aria-hidden="true" />
          <div className="hdr-where">
            <span className="hdr-crumbs">
              Week {where.week}
              {week ? ' · ' + week.module.name : ''}
              <span className="crumb-sep" aria-hidden="true">/</span>
              <b>Day {where.day}</b>
            </span>
            {title && <h1 className="hdr-title">{title}</h1>}
          </div>
        </>
      )}

      <span className="hdr-spacer" />

      <nav className="hdr-nav" aria-label="Main">
        <Link to="/" className={'hdr-tab' + (where ? '' : ' on')} aria-current={where ? undefined : 'page'} aria-label="Course index" title="Course index">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="hdr-tab-label">Course index</span>
        </Link>
        <Link
          to={where ? pathname : lessonsTo}
          className={'hdr-tab' + (where ? ' on' : '')}
          aria-current={where ? 'page' : undefined}
          aria-label="Lessons"
          title="Lessons"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /><path d="M8 7h7" />
          </svg>
          <span className="hdr-tab-label">Lessons</span>
        </Link>
      </nav>

      {/* One button steps through the themes; its icon shows the theme you are on now. */}
      <button
        className="hdr-btn icon"
        onClick={onToggleTheme}
        aria-label={'Theme: ' + THEME_NAMES[theme] + '. Switch to ' + THEME_NAMES[nextTheme(theme)]}
        title={'Theme: ' + THEME_NAMES[theme] + ' (switch to ' + THEME_NAMES[nextTheme(theme)] + ')'}
      >
        <ThemeIcon theme={theme} />
      </button>

      {branding?.logo && (
        <span className="hdr-customer" title={'Licensed to ' + (branding.licensee ?? '')}>
          <img src={branding.logo} alt={branding.licensee ?? 'Customer logo'} />
        </span>
      )}
    </header>
  );
}
