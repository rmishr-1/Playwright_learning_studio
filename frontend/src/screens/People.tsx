import { useEffect, useState } from 'react';
import { ApiError, deletePerson, getPeople, setEmail, setRole } from '../api/client';
import type { Role } from '../../../shared/contracts/learner';

type Person = Awaited<ReturnType<typeof getPeople>>['people'][number];

const ROLES: { id: Role; label: string; what: string }[] = [
  { id: 'learner', label: 'Learner', what: 'the course' },
  { id: 'trainer', label: 'Trainer', what: 'the course + dashboard' },
  { id: 'admin', label: 'Admin', what: 'everything, including this page' },
];

/**
 * Admin only. This is where a trainer is made - the server checks the same thing, so reaching
 * the page by URL as a learner gets a 403 rather than a working screen.
 */
export function People({ meId }: { meId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const load = (): void => {
    getPeople()
      .then((r) => setPeople(r.people))
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  /** Accounts created before emails existed cannot use Forgot password until given one. */
  async function changeEmail(id: string, current: string | null): Promise<void> {
    const next = window.prompt('Email for password resets', current ?? '');
    if (next === null || next.trim() === (current ?? '')) return;
    setSaving(id);
    setError('');
    try {
      await setEmail(id, next.trim());
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set that email.');
    } finally {
      setSaving('');
    }
  }

  /** Irreversible, so the confirmation names the person AND what is lost with them. */
  async function remove(p: Person): Promise<void> {
    const lost = p.days_completed > 0 ? ' and its ' + p.days_completed + ' completed days' : '';
    if (!window.confirm('Delete ' + p.display_name + lost + '? This cannot be undone.')) return;
    setSaving(p.learner_id);
    setError('');
    try {
      await deletePerson(p.learner_id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that account.');
    } finally {
      setSaving('');
    }
  }

  async function change(id: string, role: Role): Promise<void> {
    setSaving(id);
    setError('');
    try {
      await setRole(id, role);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that role.');
    } finally {
      setSaving('');
    }
  }

  if (error && !people) return <div className="centered"><div className="notice">{error}</div></div>;
  if (!people) return <div className="centered muted">Loading…</div>;

  return (
    <div className="centered">
      <h1 style={{ fontSize: 27 }}>People</h1>
      <p className="muted">
        {people.length} account{people.length === 1 ? '' : 's'}. A learner sees the course only; a
        trainer also sees the dashboard; an admin can change roles here.
      </p>
      {error && <div className="notice" style={{ marginBottom: 16 }}>{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.learner_id}>
              <td>
                {p.display_name}
                {p.learner_id === meId && <span className="pill done">you</span>}
                {p.pinned && (
                  <span className="pill" title="Pinned as an admin in studio.config.json">
                    pinned
                  </span>
                )}
                {p.unclaimed && (
                  <span
                    className="pill gate"
                    title="Migrated from before logins existed — anyone who signs in with this name can claim it"
                  >
                    unclaimed
                  </span>
                )}
              </td>
              <td>
                <select
                  value={p.role}
                  disabled={p.pinned || saving === p.learner_id}
                  onChange={(e) => void change(p.learner_id, e.target.value as Role)}
                  title={p.pinned ? 'Pinned in studio.config.json — edit the file to change it' : undefined}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.what}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="linkish"
                  disabled={saving === p.learner_id}
                  onClick={() => void changeEmail(p.learner_id, p.email)}
                  title="Where a password-reset code is sent"
                >
                  {p.email ?? 'add an email'}
                </button>
              </td>
              <td className="muted">{p.last_seen_at.replace('T', ' ').replace('Z', '')}</td>
              <td>
                {p.learner_id !== meId && !p.pinned && (
                  <button
                    className="linkish danger"
                    disabled={saving === p.learner_id}
                    onClick={() => void remove(p)}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted" style={{ fontSize: 13, marginTop: 18, lineHeight: 1.6 }}>
        An account marked <b>unclaimed</b> predates logins — the next person to sign in with that
        name sets its password and takes it. Delete records you do not recognise from
        <code> Data/Learners/</code> rather than leaving them claimable. An account with no email
        cannot use <b>Forgot password</b> until you give it one.
      </p>
    </div>
  );
}
