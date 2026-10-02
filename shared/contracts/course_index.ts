import { z } from 'zod';
import { ContentId, DayNumber, WeekNumber } from './common';
import { CoursePlan } from './course_plan';

/** Mirrors Data/Formats/course_index_format.json. */

export const IndexDay = z.object({
  day: DayNumber,
  /** The day's number across the whole course, as the lessons count it (see course_day.ts). */
  number: z.number().int().min(1),
  title: z.string(),
  locked: z.boolean(),
  /** The day's own identity, when the course sets one (see dayIdentity). */
  id: ContentId.optional(),
  /**
   * Changes whenever anything in the day changes, so the studio can tag a day that changed since the
   * learner's previous launch. Opaque (invariant 11).
   */
  revision: z.string().optional(),
});

export const IndexWeek = z.object({
  week: WeekNumber,
  theme: z.string(),
  locked: z.boolean(),
  days: z.array(IndexDay),
});

export const CourseIndex = z.object({
  schema: z.literal('course-index/v1'),
  title: z.string(),
  totals: z.object({
    weeks: z.number().int(),
    days: z.number().int(),
    parts: z.number().int(),
    practice_problems: z.number().int(),
    available_days: z.number().int(),
  }),
  weeks: z.array(IndexWeek),
});

/** GET /api/course: the index, with the course plan when the content has one. */
export const CourseResponse = CourseIndex.extend({ plan: CoursePlan.nullable() });

export type CourseResponse = z.infer<typeof CourseResponse>;
export type IndexDay = z.infer<typeof IndexDay>;
export type IndexWeek = z.infer<typeof IndexWeek>;
export type CourseIndex = z.infer<typeof CourseIndex>;
