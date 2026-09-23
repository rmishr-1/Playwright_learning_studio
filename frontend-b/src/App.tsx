import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Day } from './screens/Day';
import { RunView } from './screens/RunView';
import { Dashboard } from './screens/Dashboard';
import { AppHeader } from './components/AppHeader';
import { getCourse, getMyProgress } from './api/client';
import type { CourseIndex } from '../../shared/contracts/course_index';

const THEME_KEY = 'studio.theme';

type Theme = 'light' | 'dark';

/** Per-viewer convenience, so a throw in a private window must not break the app. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Option B. There are no accounts: each clone is run by one person, and progress is the one
 * record the backend keeps (see backend/src/store.ts). "/" is the learner dashboard; a lesson has
 * no week list - the header's day chips move between the days of the week, and the Dashboard
 * button goes back to every week.
 */
export function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  // The header needs the index for its day chips and the day's title.
  const [index, setIndex] = useState<CourseIndex | null>(null);
  useEffect(() => {
    getCourse().then(setIndex).catch(() => undefined);
  }, []);
  const location = useLocation();
  // Where the header's Lessons tab goes from the dashboard: the resume point, refreshed on every
  // navigation so it follows the learner.
  const [lessonsTo, setLessonsTo] = useState('/learn/w1/d1/p1');
  useEffect(() => {
    getMyProgress()
      .then((p) => {
        if (p.resume) setLessonsTo('/learn/w' + p.resume.week + '/d' + p.resume.day + '/p' + p.resume.part);
      })
      .catch(() => undefined);
  }, [location.pathname]);
  // The detached window opened by RunOverlay's Detach button: its own small window, nothing but
  // the live view it was popped out to show.
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

  if (detached) {
    return (
      <Routes>
        <Route path="/run/:runId" element={<RunView />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <AppHeader
        index={index}
        lessonsTo={lessonsTo}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <Routes>
        {/* "/" is the dashboard; each day tile in it links to /learn/wN/dN/p1. */}
        <Route path="/" element={<Dashboard />} />
        {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
            inside the param and Day parses them off. */}
        <Route path="/learn/:week/:day/:part" element={<Day appTheme={theme} />} />
        <Route path="/learn/:week/:day" element={<Navigate to="p1" replace />} />
        {/* Unknown paths go back to the dashboard. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
