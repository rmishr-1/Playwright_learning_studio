import type { CourseResponse, IndexDay } from '../../../shared/contracts/course_index';
import type { PlanModule } from '../../../shared/contracts/course_plan';

/**
 * The course plan says which module each week belongs to and what it focuses on. It is part of the
 * course (Data/Content/course-plan.json), so it comes with it: GET /api/course returns it as `plan`.
 * It lists every week of the course, written or not; the course index lists only the weeks that are
 * built. A week's days - its key topics - always come from the index, so a planned week with no days
 * yet shows as "opens soon". A course without a plan still shows every built week.
 */
export type { PlanModule };

export type PlanWeek = {
  week: number;
  module: PlanModule;
  focus: string;
  /** Built and not locked: its days can be opened. */
  open: boolean;
  days: IndexDay[];
};

/** A built week the plan does not mention yet still shows, under a neutral module. */
const fallbackModule = (week: number): PlanModule => ({ name: 'Week ' + week, color: '#334155' });

/** Every week in order: the plan's weeks, plus any built week the plan has not caught up with. */
export function planWeeks(index: CourseResponse | null): PlanWeek[] {
  const plan = index?.plan ?? null;
  const planned = plan?.weeks ?? [];
  const built = new Map((index?.weeks ?? []).map((w) => [w.week, w]));
  const numbers = [...new Set([...planned.map((w) => w.week), ...built.keys()])].sort((a, b) => a - b);
  return numbers.map((n) => {
    const p = planned.find((w) => w.week === n);
    const b = built.get(n);
    return {
      week: n,
      module: (p && plan?.modules[p.module]) || fallbackModule(n),
      focus: p?.focus ?? b?.theme ?? '',
      open: !!b && !b.locked,
      days: b?.days ?? [],
    };
  });
}

/** "Week 3", "Weeks 3–7", or "Weeks 3, 5 & 7" - the not-yet-built weeks, as one short phrase. */
export function weeksPhrase(numbers: number[]): string {
  if (numbers.length === 1) return 'Week ' + numbers[0];
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (contiguous) return 'Weeks ' + numbers[0] + '–' + numbers[numbers.length - 1];
  return 'Weeks ' + numbers.slice(0, -1).join(', ') + ' & ' + numbers[numbers.length - 1];
}
