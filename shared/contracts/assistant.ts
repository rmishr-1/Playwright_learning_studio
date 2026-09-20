import { z } from 'zod';
import { DayNumber, PartNumber, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/assistant_format.json.
 * EXPLAIN-ONLY: never writes the editor, never runs code, never sees run output.
 * Practice solutions must never enter its context (invariant 4).
 */

export const AssistantTurn = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
});

export const AssistantRequest = z.object({
  /** No learner_id: the acting user comes from the session cookie (invariant 5). */
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  history: z.array(AssistantTurn).max(40),
  question: z.string().min(1).max(4_000),
});

/** SSE events, not a JSON body. */
export const AssistantEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('delta'), text: z.string() }),
  z.object({ event: z.literal('done') }),
  z.object({ event: z.literal('error'), text: z.string() }),
]);

export type AssistantTurn = z.infer<typeof AssistantTurn>;
export type AssistantRequest = z.infer<typeof AssistantRequest>;
export type AssistantEvent = z.infer<typeof AssistantEvent>;
