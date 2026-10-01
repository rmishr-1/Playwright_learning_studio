/**
 * Builds the course the app serves (Data/Content/) from the course source (Data/Source/).
 *
 *   npm run build:content
 *
 * Each folder in Data/Source/ other than workspace/ is a course package, holding one or more
 * weeks. Its Markdown files are the source the authors edit, and its own tools
 * (tools/build_json.py) turn them into json/day<n>.json and json/week<n>.json. This script reads
 * that JSON and writes one app day file per day, the course index, and the Terminal's workspaces:
 *
 *   Data/Content/course-index.json
 *   Data/Content/weeks/week-<w>/day-<d>.json
 *   Data/Content/workspaces.json
 *   Data/Content/course-plan.json     (from Data/Source/course-plan.json, checked)
 *
 * The course counts its days across the whole course (Week 2 starts on Day 6), and that number is
 * kept as `number`, because the lessons and their file names use it. `day` is the position within
 * the week (1-5), which the page's address uses: Day 6 is /learn/w2/d1.
 *
 * A day's four sections become its four tabs, in order: Prerequisites, Fundamentals,
 * Implementation, Practice. Each lesson in a section becomes a `##` heading on that tab, followed
 * by its blocks. Callouts marked `platform` are notes for the people who build the app, so they
 * are left out. Every day is validated against the contract before anything is written, so a
 * source that does not fit fails here rather than in the learner's browser.
 *
 * Identity (registry invariants 10 and 11). Each exercise keeps the id its author gave it, checked
 * against the record of published ids (scripts/lib/identity-ledger.ts, Data/Source/published-ids.json)
 * so an id is never reused for a different exercise; each quiz keeps its id as a key; and each
 * exercise and day gets a revision token, so the studio can tell a learner what changed since their
 * last launch. When the ledger stops the build, say which it is:
 *
 *   npm run build:content -- --same d9-ex1            the same exercise, edited
 *   npm run build:content -- --new-identity d9-ex1    a different exercise under a reused id
 *
 * Commit Data/Source/published-ids.json with the content: it is what keeps the ids honest.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CourseDay,
  PROJECT_FILE,
  WorkspaceSeeds,
  type ContentBlock,
  type CoursePart,
  type PracticeProblem,
  type Workspace,
} from '../shared/contracts/course_day';
import { CourseIndex } from '../shared/contracts/course_index';
import { CoursePlan } from '../shared/contracts/course_plan';
import { ContentId, dayIdentity, exerciseIdentity, type PartNumber } from '../shared/contracts/common';
import { dayRevision, problemRevision } from '../shared/revision';
import { checkLedger, EMPTY_LEDGER, parseLedger, type LedgerExercise } from './lib/identity-ledger';

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'Data', 'Source');
const CONTENT = path.join(ROOT, 'Data', 'Content');
const LEDGER = path.join(SOURCE, 'published-ids.json');
const PLAN = path.join(SOURCE, 'course-plan.json');
/** Used when a package has no json/course.json title. */
const DEFAULT_TITLE = 'Playwright with TypeScript';

// ---------------------------------------------------------------- the source format

type SrcOption = { id: string; text: string };
type SrcBlock = { type: string; [key: string]: unknown };
type SrcLesson = { id: string; title: string; blocks: SrcBlock[] };
type SrcSection = { id: string; title: string; intro?: SrcBlock[]; lessons: SrcLesson[] };
type SrcDay = {
  /** The day's own identity, when its front matter gives one; otherwise it is 'd' + day. */
  id?: string;
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

/** A quiz's or an exercise's id as its author wrote it, checked to be one the contract accepts. */
function authoredId(b: SrcBlock, where: string): string | null {
  if (b.id === undefined) return null;
  const id = String(b.id);
  if (!ContentId.safeParse(id).success) fail(where, 'the id "' + id + '" may use only letters, digits, ".", "_", "~" and "-"');
  return id;
}

function block(type: ContentBlock['type'], text: string, extra: Partial<ContentBlock> = {}): ContentBlock {
  return { type, text, starter: null, variation: null, checkpoint: null, code: null, callout: null, title: null, id: null, ...extra };
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
    id: authoredId(b, where),
    checkpoint: { options: options.map((o) => o.text), answers, kind, explanation: str(b, 'explanation') ?? '' },
  });
}

