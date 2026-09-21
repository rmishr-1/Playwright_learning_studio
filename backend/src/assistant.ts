/**
 * The in-page learning assistant.
 *
 * EXPLAIN-ONLY by design: it never writes the editor, never runs code and never sees run
 * output. It is given the day's lesson text and the learner's progress, and nothing else.
 *
 * Invariant 4 in the format registry: practice SOLUTIONS must never enter the prompt. The
 * reveal button is the only route to an answer, and buildContext() below is what enforces it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { anthropicKey, config } from './config';
import { courseDay, readProgress } from './store';
import type { AssistantRequest } from '../../shared/contracts/assistant';
import type { CourseDay } from '../../shared/contracts/course_day';

const client = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

export const assistantAvailable = (): boolean => config.assistant.enabled && client !== null;

const SYSTEM = `You are the learning assistant inside a Playwright + TypeScript course platform.

You help a learner understand the day they are currently reading. The lesson text for that day
is given below; ground your answers in it, and refer back to earlier days by name when the
lesson does.

Rules:
- The practice problems in Part 4 are the learner's own work. NEVER write a solution, a
  near-solution, or code the learner could paste in as one. Give a hint, ask a question back,
  or point at the API involved. If they push, hold the line and remind them the page has a
  Reveal solution button when they genuinely want the answer.
- You cannot see their editor, run their code, or see errors from their runs. If they paste an
  error, work from the paste. Do not claim to see anything you cannot.
- Keep answers short. This is a side panel, not an essay.
- Where the lesson has already covered something, say which day covered it.`;

/**
 * The day's teaching text, with practice STATEMENTS included (the learner can see those) but
 * every authored solution stripped.
 */
function buildContext(day: CourseDay, part: number): string {
  const lines: string[] = [
    'Week ' + day.week + ', Day ' + day.day + ' - ' + day.title,
    'The learner is currently on part ' + part + '.',
    '',
  ];
  for (const p of day.parts) {
    lines.push('--- Part ' + p.part + ': ' + p.title + ' (' + p.kind + ')');
    for (const b of p.blocks) {
      // A checkpoint is a question with a right answer attached. Its payload is an answer key by
      // another name, so the whole block is withheld - same reasoning as invariant 4 keeps
      // q.solution out. Handing the assistant the question invites it to answer it for them,
      // which is the one thing a retrieval check cannot survive.
      if (b.type === 'checkpoint') continue;
      const isProse = b.type === 'markdown' || b.type === 'at-a-glance' || b.type === 'recap';
      lines.push(isProse ? b.text : '```ts\n' + b.text + '\n```');
    }
    for (const q of p.problems) {
      lines.push('Practice problem ' + q.number + (q.difficulty ? ' (' + q.difficulty + ')' : ''));
      lines.push(q.statement);
      // q.solution is deliberately NOT included - invariant 4.
    }
  }
  return lines.join('\n\n');
}

function progressSummary(): string {
  const current = readProgress();
  const done = Object.entries(current.progress)
    .filter(([, v]) => v.completed)
    .map(([k]) => k);
  const seen = Object.keys(current.progress);
  return [
    'Days completed: ' + (done.length ? done.join(', ') : 'none yet'),
    'Days opened: ' + (seen.length ? seen.join(', ') : 'none yet'),
  ].join('\n');
}

export type Chunk = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; text: string };

export async function* ask(req: AssistantRequest): AsyncGenerator<Chunk> {
  if (!client) {
    yield { type: 'error', text: 'The assistant is not configured on this server.' };
    return;
  }
  const day = courseDay(req.week, req.day);
  if (!day) {
    yield { type: 'error', text: 'That day is not available.' };
    return;
  }

  try {
    const stream = client.messages.stream({
      model: config.assistant.model,
      max_tokens: 4_000,
      thinking: { type: 'adaptive' },
      system: [
        // Stable prefix first so it caches across every question about this day.
        { type: 'text', text: SYSTEM },
        {
          type: 'text',
          text: 'LESSON TEXT\n\n' + buildContext(day, req.part),
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: 'LEARNER PROGRESS\n\n' + progressSummary() },
      ],
      messages: [
        ...req.history.map((t) => ({ role: t.role, content: t.text }) as const),
        { role: 'user' as const, content: req.question },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        yield { type: 'delta', text: event.delta.text };
      }
    }
    yield { type: 'done' };
  } catch (err) {
    yield { type: 'error', text: err instanceof Error ? err.message : 'Assistant request failed.' };
  }
}
