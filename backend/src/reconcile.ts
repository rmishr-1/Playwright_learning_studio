/**
 * Brings the progress record up to date with the course, whenever the course changes: once per
 * launch in the desktop app (it downloads the course afresh), after each rebuild in development.
 *
 *   - each day's record, and the resume point, follow their day by identity (registry invariant
 *     10), so a course update that moves a day never hands its progress to another one
 *   - a day that is new since the learner's previous launch is tagged 'new', a day whose revision
 *     changed is tagged 'updated'; the tag stays until the learner opens the day (store.ts)
 *   - where each exercise's file is, and where it used to be, so the learner's saved code is still
 *     found after an update moves the exercise to another file. Files are never moved: that could
 *     overwrite a starting file or the learner's own, and the learner would find theirs gone
 *   - attempts recorded by number before identities existed are given to their exercises, once
 *
 * The very first reconcile (a new install, or the first launch after upgrading from a studio that
 * kept no record of what the learner saw) only records what the course is: it tags nothing, since
 * there is nothing to compare with, and tagging every day would teach the learner to ignore tags.
 *
 * Pure: no files and no clock, so it can be tested on its own (backend/test/progress-identity.ts).
 */
import { dayKey } from '../../shared/contracts/common';
import type { Workspace } from '../../shared/contracts/course_day';
import type { Attempt, ContentSeen, DayTag, FileAt, Progress, ResumePoint } from '../../shared/contracts/progress';

export type SnapshotExercise = { id: string; number: number; file: string | null; revision: string | null };

export type SnapshotDay = {
  /** The day's identity (dayIdentity). */
  id: string;
  week: number;
  day: number;
  /** Not locked, and its file could be read. Only an open day is tagged, or has its revision recorded. */
  open: boolean;
  revision: string | null;
  workspace: Workspace;
  /** null when the day's file could not be read. */
  exercises: SnapshotExercise[] | null;
};

export type ContentSnapshot = { fingerprint: string; days: SnapshotDay[] };

const sameAt = (a: FileAt, b: FileAt): boolean => a.workspace === b.workspace && a.file === b.file;

export function reconcile(p: Progress, snap: ContentSnapshot): Progress {
  const first = p.content_seen === undefined;
  if (!first && p.content_seen!.fingerprint === snap.fingerprint && p.attempts !== undefined) return p;

  const keyOf = new Map(snap.days.map((d) => [d.id, dayKey(d.week, d.day)]));
  const idAt = new Map(snap.days.map((d) => [dayKey(d.week, d.day), d.id]));
  const dayById = new Map(snap.days.map((d) => [d.id, d]));

  // 1. Each record goes where its day now is. One whose day has left the course is kept, under its
  //    old key, or parked as 'gone:<id>' when another day now has that key; it comes back if the day
  //    does. Nothing is ever overwritten.
  const records: Progress['progress'] = {};
  for (const key of Object.keys(p.progress).sort()) {
    const rec = p.progress[key];
    const id = rec.day_id ?? (key.startsWith('gone:') ? key.slice(5) : idAt.get(key));
    let target = key;
    if (id !== undefined) {
      const now = keyOf.get(id);
      if (now !== undefined) target = now;
      else if (idAt.has(key) && idAt.get(key) !== id) target = 'gone:' + id;
    }
    while (target in records) target += '+';
    records[target] = id !== undefined ? { ...rec, day_id: id } : rec;
  }

  // 2. The resume point follows its day; a day that has gone clears it (the app then opens the course).
  let resume: ResumePoint | null = p.resume;
  if (resume) {
    const rid = resume.day_id ?? idAt.get(dayKey(resume.week, resume.day));
    if (rid !== undefined) {
      const d = dayById.get(rid);
      resume = d ? { week: d.week, day: d.day, part: resume.part, day_id: rid } : null;
    }
  }

  // 3. Tags, against what the course was at the previous reconcile. Never on the first; a 'new' day
  //    stays 'new' until opened; a day that is locked or cannot be read gets none.
  const seen: Record<string, string> = first ? {} : { ...p.content_seen!.days };
  const tags: Record<string, DayTag> = { ...(p.day_tags ?? {}) };
  const open = snap.days.filter((d) => d.open && d.revision !== null);
  if (!first) {
    for (const d of open) {
      if (tags[d.id]) continue;
      if (!(d.id in seen)) tags[d.id] = 'new';
      else if (seen[d.id] !== d.revision) tags[d.id] = 'updated';
    }
  }

  // 4. Where each exercise's file is now, and where it was.
  const files: ContentSeen['files'] = { ...(p.content_seen?.files ?? {}) };
  for (const d of snap.days) {
    for (const e of d.exercises ?? []) {
      const at: FileAt | null = e.file ? { workspace: d.workspace, file: e.file } : null;
      const prev = files[e.id];
      if (!at && !prev) continue;
      let moved = prev?.moved_from ?? [];
      if (prev?.at && (!at || !sameAt(prev.at, at))) {
        moved = [...moved.filter((m) => !sameAt(m, prev.at!)), prev.at];
      }
      if (at) moved = moved.filter((m) => !sameAt(m, at));
      files[e.id] = { at, moved_from: moved.slice(-4) };
    }
  }

  // 5. Attempts recorded by number, before identities: given to the exercise that number is now, once.
  let attempts: Record<string, Attempt>;
  if (p.attempts !== undefined) attempts = p.attempts;
  else {
    attempts = {};
    for (const rec of Object.values(records)) {
      const d = rec.day_id ? dayById.get(rec.day_id) : undefined;
      for (const n of rec.attempted_problems) {
        const e = d?.exercises?.find((x) => x.number === n);
        if (e && !attempts[e.id]) attempts[e.id] = { revision: e.revision, at: rec.first_opened_at };
      }
    }
  }

  // 6. What the course is now. A day that is not open keeps the revision it last had.
  for (const d of open) seen[d.id] = d.revision!;

  return {
    ...p,
    progress: records,
    resume,
    day_tags: tags,
    attempts,
    content_seen: { fingerprint: snap.fingerprint, days: seen, files },
  };
}
