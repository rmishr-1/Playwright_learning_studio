/**
 * Builds the course the app serves (Data/Content/) from the course source (Data/Source/).
 *
 *   npm run build:content
 *
 * Each Data/Source/week-<n>/ folder is one week's course package. Its Markdown files are the
 * source the authors edit, and its own tools (tools/build_json.py) turn them into json/day<n>.json.
 * This script reads that JSON and writes one app day file per day, plus the course index:
 *
 *   Data/Content/course-index.json
 *   Data/Content/weeks/week-<n>/day-<n>.json
 *
 * A day's four sections become its four tabs, in order: Prerequisites, Fundamentals,
 * Implementation, Practice. Each lesson in a section becomes a `##` heading on that tab, followed
 * by its blocks. Callouts marked `platform` are notes for the people who build the app, so they
 * are left out. Every day is validated against the contract before anything is written, so a
 * source that does not fit fails here rather than in the learner's browser.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CourseDay,
  WorkspaceSeeds,
  type ContentBlock,
  type CoursePart,
  type PracticeProblem,
  type Workspace,
} from '../shared/contracts/course_day';
import { CourseIndex } from '../shared/contracts/course_index';
import type { PartNumber } from '../shared/contracts/common';

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'Data', 'Source');
const CONTENT = path.join(ROOT, 'Data', 'Content');
const COURSE_TITLE = 'Playwright with TypeScript';

// ---------------------------------------------------------------- the source format

type SrcOption = { id: string; text: string };
type SrcBlock = { type: string; [key: string]: unknown };
type SrcLesson = { id: string; title: string; blocks: SrcBlock[] };
type SrcSection = { id: string; title: string; intro?: string; lessons: SrcLesson[] };
type SrcDay = {
  week: number;
  day: number;
  title: string;
  subtitle?: string;
  estimatedTime?: string;
  topics?: string[];
  objectives?: string[];
  prerequisitesFromEarlierDays?: string[];
  workspace?: string;
  sections: SrcSection[];
};
type SrcWeek = { week: number; title: string };

const SECTIONS: Record<string, { part: PartNumber; kind: CoursePart['kind'] }> = {
  prerequisites: { part: 1, kind: 'prerequisite' },
  fundamentals: { part: 2, kind: 'concept' },
  implementation: { part: 3, kind: 'concept' },
  practice: { part: 4, kind: 'practice' },
};

const LEVELS: Record<string, PracticeProblem['difficulty']> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  challenge: 'Challenge',
};

// ---------------------------------------------------------------- helpers

function fail(where: string, message: string): never {
  throw new Error(where + ': ' + message);
}

const str = (b: SrcBlock, key: string): string | undefined => (typeof b[key] === 'string' ? (b[key] as string) : undefined);

function block(type: ContentBlock['type'], text: string, extra: Partial<ContentBlock> = {}): ContentBlock {
  return { type, text, starter: null, variation: null, checkpoint: null, code: null, callout: null, ...extra };
}

/** A fenced code block, with a fence long enough that the code's own backticks cannot close it. */
function fence(language: string, text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = '`'.repeat(longest + 1);
  return ticks + language + '\n' + text.replace(/\n$/, '') + '\n' + ticks;
}

function languageOf(file: string | undefined): string {
  if (!file) return 'text';
  if (file.endsWith('.ts')) return 'ts';
  if (file.endsWith('.json')) return 'json';
  return 'text';
}

// ---------------------------------------------------------------- blocks

function quiz(b: SrcBlock, where: string): ContentBlock {
  const options = (b.options as SrcOption[] | undefined) ?? fail(where, 'a quiz has no options');
  const correct = (b.correct as string[] | undefined) ?? fail(where, 'a quiz has no answer');
  const answers = correct.map((id) => {
    const i = options.findIndex((o) => o.id === id);
    return i === -1 ? fail(where, 'quiz ' + String(b.id) + ' names an answer "' + id + '" that is not an option') : i;
  });
  const kind = str(b, 'quizType') ?? 'single';
  if (kind !== 'single' && kind !== 'multiple' && kind !== 'truefalse') fail(where, 'unknown quiz type ' + kind);
  return block('checkpoint', str(b, 'question') ?? fail(where, 'a quiz has no question'), {
    checkpoint: { options: options.map((o) => o.text), answers, kind, explanation: str(b, 'explanation') ?? '' },
  });
}

