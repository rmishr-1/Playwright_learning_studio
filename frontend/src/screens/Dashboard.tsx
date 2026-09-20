import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';

type Cohort = Awaited<ReturnType<typeof getDashboard>>;
type Row = Cohort['learners'][number];

/**
 * One checkpoint per week. Filled when every day in that week is done, ringed when it is the
 * week they are on now, and hollow ahead of them - so a glance across the row says how far
 * someone has got without reading any numbers.
 */
function WeekTrack({ row }: { row: Row }) {
  return (
    <div className="track" role="img" aria-label={'On week ' + row.current_week + ' of ' + row.weeks.length}>
      {row.weeks.map((w, i) => {
        const complete = w.total > 0 && w.done === w.total;
        const current = w.week === row.current_week && !complete;
        const started = w.done > 0 && !complete;
        return (
          <span className="seg" key={w.week}>
            {i > 0 && <i className={'link' + (complete || started ? ' on' : '')} />}
            <b
              className={'dot' + (complete ? ' done' : current ? ' now' : started ? ' part' : '')}
              title={'Week ' + w.week + ' — ' + w.done + ' of ' + w.total + ' days'}
            >
              {w.week}
            </b>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Cohort progress. Trainers and admins only - the role on the account decides, and the server
 * checks it on every request.
 */
export function Dashboard() {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setCohort).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="centered"><div className="notice">{error}</div></div>;
  if (!cohort) return <div className="centered muted">Loading…</div>;

  return (
    <div className="centered" style={{ maxWidth: 1020 }}>
      <h1 style={{ fontSize: 27 }}>Cohort progress</h1>
      <p className="muted">
        {cohort.learners.length} account{cohort.learners.length === 1 ? '' : 's'} ·{' '}
        {cohort.total_weeks} weeks · {cohort.total_days} days
      </p>

      {cohort.learners.length === 0 ? (
        <div className="notice">Nobody has registered yet.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Role</th>
              <th>Course progress</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {cohort.learners.map((l) => (
              <tr key={l.learner_id}>
                <td>{l.display_name}</td>
                <td>
                  <span className={'pill' + (l.role === 'learner' ? ' gate' : '')}>{l.role}</span>
                </td>
                <td>
                  <WeekTrack row={l} />
                  <span className="track-label">
                    Week {l.current_week} · {l.days_done}/{cohort.total_days} days
                  </span>
                </td>
                <td className="muted">{l.last_seen_at.replace('T', ' ').replace('Z', '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
