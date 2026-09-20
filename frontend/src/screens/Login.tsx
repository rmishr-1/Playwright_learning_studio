import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, forgotPassword, getCourse, login, register, resetPassword } from '../api/client';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Learner } from '../../../shared/contracts/learner';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

/**
 * The way in. Shown every launch when signed out - there is no silent auto-resume, which is
 * what made the app always come back as whoever used it last.
 *
 * Four panels share one card: sign in, register, ask for a code, and enter it.
 */
export function Login({ onSignedIn }: { onSignedIn: (l: Learner) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState<CourseIndex | null>(null);
  const navigate = useNavigate();

  // The course index needs a session, so this only fills in after signing in. Before that the
  // heading falls back to the course name.
  useEffect(() => {
    getCourse().then(setIndex).catch(() => undefined);
  }, []);

  const go = (next: Mode): void => {
    setMode(next);
    setError('');
    setNote('');
  };

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        const r = await forgotPassword(name);
        setNote(
          r.delivery === 'smtp'
            ? 'If that account exists, a six-digit code is on its way to the email on file.'
            : 'Email is not configured on this server, so nothing was sent — the code was written to Data/Outbox/ for the operator to pass on.',
        );
        setMode('reset');
        setBusy(false);
        return;
      }

      if (mode === 'reset') {
        await resetPassword(name, code, password);
        setNote('Password changed. Sign in with it.');
        setCode('');
        setPassword('');
        setMode('login');
        setBusy(false);
        return;
      }

      const learner =
        mode === 'login' ? await login(name, password) : await register(name, email, password);
      // AWAIT it. The shell renders the signed-out routes until /auth/me resolves, so navigating
      // before that lands on the login screen again and looks like the sign-in silently failed.
      await onSignedIn(learner);
      const r = learner.resume;
      navigate(r ? '/learn/w' + r.week + '/d' + r.day + '/p' + r.part : '/learn/w1/d1/p1', {
        replace: true,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  const canSubmit =
    mode === 'forgot'
      ? name.trim().length > 0
      : mode === 'reset'
        ? name.trim().length > 0 && code.length === 6 && password.length >= 8
        : mode === 'register'
          ? name.trim().length > 0 && email.includes('@') && password.length >= 8
          : name.trim().length > 0 && password.length > 0;

  const label = {
    login: 'Sign in',
    register: 'Create account and start',
    forgot: 'Email me a code',
    reset: 'Set the new password',
  }[mode];

  return (
    <div className="centered auth">
      <h1>{index?.title ?? 'Beginner to Advanced: Playwright Fundamentals'}</h1>
      <p className="sub">
        An eight-week, hands-on course. Read the day on the left, write and run real Playwright
        code on the right, and watch the browser drive itself.
      </p>

      <div className="auth-card">
        <div className="auth-tabs">
          <button className={mode === 'login' || mode === 'forgot' || mode === 'reset' ? 'on' : ''} onClick={() => go('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => go('register')}>
            Create an account
          </button>
        </div>

        {mode === 'forgot' && (
          <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Enter your name and we will email a six-digit code to the address on your account.
          </p>
        )}

        <label>
          Your name
          <input
            value={name}
            autoComplete="username"
            placeholder="e.g. Ada Lovelace"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {mode === 'register' && (
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="so you can reset your password later"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}

        {mode === 'reset' && (
          <label>
            Six-digit code
            <input
              value={code}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}

        {mode !== 'forgot' && (
          <label>
            {mode === 'reset' ? 'New password' : 'Password'}
            <input
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? '' : 'At least 8 characters'}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && void submit()}
            />
          </label>
        )}

        {note && <div className="notice">{note}</div>}
        {error && <div className="notice error">{error}</div>}

        <button className="btn" onClick={() => void submit()} disabled={busy || !canSubmit}>
          {busy ? 'One moment…' : label}
        </button>

        {mode === 'login' && (
          <button className="linkish" onClick={() => go('forgot')}>
            Forgot your password?
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button className="linkish" onClick={() => go('login')}>
            Back to sign in
          </button>
        )}
        {mode === 'reset' && (
          <button className="linkish" onClick={() => go('forgot')}>
            Send another code
          </button>
        )}

        {mode === 'register' && (
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0', lineHeight: 1.6 }}>
            New accounts start as learners. A trainer or admin can change that later.
          </p>
        )}
      </div>
    </div>
  );
}