function exercise(b: SrcBlock, number: number, where: string): PracticeProblem {
  const kind = str(b, 'exerciseType') ?? 'code';
  if (kind !== 'code' && kind !== 'terminal' && kind !== 'written' && kind !== 'predict') {
    fail(where, 'unknown exercise type ' + kind);
  }
  const file = str(b, 'file') ?? null;
  const run = str(b, 'run') ?? null;
  const title = str(b, 'title') ?? null;
  let statement = str(b, 'prompt') ?? fail(where, 'exercise ' + String(b.id) + ' has no prompt');

  let stub: string;
  let solution: string | null;
  if (kind === 'predict') {
    const code = str(b, 'code');
    if (code) statement += '\n\n' + fence(str(b, 'codeLanguage') ?? 'ts', code);
    stub = '// Your prediction, and why:\n';
    solution = str(b, 'answer') ?? null;
  } else if (kind === 'written') {
    stub = '// Write your answer here.\n';
    const model = str(b, 'modelAnswer');
    const rubric = b.rubric as string[] | undefined;
    solution = model ?? null;
    if (solution && rubric?.length) {
      solution += '\n\n**What a good answer includes**\n\n' + rubric.map((r) => '- ' + r).join('\n');
    }
  } else if (kind === 'terminal') {
    stub = '# Write one command per line.\n';
    const s = str(b, 'solution');
    solution = s ? fence('bash', s) : null;
  } else {
    stub = str(b, 'starter') ?? '// ' + (title ?? 'Exercise ' + number) + (file ? '\n// Save this as ' + file : '') + '\n';
    const s = str(b, 'solution');
    const expected = str(b, 'expectedOutput');
    solution = s ? fence(languageOf(file ?? undefined), s) : null;
    if (solution && expected) solution += '\n\n**Output**\n\n' + fence('output', expected);
  }

  return {
    number,
    difficulty: LEVELS[str(b, 'level') ?? ''] ?? null,
    title,
    kind,
    statement,
    stub,
    hints: (b.hints as string[] | undefined) ?? [],
    file,
    run,
    solution,
  };
}

function convertBlock(b: SrcBlock, where: string): ContentBlock | null {
  switch (b.type) {
    case 'markdown':
      return block('markdown', str(b, 'content') ?? '');
    case 'callout': {
      const variant = str(b, 'variant') ?? 'note';
      // Notes for the people who build the app, not for learners.
      if (variant === 'platform') return null;
      if (!['tip', 'note', 'warning', 'tester', 'deepdive'].includes(variant)) fail(where, 'unknown callout ' + variant);
      return block('callout', str(b, 'content') ?? '', {
        callout: { variant: variant as 'tip', title: str(b, 'title') ?? null },
      });
    }
    case 'diagram':
      if (str(b, 'format') !== 'mermaid') fail(where, 'only mermaid diagrams are supported');
      return block('diagram', str(b, 'content') ?? '');
    case 'code':
      return block('code', str(b, 'content') ?? '', {
        code: {
          language: str(b, 'language') ?? 'text',
          file: str(b, 'file') ?? null,
          run: str(b, 'run') ?? null,
          mode: str(b, 'mode') === 'editor' ? 'editor' : 'read',
          expect_error: b.expectError === true,
          network: b.network === true,
        },
      });
    case 'terminal':
      return block('terminal', ((b.commands as string[] | undefined) ?? []).join('\n'));
    case 'output':
      return block('markdown', fence('output', str(b, 'content') ?? ''));
    case 'quiz':
      return quiz(b, where);
    default:
      return fail(where, 'unknown block type ' + b.type);
  }
}

// ---------------------------------------------------------------- a day

