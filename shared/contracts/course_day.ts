import { z } from 'zod';
import { Difficulty, DayNumber, PartNumber, ProblemNumber, WeekNumber } from './common';

/**
 * Mirrors Data/Formats/course_day_format.json. One day of the course, built from the course source
 * in Data/Source/ by `npm run build:content`.
 */

/**
 * - 'markdown': prose. Output samples are markdown too, as ```output fences.
 * - 'code': a code sample, with the file it belongs to and the command that runs it.
 * - 'terminal': commands to type in a terminal, one per line.
 * - 'callout': a boxed note - a tip, a warning, the manual tester's view, and so on.
 * - 'diagram': a mermaid diagram.
 * - 'reference': a full reference table or list, collapsed behind its title, for a lesson that
 *   teaches only the first few items and keeps the rest for later.
 * - 'checkpoint': a quiz question.
 * - 'problem-ref': where a practice exercise sits, its text being the exercise's number, so that
 *   text written after the exercises renders after them rather than above the first one.
 * - 'at-a-glance' opens a day, and 'recap' closes a lesson. Both render as cards.
 * - 'example' and 'your-turn' are editor code without a file of its own.
 */
export const BlockType = z.enum([
  'markdown',
  'code',
  'terminal',
  'callout',
  'diagram',
  'reference',
  'example',
  'your-turn',
  'problem-ref',
  'at-a-glance',
  'checkpoint',
  'recap',
]);

/**
 * One quiz question. Formative, never scored: the learner picks, sees at once whether they were
 * right, and reads why. Nothing is recorded, so a wrong answer costs nothing but the reading -
 * which is the point of putting it mid-lesson rather than in an exam.
 */
export const Checkpoint = z
  .object({
    options: z.array(z.string()).min(2).max(8),
    /** Indexes into options. One for a single-answer question, one or more for 'multiple'. */
    answers: z.array(z.number().int().min(0)).min(1),
    /** 'multiple' asks the learner to select every correct option, then check. */
    kind: z.enum(['single', 'multiple', 'truefalse']),
    /** Shown after answering, right or wrong - the reason, not just the verdict. */
    explanation: z.string(),
  })
  .refine((c) => c.answers.every((a) => a < c.options.length), {
    message: 'every answer must be an index into options',
    path: ['answers'],
  });

export const CodeMeta = z.object({
  /** The fence language: ts, html, json, text and so on. */
  language: z.string(),
  /** The file this code belongs to, relative to the learner's project folder. null for a snippet. */
  file: z.string().nullable(),
  /** The command that runs it in the Terminal, from the file's own folder. null when there is none. */
  run: z.string().nullable(),
  /** 'editor' can be opened in the editor; 'read' is shown only. */
  mode: z.enum(['editor', 'read']),
  /** The sample is meant to fail: a type error, or a failing test, shown on purpose. */
  expect_error: z.boolean(),
  /** The sample needs the internet. */
  network: z.boolean(),
});

export const CalloutMeta = z.object({
  variant: z.enum(['tip', 'note', 'warning', 'tester', 'deepdive']),
  title: z.string().nullable(),
});

export const ContentBlock = z.object({
  type: BlockType,
  /**
   * Markdown for markdown, callout, at-a-glance and recap blocks; source code for code, example
   * and your-turn blocks; the commands, one per line, for a terminal block; mermaid source for a
   * diagram; the question for a checkpoint; the exercise number as a string for problem-ref.
   */
  text: z.string(),
  /** A 'your-turn' block's runnable starting point. null for every other block type. */
  starter: z.string().nullable().default(null),
  /** A 'your-turn' block's prompt. null for every other block type. */
  variation: z.object({ prompt: z.string() }).nullable().default(null),
  /** A 'checkpoint' block's options, answers and explanation. null for every other block type. */
  checkpoint: Checkpoint.nullable().default(null),
  /** A 'code' block's file, command and mode. null for every other block type. */
  code: CodeMeta.nullable().default(null),
  /** A 'callout' block's kind and title. null for every other block type. */
  callout: CalloutMeta.nullable().default(null),
  /** A 'reference' block's title, shown while it is collapsed. null for every other block type. */
  title: z.string().nullable().default(null),
});

