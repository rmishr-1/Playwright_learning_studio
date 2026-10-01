import type { DayTag } from '../../../shared/contracts/progress';

/**
 * What the tag on a day's card says: the day is new, or changed, since the learner's previous launch
 * (backend/src/reconcile.ts). It stays until they open the day.
 */
export const TAG_LABEL: Record<DayTag, string> = { new: 'New', updated: 'Updated' };