function atAGlance(d: SrcDay): string {
  const rows: string[] = [];
  if (d.subtitle) rows.push('*' + d.subtitle + '*', '');
  // A blank line after each, so the two render as separate lines rather than one paragraph.
  if (d.estimatedTime) rows.push('**Time:** ' + d.estimatedTime, '');
  if (d.workspace) rows.push('**Where you work:** ' + d.workspace);
  if (d.objectives?.length) rows.push('', '**By the end of the day you can:**', '', ...d.objectives.map((o) => '- ' + o));
  if (d.prerequisitesFromEarlierDays?.length) {
    rows.push('', '**From earlier days:**', '', ...d.prerequisitesFromEarlierDays.map((p) => '- ' + p));
  }
  return rows.join('\n').trim();
}

function convertDay(d: SrcDay): CourseDay {
  const at = 'week ' + d.week + ' day ' + d.day;
  let exerciseNo = 0;
  const parts = d.sections.map((s): CoursePart => {
    const role = SECTIONS[s.id] ?? fail(at, 'unknown section ' + s.id);
    const blocks: ContentBlock[] = [block('markdown', '# Day ' + d.day + ' · ' + s.title + (s.intro ? '\n\n' + s.intro : ''))];
    if (role.part === 1) blocks.push(block('at-a-glance', '**' + d.title + '**\n\n' + atAGlance(d)));
    const problems: PracticeProblem[] = [];
    for (const lesson of s.lessons) {
      blocks.push(block('markdown', '## ' + lesson.title));
      for (const b of lesson.blocks) {
        const where = at + ' ' + lesson.id;
        if (b.type === 'exercise') {
          exerciseNo++;
          problems.push(exercise(b, exerciseNo, where));
          blocks.push(block('problem-ref', String(exerciseNo)));
          continue;
        }
        const converted = convertBlock(b, where);
        if (converted) blocks.push(converted);
      }
    }
    // Markdown blocks in a row read as one; merging them keeps the page's spacing even.
    const merged: ContentBlock[] = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (b.type === 'markdown' && last?.type === 'markdown') last.text += '\n\n' + b.text;
      else merged.push(b);
    }
    // The editor, and with it the Terminal, is offered on any tab with something to run or type.
    const runnable =
      merged.some((b) => b.code?.mode === 'editor' || b.type === 'terminal') ||
      problems.some((p) => p.kind === 'code' || p.kind === 'terminal');
    return {
      part: role.part,
      kind: role.kind,
      title: s.title,
      tab_label: s.title,
      has_runnable_code: runnable,
      blocks: merged,
      problems,
    };
  });
  parts.sort((a, b) => a.part - b.part);
  // A day that runs before the learner has installed anything works in a ready-made workspace.
  const workspace: Workspace = /^pre-loaded/i.test(d.workspace ?? '') ? 'demo' : 'project';
  return CourseDay.parse({ schema: 'course-day/v2', week: d.week, day: d.day, title: d.title, locked: false, workspace, parts });
}

// ---------------------------------------------------------------- the Terminal's workspaces

