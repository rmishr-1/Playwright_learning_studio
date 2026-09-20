import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { logout as apiLogout, me as apiMe } from './api/client';
import { Login } from './screens/Login';
import { Day } from './screens/Day';
import { Dashboard } from './screens/Dashboard';
import { People } from './screens/People';
import { Certificate } from './screens/Certificate';
import type { Me } from '../../shared/contracts/session';

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

export function App() {
  /**
   * Who is signed in. This comes from the session cookie via /auth/me on every load - there is
   * no learner id kept in localStorage any more, which is what made the app silently return as
   * whoever used it last.
   */
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshMe = (): Promise<void> =>
    apiMe()
      .then(setMe)
      .catch(() => setMe(null));

  useEffect(() => {
    void refreshMe().finally(() => setReady(true));
  }, []);

  // The theme lives on <html> so it covers the masthead and every screen, not just the shell.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Remembering it is a convenience, never a requirement.
    }
  }, [theme]);

  async function signOut(): Promise<void> {
    await apiLogout().catch(() => undefined);
    setMe(null);
    navigate('/login', { replace: true });
  }

  if (!ready) return <div className="centered muted">Loading…</div>;

  const signedOut = (
    <Routes>
      <Route path="/login" element={<Login onSignedIn={refreshMe} />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );

  return (
    <div className="app">
      <header className="masthead">
        <Link to={me ? '/learn/w1/d1/p1' : '/login'} className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
          Beginner to Advanced: Playwright Fundamentals
        </Link>
        <span className="spacer" />
        {me && (
          <>
            <Link to="/certificate" className={location.pathname === '/certificate' ? 'on' : ''}>
              Certificate
            </Link>
            {/* Rendered from the server's own verdict. The routes below are checked server-side
                too - a hidden menu item is not a permission. */}
            {me.may_see_dashboard && (
              <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'on' : ''}>
                Dashboard
              </Link>
            )}
            {me.may_manage_people && (
              <Link to="/people" className={location.pathname === '/people' ? 'on' : ''}>
                People
              </Link>
            )}
            <span className="who">
              {me.display_name}
              <span className="role-tag">{me.role}</span>
            </span>
            <a href="#" onClick={(e) => { e.preventDefault(); void signOut(); }}>
              sign out
            </a>
          </>
        )}
      </header>

      {!me ? (
        signedOut
      ) : (
        <Routes>
          <Route path="/login" element={<Navigate to="/learn/w1/d1/p1" replace />} />
          {/* React Router v6 params must be a WHOLE segment, so the w/d/p prefixes travel
              inside the param and Day parses them off. */}
          <Route
            path="/learn/:week/:day/:part"
            element={<Day me={me} onProgress={() => void refreshMe()} appTheme={theme} />}
          />
          <Route path="/learn/:week/:day" element={<Navigate to="p1" replace />} />
          <Route path="/certificate" element={<Certificate />} />
          <Route
            path="/dashboard"
            element={me.may_see_dashboard ? <Dashboard /> : <Denied what="dashboard" />}
          />
          <Route
            path="/people"
            element={me.may_manage_people ? <People meId={me.learner_id} /> : <Denied what="People page" />}
          />
          <Route path="*" element={<Navigate to="/learn/w1/d1/p1" replace />} />
        </Routes>
      )}

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

/** Reached by typing the URL. The server refuses the data too; this just explains why. */
function Denied({ what }: { what: string }) {
  return (
    <div className="centered">
      <h1 style={{ fontSize: 26 }}>Not your page</h1>
      <div className="notice" style={{ marginTop: 14 }}>
        The {what} is for trainers and admins. Ask an admin if you need access.
      </div>
      <p style={{ marginTop: 20 }}>
        <Link className="btn" to="/learn/w1/d1/p1">
          Back to the course
        </Link>
      </p>
    </div>
  );
}