export const Workspace = z.enum(['demo', 'project']);

/**
 * Data/Content/workspaces.json: the files each Terminal workspace starts with, keyed by path
 * relative to the workspace folder. Written by `npm run build:content`.
 */
export const WorkspaceSeeds = z.object({
  schema: z.literal('workspace-seeds/v1'),
  workspaces: z.record(Workspace, z.object({ files: z.record(z.string(), z.string()) })),
});

/**
 * How "Check my answer" grades a code exercise. The learner's code is saved as the exercise's
 * file, and `run` runs in the Terminal's workspace, as the lesson would run it.
 * - stdoutEquals: the program's output, trimmed, must equal `expected`.
 * - testsPass: the command must succeed, which for `npx playwright test` means every test passed.
 */
export const ExerciseCheck = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stdoutEquals'), run: z.string(), expected: z.string() }),
  z.object({ kind: z.literal('testsPass'), run: z.string() }),
]);

export const PartKind = z.enum(['prerequisite', 'concept', 'practice']);

export const PracticeProblem = z.object({
  number: ProblemNumber,
  /** null for an exercise that carries no level. */
  difficulty: Difficulty.nullable(),
  title: z.string().nullable().default(null),
  /**
   * 'code' is written and run in the editor; 'terminal' asks for commands; 'written' asks for an
   * answer in words; 'predict' shows code and asks what it does.
   */
  kind: z.enum(['code', 'terminal', 'written', 'predict']).default('code'),
  /** Markdown: what to do. */
  statement: z.string(),
  /**
   * What "Start this in the editor" loads. null for an exercise the editor cannot help with: one
   * answered in words or in the Terminal, or one whose file the studio cannot run. The button is
   * then absent.
   */
  stub: z.string().nullable(),
  /** Hints, revealed one at a time. */
  hints: z.array(z.string()).default([]),
  /** The file the exercise's code belongs to, relative to the learner's project folder. */
  file: z.string().nullable().default(null),
  /** The command that runs the exercise's code in the Terminal. */
  run: z.string().nullable().default(null),
  /** How "Check my answer" grades the exercise. null when it has no automatic check. */
  check: ExerciseCheck.nullable().default(null),
  /**
   * Markdown, revealed on a deliberate click. Code answers carry their own fence. null until
   * written - the reveal button is then absent, not broken.
   */
  solution: z.string().nullable(),
});

export const CoursePart = z.object({
  part: PartNumber,
  kind: PartKind,
  title: z.string(),
  tab_label: z.string(),
  has_runnable_code: z.boolean(),
  blocks: z.array(ContentBlock),
  problems: z.array(PracticeProblem),
});

export const CourseDay = z.object({
  schema: z.literal('course-day/v2'),
  week: WeekNumber,
  day: DayNumber,
  /**
   * The day's number across the whole course: Week 2's first day is Day 6. The lessons, their
   * headings and their file names (tests/day9/...) all count this way, so it is what the page shows.
   * `day` is the position within the week, which the URL uses.
   */
  number: z.number().int().min(1),
  title: z.string(),
  locked: z.boolean(),
  /**
   * The Terminal workspace the day's commands run in. 'demo' is ready-made with the day's own
   * files, for a day that comes before the learner has a project; 'project' is the learner's own
   * project, which starts as `npm init playwright@latest` leaves it and keeps what they save.
   */
  workspace: Workspace,
  /** Ordered, 1-4. A day need not have all four, and nothing downstream may assume it does. */
  parts: z.array(CoursePart).min(1).max(4),
});

export type Checkpoint = z.infer<typeof Checkpoint>;
export type CodeMeta = z.infer<typeof CodeMeta>;
export type CalloutMeta = z.infer<typeof CalloutMeta>;
export type ContentBlock = z.infer<typeof ContentBlock>;
export type PracticeProblem = z.infer<typeof PracticeProblem>;
export type CoursePart = z.infer<typeof CoursePart>;
export type CourseDay = z.infer<typeof CourseDay>;
export type Workspace = z.infer<typeof Workspace>;
export type WorkspaceSeeds = z.infer<typeof WorkspaceSeeds>;
