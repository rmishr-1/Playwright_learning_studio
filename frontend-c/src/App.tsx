import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Day } from './screens/Day';
import { RunView } from './screens/RunView';
import { Dashboard } from './screens/Dashboard';
import { AppHeader } from './components/AppHeader';
import { getCourse, getMyProgress } from './api/client';
import type { CourseIndex } from '../../shared/contracts/course_index';
import { editorThemeFor, isTheme, nextTheme, type Theme } from './lib/theme';

const THEME_KEY = 'studio.theme';
/**
 * A NEW key, not the old studio.weeks_hidden: the default flipped to closed when the course title
 * moved onto the tab row, and reusing the key would have left anyone who had once opened the week
 * list arriving with it open and no title showing.
 */
// v2: its own key, and the Learners Dashboard starts OPEN.
const WEEKS_KEY = 'studio.c.weeks_open';

/** Per-viewer convenience, so a throw in a private window must not break the app. */
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return isTheme(saved) ? saved : 'light';
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
  // The header shows where you are on a lesson - week, module, day and title - from the index.
  const [index, setIndex] = useState<CourseIndex | null>(null);
  useEffect(() => {
    getCourse().then(setIndex).catch(() => undefined);
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
      {/* Navy header on every screen: logo, where you are on a lesson, the tab to the other screen, theme switch. */}
      <AppHeader
        index={index}
        lessonsTo={lessonsTo}
        theme={theme}
        onToggleTheme={() => setTheme(nextTheme(theme))}
      />
      <Routes>
        {/* "/" is the course index - Option B’s dashboard; each day tile links to /learn/wN/dN/p1. */}
        <Route path="/" element={<Dashboard />} />
        {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
            inside the param and Day parses them off. */}
        <Route
          path="/learn/:week/:day/:part"
          element={
            <Day appTheme={editorThemeFor(theme)} weeksOpen={weeksOpen} onSetWeeksOpen={setWeeksOpen} />
          }
        />
        <Route path="/learn/:week/:day" element={<Navigate to="p1" replace />} />
        {/* Unknown paths go back to the index. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
