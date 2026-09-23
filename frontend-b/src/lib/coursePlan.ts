import plan from '../../../Data/Content/course-plan.json';
import type { CourseIndex, IndexDay } from '../../../shared/contracts/course_index';

/**
 * The course plan (Data/Content/course-plan.json) says which module each week belongs to and what
 * it focuses on. It lists every week of the course, written or not; the course index lists only
 * the weeks that are built. A week's days - its key topics - always come from the index, so a
 * planned week with no days yet shows as "opens soon". Vite reloads the page when the plan changes.
 */
export type PlanModule = { name: string; color: string };

export type PlanWeek = {
  week: number;
  module: PlanModule;
  focus: string;
  /** Built and not locked: its days can be opened. */
  open: boolean;
  days: IndexDay[];
};

type RawPlan = {
  modules: Record<string, PlanModule>;
  weeks: { week: number; module: string; focus: string }[];
};

const RAW = plan as RawPlan;

/** A built week the plan does not mention yet still shows, under a neutral module. */
const fallbackModule = (week: number): PlanModule => ({ name: 'Week ' + week, color: '#334155' });

/** Every week in order: the plan's weeks, plus any built week the plan has not caught up with. */
export function planWeeks(index: CourseIndex | null): PlanWeek[] {
  const built = new Map((index?.weeks ?? []).map((w) => [w.week, w]));
  const numbers = [...new Set([...RAW.weeks.map((w) => w.week), ...built.keys()])].sort((a, b) => a - b);
  return numbers.map((n) => {
    const planned = RAW.weeks.find((w) => w.week === n);
    const b = built.get(n);
    return {
      week: n,
      module: (planned && RAW.modules[planned.module]) || fallbackModule(n),
      focus: planned?.focus ?? b?.theme ?? '',
      open: !!b && !b.locked,
      days: b?.days ?? [],
    };
  });
}

/** How many distinct modules the plan uses. */
export const moduleCount = new Set(RAW.weeks.map((w) => w.module)).size;
