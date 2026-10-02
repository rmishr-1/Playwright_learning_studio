import { z } from 'zod';
import { WeekNumber } from './common';

/**
 * Mirrors Data/Formats/course_plan_format.json. Data/Content/course-plan.json: the course's
 * description, which module each week belongs to and what it focuses on. It lists every week of the
 * course, written or not; the course index lists only the weeks that are built. Part of the course,
 * so it comes with the content (GET /api/course returns it as `plan`), never in the page's code.
 */
export const PlanModule = z.object({
  name: z.string().min(1),
  /** Used as a CSS colour, so only a plain hex colour is accepted. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const CoursePlan = z
  .object({
    schema: z.literal('course-plan/v1'),
    description: z.string().default(''),
    modules: z.record(z.string(), PlanModule),
    weeks: z.array(z.object({ week: WeekNumber, module: z.string(), focus: z.string() })),
  })
  .refine((p) => p.weeks.every((w) => w.module in p.modules), {
    message: 'every week must name one of the modules',
    path: ['weeks'],
  });

export type PlanModule = z.infer<typeof PlanModule>;
export type CoursePlan = z.infer<typeof CoursePlan>;
