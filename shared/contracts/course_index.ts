import { z } from 'zod';
import { DayNumber, Timestamp, WeekNumber } from './common';

/** Mirrors Data/Formats/course_index_format.json. */

export const IndexDay = z.object({
  day: DayNumber,
  title: z.string(),
  locked: z.boolean(),
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
  imported_at: Timestamp,
  source_repo: z.string(),
  totals: z.object({
    weeks: z.number().int(),
    days: z.number().int(),
    parts: z.number().int(),
    practice_problems: z.number().int(),
    available_days: z.number().int(),
  }),
  weeks: z.array(IndexWeek),
});

export type IndexDay = z.infer<typeof IndexDay>;
export type IndexWeek = z.infer<typeof IndexWeek>;
export type CourseIndex = z.infer<typeof CourseIndex>;