/**
 * What "Start this in the editor" loads for a code exercise, or null when the editor cannot help.
 *
 * - null when the exercise's file is one the studio's Terminal cannot save or run, such as
 *   playwright.config.ts, which the studio writes itself. Only files in the project's own folders
 *   (PROJECT_FILE) can be saved.
 * - The exercise's own starter code, when it has some.
 * - The code in the prompt, when the prompt gives some to fix ("This file has four bugs").
 * - The file the prompt says to start by copying ("by copying `tests/example.spec.ts`").
 * - The file itself, when it is already a lesson file ("Open `tests/day1/auto-wait.spec.ts`").
 *   Loading anything else would replace that lesson file when the learner runs it.
 * - Otherwise a comment naming the file, for an exercise that writes a new file from scratch.
 */
function starterFor(b: SrcBlock, file: string | null, title: string, files: Record<string, string>): string | null {
  if (file && !PROJECT_FILE.test(file)) return null;
  const starter = str(b, 'starter');
  if (starter) return starter;
  const prompt = str(b, 'prompt') ?? '';
  const inPrompt = /```(?:ts|typescript)\n([\s\S]*?)\n```/.exec(prompt);
  if (inPrompt) return inPrompt[1] + '\n';
  const copied = /\bcopying\*{0,2}\s+`([\w./-]+)`/.exec(prompt);
  if (copied && files[copied[1]]) return files[copied[1]];
  if (file && files[file]) return files[file];
  return '// ' + title + (file ? '\n// Save this as ' + file : '') + '\n';
}

/**
 * The exercise's automatic check, for "Check my answer". Only a check the studio can run on the
 * learner's own answer is kept: the answer is the editor's code, so the exercise must open in the
 * editor (a stub), and the check must run that code. A `commandsRun` check runs the model answer's
 * commands rather than the learner's, a `typecheckPasses` one checks a file the studio writes
 * itself, and `self` is the learner's own judgement, so those exercises have no button.
 */
function checkFor(b: SrcBlock, stub: string | null, where: string): PracticeProblem['check'] {
  const c = b.check as { kind?: string; run?: string; expected?: string } | undefined;
  if (!c || stub === null) return null;
  if (c.kind === 'stdoutEquals') {
    if (!c.run || c.expected === undefined) fail(where, 'a stdoutEquals check needs run and expected');
    return { kind: 'stdoutEquals', run: c.run, expected: c.expected };
  }
  if (c.kind === 'testsPass') {
    if (!c.run) fail(where, 'a testsPass check needs run');
    return { kind: 'testsPass', run: c.run };
  }
  return null;
}

