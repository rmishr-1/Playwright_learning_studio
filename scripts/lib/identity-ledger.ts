/**
 * The record of every exercise id the course has published (Data/Source/published-ids.json,
 * committed), so an id is never quietly reused for a different exercise.
 *
 * What a learner did - their attempts, and the code they saved - is kept by exercise id (registry
 * invariant 10). An id the authors reuse for a new exercise (it has happened: `d9-ex1` once meant
 * "Test the log-out flow" and later "The sign-in page, at first sight") would hand the learner's old
 * work to the new exercise. So the build compares each exercise with what its id meant before:
 *
 *   - a new id is recorded
 *   - a known id may change its title or its file, but not both at once, and not its kind
 *   - anything else stops the build, naming the id; the author then says which it is:
 *       --same <id>          the same exercise, edited: the record follows the edit
 *       --new-identity <id>  a different exercise: it gets a new identity (`d9-ex1~2`), so no
 *                            earlier work is attached to it, without the Markdown changing
 *
 * Pure (no file system), so it can be tested on its own; build-content.ts reads and writes the file.
 */
export type LedgerEntry = { title: string | null; file: string | null; kind: string; generation: number };
export type Ledger = { schema: 'published-ids/v1'; exercises: Record<string, LedgerEntry> };

export const EMPTY_LEDGER: Ledger = { schema: 'published-ids/v1', exercises: {} };

export type LedgerExercise = { id: string; title: string | null; file: string | null; kind: string; where: string };

export type LedgerOptions = { same?: ReadonlySet<string>; newIdentity?: ReadonlySet<string> };

/** The identity an exercise is built with: its authored id, marked with its generation after a reuse. */
export const builtId = (id: string, generation: number): string => (generation > 1 ? id + '~' + generation : id);

export function parseLedger(raw: unknown): Ledger {
  const r = raw as Partial<Ledger> | null;
  if (!r || r.schema !== 'published-ids/v1' || typeof r.exercises !== 'object' || r.exercises === null) {
    throw new Error('Data/Source/published-ids.json is not a published-ids/v1 record.');
  }
  for (const [id, e] of Object.entries(r.exercises)) {
    if (!e || typeof e.kind !== 'string' || !Number.isInteger(e.generation) || e.generation < 1) {
      throw new Error('Data/Source/published-ids.json: the entry for ' + id + ' is damaged.');
    }
  }
  return r as Ledger;
}

/**
 * Checks this build's exercises against the ledger. Returns the ledger to write and each exercise's
 * built identity, or throws naming every exercise whose id now seems to mean something else.
 */
export function checkLedger(
  ledger: Ledger,
  exercises: readonly LedgerExercise[],
  opts: LedgerOptions = {},
): { ledger: Ledger; ids: Map<string, string>; added: string[]; changed: string[] } {
  const same = opts.same ?? new Set<string>();
  const renew = opts.newIdentity ?? new Set<string>();
  const next: Ledger = { schema: 'published-ids/v1', exercises: { ...ledger.exercises } };
  const ids = new Map<string, string>();
  const problems: string[] = [];
  const added: string[] = [];
  const changed: string[] = [];
  const seen = new Map<string, string>();

  for (const ex of exercises) {
    const twice = seen.get(ex.id);
    if (twice) problems.push(ex.id + ' is used twice: at ' + twice + ' and at ' + ex.where + '. An exercise id must be unique across the course.');
    seen.set(ex.id, ex.where);
    const known = next.exercises[ex.id];
    const record = (generation: number): void => {
      next.exercises[ex.id] = { title: ex.title, file: ex.file, kind: ex.kind, generation };
      ids.set(ex.id, builtId(ex.id, generation));
    };
    if (!known) {
      record(1);
      added.push(ex.id);
      continue;
    }
    if (renew.has(ex.id)) {
      record(known.generation + 1);
      changed.push(ex.id);
      continue;
    }
    const sameKind = known.kind === ex.kind;
    const kept = known.title === ex.title || known.file === ex.file;
    if ((sameKind && kept) || same.has(ex.id)) {
      if (known.title !== ex.title || known.file !== ex.file || known.kind !== ex.kind) changed.push(ex.id);
      record(known.generation);
      continue;
    }
    problems.push(
      ex.id + ' (' + ex.where + ') looks like a different exercise from the one this id was published for: it was "' +
        (known.title ?? '(no title)') + '"' + (known.file ? ', ' + known.file : '') + ' (' + known.kind + '), and is now "' +
        (ex.title ?? '(no title)') + '"' + (ex.file ? ', ' + ex.file : '') + ' (' + ex.kind + '). Learners\' saved work is kept by this id. ' +
        'If it is the same exercise, edited, build again with --same ' + ex.id + '. If it is a new exercise, give it a new id in the ' +
        'Markdown, or build with --new-identity ' + ex.id + '.',
    );
  }
  for (const id of [...same, ...renew]) {
    if (!seen.has(id)) problems.push('--same / --new-identity name ' + id + ', which no exercise in the course has.');
  }
  if (problems.length) throw new Error(problems.join('\n\n'));
  return { ledger: next, ids, added, changed };
}
