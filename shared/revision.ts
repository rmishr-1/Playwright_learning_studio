/**
 * Revision tokens: short hashes that change when a piece of the course changes (registry invariant
 * 11). They are opaque - only ever compared for equality - and computed on the course as written,
 * never on a served copy: watermarks are stripped first, so the licence a lesson is served under
 * never makes it look changed.
 *
 * The content build (scripts/build-content.ts) stores them in the course; the backend computes them
 * only for content built before they existed. Node only (node:crypto).
 */
import * as crypto from 'node:crypto';
import { strip } from './watermark';

/**
 * JSON with every object's keys sorted, watermarks stripped, Windows line endings made plain and
 * undefined left out: the same course gives the same text, whichever computer built it (a checkout
 * with core.autocrlf gives the lesson files CRLF).
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(typeof value === 'string' ? strip(value).replace(/\r\n/g, '\n') : value) ?? 'null';
  }
  if (Array.isArray(value)) return '[' + value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
}

export const token = (value: unknown): string => crypto.createHash('sha256').update(canonical(value)).digest('hex').slice(0, 12);

type ProblemLike = { kind: string; statement: string; stub: string | null; file: string | null; run: string | null; check: unknown };

/**
 * An exercise's revision: what the learner is asked to do. Its number, title, hints and model answer
 * are left out, so a renumbering or a better solution does not tell the learner the exercise changed.
 */
export const problemRevision = (p: ProblemLike): string =>
  token({ kind: p.kind, statement: p.statement, stub: p.stub, file: p.file, run: p.run, check: p.check ?? null });

/**
 * A day's revision: everything in it except where it sits (week, position, number), whether it is
 * locked, its own identity and the revision tokens inside it.
 */
export function dayRevision(day: { parts: { problems: object[] }[] } & Record<string, unknown>): string {
  const { id: _id, week: _w, day: _d, number: _n, locked: _l, ...rest } = day;
  const parts = day.parts.map((part) => ({
    ...part,
    problems: part.problems.map((p) => {
      const { revision: _r, number: _num, ...keep } = p as Record<string, unknown>;
      return keep;
    }),
  }));
  return token({ ...rest, parts });
}