/** Every file under `dir`, keyed by its path relative to `dir`, with forward slashes. */
function readTree(dir: string, skip: (rel: string) => boolean = () => false): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (at: string): void => {
    for (const e of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, e.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (skip(rel)) continue;
      if (e.isDirectory()) walk(full);
      else out[rel] = fs.readFileSync(full, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

/**
 * The files each workspace starts with.
 *
 * - Both start as a new project does: Data/Source/workspace/ (the example test), and a
 *   `ts-basics` folder set up as the TypeScript lessons set it up.
 * - 'demo' adds the files that a demo day's own code blocks name, because that day runs before
 *   the learner has made any.
 * - 'project' adds only the files that another lesson file imports, such as a page of HTML that
 *   several tests load. A lesson asks the learner to create those too, and saving it from the
 *   editor replaces the copy; having it already there means that running a file which imports it
 *   works even if the learner skipped that step.
 */
function buildSeeds(days: CourseDay[], lessonFiles: Record<string, string>): WorkspaceSeeds {
  const base: Record<string, string> = {
    ...readTree(path.join(SOURCE, 'workspace'), (rel) => rel === 'README.md'),
    'ts-basics/package.json': JSON.stringify({ name: 'ts-basics', private: true, type: 'module' }, null, 2) + '\n',
  };

  const demo: Record<string, string> = { ...base };
  for (const day of days.filter((d) => d.workspace === 'demo')) {
    for (const b of day.parts.flatMap((p) => p.blocks)) {
      const file = b.code?.file;
      if (!file) continue;
      demo[file] = lessonFiles[file] ?? fail('week ' + day.week + ' day ' + day.day, 'no lesson file for ' + file);
    }
  }

  const project: Record<string, string> = { ...base };
  for (const [file, text] of Object.entries(lessonFiles)) {
    for (const m of text.matchAll(/from\s+['"](\.\/[\w./-]+)['"]/g)) {
      let target = path.posix.join(path.posix.dirname(file), m[1]);
      if (!target.endsWith('.ts')) target += '.ts';
      project[target] = lessonFiles[target] ?? fail(file, 'imports ' + m[1] + ', which is not a lesson file');
    }
  }

  return WorkspaceSeeds.parse({ schema: 'workspace-seeds/v1', workspaces: { demo: { files: demo }, project: { files: project } } });
}

// ---------------------------------------------------------------- the course

function main(): void {
  const weekDirs = fs
    .readdirSync(SOURCE)
    .filter((n) => /^week-\d+$/.test(n))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  if (weekDirs.length === 0) fail('Data/Source', 'no week-<n> folder');

  const weeks: CourseIndex['weeks'] = [];
  const out: { file: string; day: CourseDay }[] = [];
  // Every week's lesson files, keyed by their path in the learner's project.
  const lessonFiles: Record<string, string> = {};
  for (const dir of weekDirs) {
    Object.assign(lessonFiles, readTree(path.join(SOURCE, dir, 'files', 'lessons')));
    const json = path.join(SOURCE, dir, 'json');
    const weekFile = fs.readdirSync(json).find((n) => /^week\d+\.json$/.test(n)) ?? fail(dir, 'no json/week<n>.json');
    const week = JSON.parse(fs.readFileSync(path.join(json, weekFile), 'utf-8')) as SrcWeek;
    const dayFiles = fs
      .readdirSync(json)
      .filter((n) => /^day\d+\.json$/.test(n))
      .sort((a, b) => Number(a.slice(3, -5)) - Number(b.slice(3, -5)));
    const days = dayFiles.map((f) => convertDay(JSON.parse(fs.readFileSync(path.join(json, f), 'utf-8')) as SrcDay));
    for (const day of days) {
      if (day.week !== week.week) fail(dir, 'day ' + day.day + ' says week ' + day.week);
      out.push({ file: path.join(CONTENT, 'weeks', 'week-' + day.week, 'day-' + day.day + '.json'), day });
    }
    weeks.push({
      week: week.week,
      // "Week 1 — Fundamentals, Setup & Programming" -> the part after the week number.
      theme: week.title.replace(/^Week\s+\d+\s*[—–-]\s*/, ''),
      locked: false,
      days: days.map((d) => ({ day: d.day, title: d.title, locked: d.locked })),
    });
  }

  const days = out.map((o) => o.day);
  const index = CourseIndex.parse({
    schema: 'course-index/v1',
    title: COURSE_TITLE,
    totals: {
      weeks: weeks.length,
      days: days.length,
      parts: days.reduce((n, d) => n + d.parts.length, 0),
      practice_problems: days.reduce((n, d) => n + d.parts.reduce((m, p) => m + p.problems.length, 0), 0),
      available_days: days.filter((d) => !d.locked).length,
    },
    weeks,
  });

  const seeds = buildSeeds(days, lessonFiles);

  // Written only once everything has validated, so a bad source never leaves a half-built course.
  fs.writeFileSync(path.join(CONTENT, 'workspaces.json'), JSON.stringify(seeds, null, 2) + '\n');
  fs.rmSync(path.join(CONTENT, 'weeks'), { recursive: true, force: true });
  for (const o of out) {
    fs.mkdirSync(path.dirname(o.file), { recursive: true });
    fs.writeFileSync(o.file, JSON.stringify(o.day, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(CONTENT, 'course-index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(
    'Built ' + index.totals.days + ' day(s) in ' + index.totals.weeks + ' week(s): ' + index.totals.parts + ' tabs, ' +
      index.totals.practice_problems + ' exercises.',
  );
}

main();
