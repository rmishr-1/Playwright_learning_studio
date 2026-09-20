import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CERTIFICATE_HTML, CERTIFICATE_PDF, getCertificate } from '../api/client';

type State = Awaited<ReturnType<typeof getCertificate>>;

/**
 * The certificate, awarded for the WHOLE course - all 38 days. Weeks 3-8 are not authored yet,
 * so for now this doubles as a progress view rather than a page nobody can open.
 *
 * The markup itself comes from the backend and is shown in an iframe, because the PDF renders
 * that same HTML. One source, no drift.
 */
export function Certificate() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getCertificate().then(setState).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;
  if (!state) return <div className="centered muted">Loading…</div>;

  if (!state.earned) {
    const pct = Math.round((state.completed / state.total) * 100);
    return (
      <div className="centered">
        <h1 style={{ fontSize: 27 }}>Your certificate</h1>
        <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.7 }}>
          The certificate is awarded for the whole course — all {state.total} days. You have
          completed <b>{state.completed}</b>.
        </p>

        <div className="progress-bar" aria-label={pct + ' per cent complete'}>
          <span style={{ width: Math.max(pct, 2) + '%' }} />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {state.completed} of {state.total} days · {pct}%
        </p>

        <div className="notice" style={{ marginTop: 20 }}>
          Weeks 3–8 are written but not open yet, so the full {state.total} days cannot be
          finished today. Your progress is kept and the certificate issues itself the moment the
          last day is done.
        </div>

        <p style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => navigate('/learn/w1/d1/p1')}>
            Back to the course
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="centered" style={{ maxWidth: 1180 }}>
      <div className="cert-head">
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Congratulations</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Issued {state.issued_at?.slice(0, 10)} · all {state.total} days
          </p>
        </div>
        <div className="cert-actions">
          <a className="btn ghost" href={CERTIFICATE_HTML} target="_blank" rel="noreferrer">
            Open to print
          </a>
          <a className="btn" href={CERTIFICATE_PDF}>
            Download PDF
          </a>
        </div>
      </div>

      {/* The same HTML the PDF is rendered from. */}
      <iframe className="cert-frame" src={CERTIFICATE_HTML} title="Your certificate" />
    </div>
  );
}
