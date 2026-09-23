import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Day } from './screens/Day';
import { RunView } from './screens/RunView';
import { CourseIndex } from './screens/CourseIndex';
import { AppHeader } from './components/AppHeader';
import { getCourse, getMyProgress } from './api/client';

const THEME_KEY = 'studio.theme';
/**
 * A NEW key, not the old studio.weeks_hidden: the default flipped to closed when the course title
 * moved onto the tab row, and reusing the key would have left anyone who had once opened the week
 * list arriving with it open and no title showing.
 */
// v2: its own key, and the Learners Dashboard starts OPEN.
const WEEKS_KEY = 'studio.a.weeks_open';

type Theme = 'light' | 'dark';

/** Per-viewer convenience, so a throw in a private window must not break the app. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Closed on a first visit: you arrive on the lesson, with the course title on the tab row. */
function readWeeksOpen(): boolean {
  try {
    // Open unless the learner closed it before.
    return localStorage.getItem(WEEKS_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * There are no accounts. Each clone of this repo is run by one person, so there is nothing to
 * sign into - the app opens straight onto the course, and progress is the one record the
 * backend keeps for whoever is running it (see backend/src/store.ts).
 */
export function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  /**
   * The week list and the course title trade places: the title sits on the tab row while the list
   * is closed, and the list replaces it when opened. Both say where you are rather than teaching
   * anything, so only one is ever worth the space. Owned here because it outlives any one day.
   */
  const [weeksOpen, setWeeksOpen] = useState<boolean>(readWeeksOpen);
  // Course title for the header breadcrumb. A fallback keeps the header readable if it fails.
  const [courseTitle, setCourseTitle] = useState('Playwright with TypeScript');
  useEffect(() => {
    getCourse().then((i) => setCourseTitle(i.title)).catch(() => undefined);
  }, []);
  const location = useLocation();
  // Where the header's Lessons tab goes from the index: the resume point, refreshed on every
  // navigation so it follows the learner.
  const [lessonsTo, setLessonsTo] = useState('/learn/w1/d1/p1');
  useEffect(() => {
    getMyProgress()
      .then((p) => {
        if (p.resume) setLessonsTo('/learn/w' + p.resume.week + '/d' + p.resume.day + '/p' + p.resume.part);
      })
      .catch(() => undefined);
  }, [location.pathname]);
  // The detached window opened by RunOverlay's Detach button (see the comment there): its own
  // small window, no theme toggle, nothing but the live view it was popped out to show.
  const detached = location.pathname.startsWith('/run/');

  // The theme lives on <html> so it covers every screen, not just the shell.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(WEEKS_KEY, weeksOpen ? '1' : '0');
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [weeksOpen]);

  if (detached) {
    return (
      <Routes>
        <Route path="/run/:runId" element={<RunView />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      {/* Navy header on every screen: logo, product name, Course index / Lessons, theme switch. */}
      <AppHeader
        courseTitle={courseTitle}
        lessonsTo={lessonsTo}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <Routes>
        {/* "/" is the course index; each day in it links to /learn/wN/dN/p1. */}
        <Route path="/" element={<CourseIndex />} />
        {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
            inside the param and Day parses them off. */}
        <Route
          path="/learn/:week/:day/:part"
          element={
            <Day appTheme={theme} weeksOpen={weeksOpen} onSetWeeksOpen={setWeeksOpen} />
          }
        />
        <Route path="/learn/:week/:day" element={<Navigate to="p1" replace />} />
        {/* Unknown paths go back to the index. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
