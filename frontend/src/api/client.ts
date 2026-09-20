/**
 * The ONLY place in the SPA that calls fetch(). Enforced by the verification checklist:
 *   grep -r "fetch(" frontend/src   must match this file and nothing else.
 *
 * Every call sends the session cookie. No call sends a learner id: the server takes the acting
 * user from that cookie, because an id in a payload is a claim rather than a fact (invariant 5).
 */
import type { CourseDay } from '../../../shared/contracts/course_day';
import type { CourseIndex } from '../../../shared/contracts/course_index';
import type { Learner, ProgressUpdate, Role } from '../../../shared/contracts/learner';
import type { Me } from '../../../shared/contracts/session';
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
    credentials: 'include',
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

// ---------------------------------------------------------------- auth

export const register = (name: string, email: string, password: string): Promise<Learner> =>
  call('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });

/**
 * Step one of a reset. The answer is identical whether or not the account exists, so this
 * never tells the caller who is registered. `delivery` says whether mail is configured at all.
 */
export const forgotPassword = (name: string): Promise<{ sent: true; delivery: 'smtp' | 'outbox' }> =>
  call('/auth/forgot', { method: 'POST', body: JSON.stringify({ name }) });

export const resetPassword = (name: string, code: string, password: string): Promise<{ ok: true }> =>
  call('/auth/reset', { method: 'POST', body: JSON.stringify({ name, code, password }) });

export const login = (name: string, password: string): Promise<Learner> =>
  call('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) });

export const logout = (): Promise<{ ok: true }> => call('/auth/logout', { method: 'POST' });

export const me = (): Promise<Me> => call('/auth/me');

// ---------------------------------------------------------------- content

export const getCourse = (): Promise<CourseIndex> => call('/course');

export const getDay = (week: number, day: number): Promise<CourseDay> =>
  call('/course/' + week + '/' + day);

export const getConcepts = (): Promise<{ entries: { term: string; section: string; link: string; note: string }[] }> =>
  call('/concepts');

// ---------------------------------------------------------------- learner

export const getMyProgress = (): Promise<Learner> => call('/learner/me');

export const recordProgress = (update: ProgressUpdate): Promise<Learner> =>
  call('/learner/progress', { method: 'POST', body: JSON.stringify(update) });

// ---------------------------------------------------------------- run

export const prepareRun = (): Promise<{ run_id: string }> => call('/run/prepare', { method: 'POST' });

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

// ---------------------------------------------------------------- certificate

export const getCertificate = (): Promise<{
  earned: boolean;
  completed: number;
  total: number;
  issued_at: string | null;
}> => call('/certificate');

/** The backend owns the markup; the page shows it in an iframe and the PDF renders the same. */
export const CERTIFICATE_HTML = '/api/certificate/view.html';
export const CERTIFICATE_PDF = '/api/certificate/certificate.pdf';

// ---------------------------------------------------------------- dashboard & people

export const getDashboard = (): Promise<{
  total_weeks: number;
  total_days: number;
  learners: {
    learner_id: string;
    display_name: string;
    role: Role;
    last_seen_at: string;
    days_done: number;
    current_week: number;
    weeks: { week: number; done: number; total: number; locked: boolean }[];
  }[];
}> => call('/dashboard');

export const getPeople = (): Promise<{
  people: {
    learner_id: string;
    display_name: string;
    role: Role;
    email: string | null;
    days_completed: number;
    pinned: boolean;
    unclaimed: boolean;
    last_seen_at: string;
  }[];
}> => call('/people');

export const setRole = (id: string, role: Role): Promise<Learner> =>
  call('/people/' + id + '/role', { method: 'PUT', body: JSON.stringify({ role }) });

/** Irreversible. The server refuses a pinned admin, the last admin, and your own account. */
export const deletePerson = (id: string): Promise<{ ok: true }> =>
  call('/people/' + id, { method: 'DELETE' });

/** Lets an admin give a pre-email account an address, so it can use Forgot password. */
export const setEmail = (id: string, email: string): Promise<Learner> =>
  call('/people/' + id + '/email', { method: 'PUT', body: JSON.stringify({ email }) });

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
        credentials: 'include',
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
