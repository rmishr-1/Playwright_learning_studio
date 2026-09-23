import { z } from 'zod';
import { DayNumber, PartNumber, ProblemNumber, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/run_format.json.
 * The live browser view does NOT travel in the response — it streams over
 * WS /api/run/:run_id/stream as screencast frames. This is the terminal result.
 */

export const RunRequest = z.object({
  /**
   * Minted by POST /api/run/prepare and passed back here. Two steps, because the client must
   * attach the WebSocket before execution starts or it misses the first second of frames.
   */
  run_id: z.string().uuid(),
  week: WeekNumber,
  day: DayNumber,
  part: PartNumber,
  /** Set when this run is an attempt at a practice problem, so progress can record it. */
  problem_number: ProblemNumber.nullable().optional(),
  code: z.string().min(1).max(64_000),
});

export const RunStatus = z.enum(['ok', 'error', 'timeout', 'blocked', 'queued_out']);

export const RunResult = z.object({
  run_id: z.string().min(1),
  status: RunStatus,
  stdout: z.string(),
  stderr: z.string(),
  error: z
    .object({ message: z.string(), stack: z.string() })
    .nullable(),
  /** base64 PNG from show(), or the final screencast frame. null if no page was opened. */
  screenshot: z.string().nullable(),
  duration_ms: z.number().int().nonnegative(),
  /** Set when status is 'blocked': the navigation the allowlist refused. */
  blocked_url: z.string().nullable(),
});

/** Frames pushed down WS /api/run/:run_id/stream. */
export const RunStreamEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('started') }),
  z.object({ event: z.literal('frame'), data: z.string(), width: z.number(), height: z.number() }),
  z.object({ event: z.literal('stdout'), text: z.string() }),
  z.object({ event: z.literal('ended'), status: RunStatus }),
  // Terminal only. `data` is a raw chunk of the test runner's output, ANSI colors included, so
  // it is written to the terminal as it arrives rather than split into lines.
  z.object({ event: z.literal('term'), data: z.string() }),
  // Terminal only: the command finished. `open_url` is set by `npx playwright show-report`.
  z.object({ event: z.literal('exit'), code: z.number().int().nullable(), open_url: z.string().optional() }),
]);

export type RunRequest = z.infer<typeof RunRequest>;
export type RunStatus = z.infer<typeof RunStatus>;
export type RunResult = z.infer<typeof RunResult>;
export type RunStreamEvent = z.infer<typeof RunStreamEvent>;
