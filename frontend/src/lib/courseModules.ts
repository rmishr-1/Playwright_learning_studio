/**
 * Module names for the course index table ("Foundation", ...). The course index JSON only knows a
 * week's number and theme, so the module a week belongs to lives here - edit this list as new
 * weeks are written. A week not listed falls back to "Week N".
 */
export type ModuleInfo = {
  name: string;
  /** Background of the Module cell. Deep tones, so white text reads on them in both themes. */
  color: string;
};

// Colours chosen to sit next to the navy header: indigo, teal, royal blue, plum, slate.
const MODULES: Record<number, ModuleInfo> = {
  1: { name: 'Foundation', color: '#3b3fa8' },
  2: { name: 'Foundation', color: '#3b3fa8' },
  3: { name: 'Core Playwright', color: '#0f766e' },
  4: { name: 'Core Playwright', color: '#0f766e' },
  5: { name: 'Framework Design', color: '#1d4ed8' },
  6: { name: 'Framework Design', color: '#1d4ed8' },
  7: { name: 'Advanced & CI', color: '#7e22ce' },
  8: { name: 'Capstone', color: '#334155' },
};

/** The module for a week, or a neutral fallback. */
export function moduleFor(week: number): ModuleInfo {
  return MODULES[week] ?? { name: 'Week ' + week, color: '#334155' };
}