function exercise(b: SrcBlock, number: number, where: string, files: Record<string, string>): PracticeProblem {
  const kind = str(b, 'exerciseType') ?? 'code';
  if (kind !== 'code' && kind !== 'terminal' && kind !== 'written' && kind !== 'predict') {
    fail(where, 'unknown exercise type ' + kind);
  }
  const file = str(b, 'file') ?? null;
  const run = str(b, 'run') ?? null;
  const title = str(b, 'title') ?? null;
  let statement = str(b, 'prompt') ?? fail(where, 'exercise ' + String(b.id) + ' has no prompt');

  // Only a code exercise gets "Start this in the editor" (see starterFor). An answer in words, a
  // prediction, or commands for the Terminal need no editor, so the button is left out.
  let stub: string | null = null;
  let solution: string | null;
  if (kind === 'predict') {
    const code = str(b, 'code');
    if (code) statement += '\n\n' + fence(str(b, 'codeLanguage') ?? 'ts', code);
    solution = str(b, 'answer') ?? null;
  } else if (kind === 'written') {
    const model = str(b, 'modelAnswer');
    const rubric = b.rubric as string[] | undefined;
    solution = model ?? null;
    if (solution && rubric?.length) {
      solution += '\n\n**What a good answer includes**\n\n' + rubric.map((r) => '- ' + r).join('\n');
    }
  } else if (kind === 'terminal') {
    const s = str(b, 'solution');
    solution = s ? fence('bash', s) : null;
  } else {
    stub = starterFor(b, file, title ?? 'Exercise ' + number, files);
    const s = str(b, 'solution');
    const expected = str(b, 'expectedOutput');
    solution = s ? fence(languageOf(file ?? undefined), s) : null;
    if (solution && expected) solution += '\n\n**Output**\n\n' + fence('output', expected);
  }

  return {
    number,
    // The authored id for now; stampIdentities() swaps in the identity the ledger gives it.
    id: authoredId(b, where),
    revision: null,
    check: checkFor(b, stub, where),
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
    case 'reference':
      return block('reference', str(b, 'content') ?? '', { title: str(b, 'title') ?? 'More' });
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

/** `position` is the day's place in its week (1-5); `d.day` is its number across the course. */
function convertDay(d: SrcDay, position: number, files: Record<string, string>): CourseDay {
  const at = 'week ' + d.week + ' day ' + d.day;
  let exerciseNo = 0;
  const parts = d.sections.map((s): CoursePart => {
    const role = SECTIONS[s.id] ?? fail(at, 'unknown section ' + s.id);
    const blocks: ContentBlock[] = [block('markdown', '# Day ' + d.day + ' · ' + s.title)];
    if (role.part === 1) blocks.push(block('at-a-glance', '**' + d.title + '**\n\n' + atAGlance(d)));
    // The section's intro: blocks before its first lesson, such as a note on where today's files go.
    for (const b of s.intro ?? []) {
      if (b.type === 'exercise') fail(at + ' ' + s.id, 'an exercise in a section intro');
      const converted = convertBlock(b, at + ' ' + s.id + ' intro');
      if (converted) blocks.push(converted);
    }
    const problems: PracticeProblem[] = [];
    for (const lesson of s.lessons) {
      blocks.push(block('markdown', '## ' + lesson.title));
      for (const b of lesson.blocks) {
        const where = at + ' ' + lesson.id;
        if (b.type === 'exercise') {
          exerciseNo++;
          const problem = exercise(b, exerciseNo, where, files);
          problems.push(problem);
          blocks.push(block('problem-ref', String(exerciseNo), { id: problem.id }));
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
  if (d.id !== undefined && !ContentId.safeParse(d.id).success) fail(at, 'the day id "' + String(d.id) + '" is not a valid id');
  return CourseDay.parse({
    schema: 'course-day/v2',
    ...(d.id !== undefined ? { id: d.id } : {}),
    week: d.week,
    day: position,
    number: d.day,
    title: d.title,
    locked: false,
    workspace,
    parts,
  });
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
      demo[file] = lessonFiles[file] ?? fail('day ' + day.number, 'no lesson file for ' + file);
    }
  }

  // What a lesson file imports: './x', '../../utils/x' (x.ts), or a folder '../../fixtures'
  // (fixtures/index.ts). Followed through, so a file an imported file imports comes too.
  const project: Record<string, string> = { ...base };
  const add = (file: string): void => {
    for (const m of lessonFiles[file].matchAll(/from\s+['"](\.\.?\/[\w./-]+)['"]/g)) {
      const at = path.posix.join(path.posix.dirname(file), m[1]);
      const target = [at, at + '.ts', at + '/index.ts'].find((t) => t.endsWith('.ts') && t in lessonFiles);
      if (!target) fail(file, 'imports ' + m[1] + ', which is not a lesson file');
      if (target in project) continue;
      project[target] = lessonFiles[target];
      add(target);
    }
  };
  for (const file of Object.keys(lessonFiles)) add(file);

  return WorkspaceSeeds.parse({ schema: 'workspace-seeds/v1', workspaces: { demo: { files: demo }, project: { files: project } } });
}

// ---------------------------------------------------------------- the course

/** The ids named after --same or --new-identity: repeated, or separated by commas. */
function argIds(name: string): Set<string> {
  const ids = new Set<string>();
  process.argv.forEach((a, i) => {
    if (a === '--' + name) for (const id of (process.argv[i + 1] ?? '').split(',')) if (id.trim()) ids.add(id.trim());
  });
  return ids;
}

/**
 * Gives every exercise its identity from the ledger, and every exercise its revision. Run once every
 * day has been built, because the ledger checks the whole course at once.
 */
function stampIdentities(days: CourseDay[]): { ledger: unknown; added: string[]; changed: string[] } {
  const ledger = fs.existsSync(LEDGER) ? parseLedger(JSON.parse(fs.readFileSync(LEDGER, 'utf-8'))) : EMPTY_LEDGER;
  const exercises: LedgerExercise[] = [];
  for (const d of days) {
    for (const part of d.parts) {
      for (const p of part.problems) {
        if (p.id) exercises.push({ id: p.id, title: p.title, file: p.file, kind: p.kind, where: 'day ' + d.number + ' exercise ' + p.number });
      }
    }
  }
  const checked = checkLedger(ledger, exercises, { same: argIds('same'), newIdentity: argIds('new-identity') });

  const dayIds = new Map<string, number>();
  for (const d of days) {
    const id = dayIdentity(d);
    const other = dayIds.get(id);
    if (other !== undefined) fail('day ' + d.number, 'has the same identity, ' + id + ', as day ' + other);
    dayIds.set(id, d.number);
    const seen = new Set<string>();
    for (const part of d.parts) {
      for (const p of part.problems) {
        if (p.id) p.id = checked.ids.get(p.id) ?? p.id;
        p.revision = problemRevision(p);
        const identity = exerciseIdentity(d.number, p);
        if (seen.has(identity)) fail('day ' + d.number, 'two exercises have the identity ' + identity);
        seen.add(identity);
      }
      for (const b of part.blocks) {
        if (b.type === 'problem-ref' && b.id) b.id = checked.ids.get(b.id) ?? b.id;
      }
    }
  }
  return checked;
}

function main(): void {
  const packages = fs
    .readdirSync(SOURCE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'workspace' && fs.existsSync(path.join(SOURCE, e.name, 'json')))
    .map((e) => e.name)
    .sort();
  if (packages.length === 0) fail('Data/Source', 'no course package (a folder with a json/ folder)');

  const weeks: CourseIndex['weeks'] = [];
  const out: { file: string; day: CourseDay }[] = [];
  let title: string | null = null;
  // Every package's lesson files, keyed by their path in the learner's project.
  const lessonFiles: Record<string, string> = {};
  for (const dir of packages) {
    Object.assign(lessonFiles, readTree(path.join(SOURCE, dir, 'files', 'lessons')));
  }
  // The files an exercise can start from: the lesson files, and those every workspace starts with.
  const known = { ...readTree(path.join(SOURCE, 'workspace'), (rel) => rel === 'README.md'), ...lessonFiles };

  for (const dir of packages) {
    const json = path.join(SOURCE, dir, 'json');
    const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(json, name), 'utf-8')) as T;
    // "Playwright with TypeScript — Fundamentals, Setup & Programming" -> the name before the dash.
    if (!title && fs.existsSync(path.join(json, 'course.json'))) {
      title = read<{ title: string }>('course.json').title.split(/\s+[—–]\s+/)[0];
    }
    const srcWeeks = fs
      .readdirSync(json)
      .filter((n) => /^week\d+\.json$/.test(n))
      .map((n) => read<SrcWeek>(n))
      .sort((a, b) => a.week - b.week);
    const srcDays = fs
      .readdirSync(json)
      .filter((n) => /^day\d+\.json$/.test(n))
      .map((n) => read<SrcDay>(n))
      .sort((a, b) => a.day - b.day);
    if (srcWeeks.length === 0) fail(dir, 'no json/week<n>.json');

    for (const week of srcWeeks) {
      const inWeek = srcDays.filter((d) => d.week === week.week);
      if (inWeek.length === 0) fail(dir, 'week ' + week.week + ' has no days');
      if (inWeek.length > 5) fail(dir, 'week ' + week.week + ' has more than five days');
      const days = inWeek.map((d, i) => convertDay(d, i + 1, known));
      for (const day of days) {
        out.push({ file: path.join(CONTENT, 'weeks', 'week-' + day.week, 'day-' + day.day + '.json'), day });
      }
      weeks.push({
        week: week.week,
        // "Week 1 — Playwright Foundations & Setup" -> the part after the week number.
        theme: week.title.replace(/^Week\s+\d+\s*[—–-]\s*/, ''),
        locked: false,
        days: days.map((d) => ({ day: d.day, number: d.number, title: d.title, locked: d.locked })),
      });
    }
    const orphans = srcDays.filter((d) => !srcWeeks.some((w) => w.week === d.week));
    if (orphans.length) fail(dir, 'day ' + orphans[0].day + ' belongs to week ' + orphans[0].week + ', which has no week file');
  }
  weeks.sort((a, b) => a.week - b.week);

  const identities = stampIdentities(out.map((o) => o.day));
  for (const o of out) o.day = CourseDay.parse(o.day);
  for (const w of weeks) {
    for (const d of w.days) {
      const built = out.find((o) => o.day.week === w.week && o.day.day === d.day)!.day;
      if (built.id) d.id = built.id;
      d.revision = dayRevision(built);
    }
  }
  // The plan is hand-written; checked here, so a broken plan fails the build rather than the page.
  const plan = fs.existsSync(PLAN) ? CoursePlan.parse(JSON.parse(fs.readFileSync(PLAN, 'utf-8'))) : null;

  const days = out.map((o) => o.day);
  const index = CourseIndex.parse({
    schema: 'course-index/v1',
    title: title ?? DEFAULT_TITLE,
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
  if (plan) fs.writeFileSync(path.join(CONTENT, 'course-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  else fs.rmSync(path.join(CONTENT, 'course-plan.json'), { force: true });
  fs.writeFileSync(LEDGER, JSON.stringify(identities.ledger, null, 2) + '\n');
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
  if (identities.added.length) console.log('New exercise ids recorded in Data/Source/published-ids.json: ' + identities.added.length + '.');
  if (identities.changed.length) console.log('Exercise ids whose record changed: ' + identities.changed.join(', ') + '.');
  if (identities.added.length || identities.changed.length) console.log('Commit Data/Source/published-ids.json with the content.');
}

main();
