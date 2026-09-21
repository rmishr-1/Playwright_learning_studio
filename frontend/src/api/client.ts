/**
 * The ONLY place in the SPA that calls fetch(). Enforced by the verification checklist:
 *   grep -r "fetch(" frontend/src   must match this file and nothing else.
 *
 * There is no session cookie and no learner id in any of this - there are no accounts, and the
 * server keeps exactly one progress record for whoever is running this clone.
 */
import type { CourseDay } from '../../../shared/contracts/course_day';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Progress, ProgressUpdate } from '../../../shared/contracts/progress';
import type { RunResult, RunStreamEvent } from '../../../shared/contracts/run';
import type { ErrorCode } from '../../../shared/contracts/problem_error';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    detail: string,
  ) {
    super(detail);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let code: ErrorCode = 'INTERNAL_ERROR';
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { code?: ErrorCode; detail?: string };
      if (body.code) code = body.code;
      if (body.detail) detail = body.detail;
    } catch {
      // A non-JSON error body is still an error; keep the status text.
    }
    throw new ApiError(code, res.status, detail);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- content

export const getCourse = (): Promise<CourseIndex> => call('/course');

export const getDay = (week: number, day: number): Promise<CourseDay> =>
  call('/course/' + week + '/' + day);

export const getConcepts = (): Promise<{ entries: { term: string; section: string; link: string; note: string }[] }> =>
  call('/concepts');

// ---------------------------------------------------------------- progress

export const getMyProgress = (): Promise<Progress> => call('/progress');

export const recordProgress = (update: ProgressUpdate): Promise<Progress> =>
  call('/progress', { method: 'POST', body: JSON.stringify(update) });

// ---------------------------------------------------------------- run

export const prepareRun = (): Promise<{ run_id: string }> => call('/run/prepare', { method: 'POST' });

/** What the detached view seeds itself with before its own WebSocket brings anything new. */
export const getLastFrame = (runId: string): Promise<{ frame: string | null; status: string | null }> =>
  call('/run/' + runId + '/last-frame');

export type RunPayload = {
  run_id: string;
  week: number;
  day: number;
  part: number;
  problem_number?: number | null;
  code: string;
};

export const runCode = (payload: RunPayload): Promise<RunResult> =>
  call('/run', { method: 'POST', body: JSON.stringify(payload) });

/** Live browser frames. Attach BEFORE posting the run or the first frames are missed. */
export function openRunStream(runId: string, onEvent: (e: RunStreamEvent) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/api/run/' + runId + '/stream');
  ws.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data as string) as RunStreamEvent);
    } catch {
      // A malformed frame is the server's bug; dropping it beats killing the overlay.
    }
  };
  return () => ws.close();
}

// ---------------------------------------------------------------- assistant

/** SSE, so not fetch-based JSON. Returns a cancel function. */
export function askAssistant(
  body: unknown,
  onDelta: (text: string) => void,
  onDone: (error?: string) => void,
): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onDone('The assistant is not available.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          const parsed = JSON.parse(data) as { text?: string };
          if (event === 'delta' && parsed.text) onDelta(parsed.text);
          else if (event === 'error') onDone(parsed.text ?? 'Assistant error.');
          else if (event === 'done') onDone();
        }
      }
      onDone();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onDone('The assistant request failed.');
    }
  })();
  return () => controller.abort();
}
