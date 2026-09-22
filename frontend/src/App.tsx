import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Day } from './screens/Day';
import { RunView } from './screens/RunView';
import { getMyProgress } from './api/client';

const THEME_KEY = 'studio.theme';
/** Named for the week list, which is what it used to hide on its own. It now governs the
 *  masthead as well; the key is kept so nobody's saved preference resets. */
const CHROME_KEY = 'studio.weeks_hidden';

type Theme = 'light' | 'dark';

/** Per-viewer convenience, so a throw in a private window must not break the app. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readChromeShown(): boolean {
  try {
    return localStorage.getItem(CHROME_KEY) !== '1';
  } catch {
    return true;
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
   * One switch for the reading chrome: the week list and the masthead collapse together, because
   * both exist to tell you where you are rather than to teach you anything. It lives here rather
   * than in Day because the masthead is rendered here.
   */
  const [chromeShown, setChromeShown] = useState<boolean>(readChromeShown);
  const location = useLocation();
  // The detached window opened by RunOverlay's Detach button (see the comment there): its own
  // small window, no masthead, no theme toggle, nothing but the live view it was popped out to
  // show.
  const detached = location.pathname.startsWith('/run/');

  // The theme lives on <html> so it covers the masthead and every screen, not just the shell.
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
      localStorage.setItem(CHROME_KEY, chromeShown ? '0' : '1');
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [chromeShown]);

  if (detached) {
    return (
      <Routes>
        <Route path="/run/:runId" element={<RunView />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      {/* Hidden only on a lesson, because the tab bar's toggle is the way back and only a lesson
          has one. Collapsing it anywhere else would strand the masthead with nothing to restore it. */}
      {(chromeShown || !location.pathname.startsWith('/learn/')) && (
        <header className="masthead">
          <Link to="/learn/w1/d1/p1" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
            Beginner to Advanced: Playwright Fundamentals
          </Link>
        </header>
      )}

      <Routes>
        {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
            inside the param and Day parses them off. */}
        <Route
          path="/learn/:week/:day/:part"
          element={
            <Day
              appTheme={theme}
              chromeShown={chromeShown}
              onSetChromeShown={setChromeShown}
            />
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
