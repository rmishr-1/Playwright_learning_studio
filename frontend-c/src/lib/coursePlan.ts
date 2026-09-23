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
  description?: string;
  modules: Record<string, PlanModule>;
  weeks: { week: number; module: string; focus: string }[];
};

const RAW = plan as RawPlan;

/** The course's description, shown under its name on the course index. Empty if the plan has none. */
export const courseDescription = RAW.description ?? '';

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

/** "Week 3", "Weeks 3–7", or "Weeks 3, 5 & 7" - the not-yet-built weeks, as one short phrase. */
export function weeksPhrase(numbers: number[]): string {
  if (numbers.length === 1) return 'Week ' + numbers[0];
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (contiguous) return 'Weeks ' + numbers[0] + '–' + numbers[numbers.length - 1];
  return 'Weeks ' + numbers.slice(0, -1).join(', ') + ' & ' + numbers[numbers.length - 1];
}
