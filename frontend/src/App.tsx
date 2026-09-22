import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Day } from './screens/Day';
import { RunView } from './screens/RunView';
import { getMyProgress } from './api/client';

const THEME_KEY = 'studio.theme';
/**
 * A NEW key, not the old studio.weeks_hidden: the default flipped to closed when the course title
 * moved onto the tab row, and reusing the key would have left anyone who had once opened the week
 * list arriving with it open and no title showing.
 */
const WEEKS_KEY = 'studio.weeks_open';

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
    return localStorage.getItem(WEEKS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Landing on "/" (or an unknown path): resume where progress left off, or start at Day 1. */
function Home() {
  const navigate = useNavigate();
  useEffect(() => {
    getMyProgress()
      .then((p) => {
        const r = p.resume;
        navigate('/learn/w' + (r?.week ?? 1) + '/d' + (r?.day ?? 1) + '/p' + (r?.part ?? 1), { replace: true });
      })
      .catch(() => navigate('/learn/w1/d1/p1', { replace: true }));
  }, [navigate]);
  return <div className="centered muted">Loading…</div>;
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
  const location = useLocation();
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
      {/* No masthead of its own any more. On a lesson the course title rides the tab row, where it
          costs no vertical space and trades places with the week list; every other route is a
          redirect that renders for a moment, so a title bar there would only flash. */}
      <Routes>
        {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
            inside the param and Day parses them off. */}
        <Route
          path="/learn/:week/:day/:part"
          element={
            <Day appTheme={theme} weeksOpen={weeksOpen} onSetWeeksOpen={setWeeksOpen} />
          }
        />
        <Route path="/learn/:week/:day" element={<Navigate to="p1" replace />} />
        <Route path="*" element={<Home />} />
      </Routes>

      <button
        className="theme-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      >
        <span className="ico" aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </div>
  );
}
