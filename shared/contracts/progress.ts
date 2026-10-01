import { z } from 'zod';
import { ContentId, DayNumber, PartNumber, ProblemNumber, Timestamp, WeekNumber } from './common';
import { Workspace } from './course_day';

/**
 * Mirrors Data/Formats/progress_format.json.
 *
 * There are no accounts. Each clone of this repo is run by one person, so "who is using it" is
 * not a question the app needs to answer - there is exactly one progress record on disk, at
 * Data/Progress/progress.json, and every request reads and writes that same record. This used
 * to be a per-learner file behind a login; the login, the roles and the accounts are gone, and
 * this is what is left once the identity layer is stripped out.
 *
 * Keys are only ever added (invariant 7), and every key added after the first version is optional
 * and dropped on its own if it is malformed (`.catch`), so one bad key never costs the learner the
 * whole record. Keys this version does not know are kept as they are (`.passthrough`), so an older
 * studio never deletes what a newer one wrote.
 */

/** A day's identity (dayIdentity), as kept in progress. */
const DayId = z.string().min(1).max(64);

export const ResumePoint = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  /** The day's identity, so the resume point follows the day if a content update moves it. */
  day_id: DayId.optional().catch(undefined),
});

export const DayProgress = z.object({
  parts_viewed: z.array(PartNumber),
  completed: z.boolean(),
  attempted_problems: z.array(ProblemNumber),
  first_opened_at: Timestamp,
  completed_at: Timestamp.nullable(),
  /** The day's identity, so the record follows the day if a content update moves it. */
  day_id: DayId.optional().catch(undefined),
}).passthrough();

/** 'new': the day was not in the course at the learner's previous launch; 'updated': it changed since. */
export const DayTag = z.enum(['new', 'updated']);

/** The learner worked on an exercise: its revision then, so a later change can be pointed out. */
export const Attempt = z.object({ revision: z.string().nullable(), at: Timestamp });

/** Where an exercise's file is: which workspace, and its path in it. */
export const FileAt = z.object({ workspace: Workspace, file: z.string().max(200) });

/**
 * What the course was at the last reconcile (backend/src/reconcile.ts): never sent to the page.
 * - days: each open day's revision, by day identity
 * - files: each exercise's file now, and where it was before, newest last, so saved code is still
 *   found after an update moves the exercise to another file
 */
export const ContentSeen = z.object({
  fingerprint: z.string(),
  days: z.record(z.string(), z.string()),
  files: z.record(z.string(), z.object({ at: FileAt.nullable(), moved_from: z.array(FileAt).max(4).default([]) })).default({}),
});

export const Progress = z.object({
  schema: z.literal('progress/v1'),
  resume: ResumePoint.nullable(),
  /** Keyed 'w<week>d<day>'. */
  progress: z.record(z.string(), DayProgress),
  /** The "New" / "Updated" tag on a day's card, by day identity, until the learner opens the day. */
  day_tags: z.record(z.string(), DayTag).optional().catch(undefined),
  /** The exercises the learner worked on, by exercise identity (exerciseIdentity). */
  attempts: z.record(z.string(), Attempt).optional().catch(undefined),
  content_seen: ContentSeen.optional().catch(undefined),
}).passthrough();

/**
 * POST /api/progress - records where the learner is, that a part was read, and optionally a
 * practice attempt. There is no learner id anywhere in this request: there is only the one record.
 */
export const ProgressUpdate = z.object({
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  attempted_problem: ProblemNumber.nullable().optional(),
  /** The same attempt, by the exercise's identity. Preferred over attempted_problem when both are sent. */
  attempted_exercise: ContentId.optional(),
  /**
   * Whether this counts the part as read. `false` only moves the resume point here - for a
   * frontend that marks a part read once the learner reaches its end, not on arrival. Omitted
   * means true, which is how every update behaved before this field existed.
   */
  viewed: z.boolean().optional(),
  /**
   * `true` clears the whole day's progress - the learner cleared its done mark on the course index:
   * no part read, no exercise attempted, not complete. `part` is not used. It leaves the resume
   * point where it was.
   */
  reset_day: z.boolean().optional(),
});

export type DayTag = z.infer<typeof DayTag>;
export type Attempt = z.infer<typeof Attempt>;
export type FileAt = z.infer<typeof FileAt>;
export type ContentSeen = z.infer<typeof ContentSeen>;
export type ResumePoint = z.infer<typeof ResumePoint>;
export type DayProgress = z.infer<typeof DayProgress>;
export type Progress = z.infer<typeof Progress>;
export type ProgressUpdate = z.infer<typeof ProgressUpdate>;
