/**
 * Imports the 8-week notebook course into Data/Content/.
 *
 *   npm run import              # uses TRAINING_REPO, or the default path below
 *   TRAINING_REPO=... npm run import
 *
 * The notebooks are the master. Everything this writes under Data/Content/ is generated and must
 * never be hand-edited - EXCEPT the three authored side-cars, which hold what the notebooks do not
 * have and are merged in here so a re-import never erases them (the same reasoning that keeps the
 * portal's bank-comments.json out of bank.json):
 *
 *   solutions/   worked practice answers
 *   variations/  your-turn prompts that replace the generic "retype from memory"
 *   lessons/     the fixed section template - at-a-glance, checkpoints, recap
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  nearestBoilerplate,
  parsePractice,
  parseTeaching,
  parseTitle,
  placeholderBody,
  PLACEHOLDER_TITLE,
  rewriteLinks,
  tabLabel,
  type RawNotebook,
} from './notebook-parse';
import {
  applyDayRefs,
  applyGeneratedPlaceholder,
  applyHeadingFormat,
  applyOverlay,
  applyVariations,
  loadOverlay,
  loadSolutions,
  loadVariations,
} from './lesson-overlay';
import type { CourseDay, CoursePart, PracticeProblem } from '../shared/contracts/course_day';
import type { CourseIndex, IndexWeek } from '../shared/contracts/course_index';
import type { PartNumber } from '../shared/contracts/common';

const DEFAULT_REPO = 'C:/Users/rmishra/POC/Playwright-Typescript-Training';
const TRAINING_REPO = path.resolve(process.env.TRAINING_REPO || DEFAULT_REPO);
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'Data', 'Content');
const SOLUTIONS = path.join(CONTENT, 'solutions');

/** Weeks the learner can open. Everything else imports but stays locked in the UI. */
const AVAILABLE_WEEKS = Number(process.env.AVAILABLE_WEEKS || 2);

const WEEK_THEMES: Record<number, string> = {
  1: 'Why automation, environment setup, the CLI, Codegen, and your first real test',
  2: 'Actions on a form, XPath and CSS, assertions, unique test data, and the sibling axis',
  3: 'Config in depth, hooks, classes, and the page object shape',
  4: 'Data-driven tests, fixtures, and external test data',
  5: 'The Page Object Model, projects, workers and retries',
  6: 'Visual testing, reporting and evidence capture',
  7: 'CI, parallelism and flakiness',
  8: 'API testing and the testing pyramid',
};

/**
 * Week 1 days 1-4 have no _1 notebook: the course had not started its TypeScript-primer
 * convention yet. Rather than show three tabs on those days and four everywhere else, emit a
 * placeholder for the tab.
 *
 * The body is a heading and nothing else - see placeholderBody() in notebook-parse.ts for why,
 * and note that the same function is what `npm run overlay` re-applies, so this function and the
 * shipped tree cannot disagree.
 */
function placeholderPart(week: number, day: number): CoursePart {
  return {
    part: 1,
    kind: 'generated-prerequisite',
    title: PLACEHOLDER_TITLE,
    tab_label: 'TypeScript',
    source_notebook: null,
    has_runnable_code: false,
    blocks: [
      {
        type: 'markdown',
        text: placeholderBody(week, day),
        starter: null,
        variation: null,
        checkpoint: null,
      },
    ],
    problems: [],
  };
}

function readNotebook(file: string): RawNotebook | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawNotebook;
}

function buildPart(
  week: number,
  day: number,
  part: PartNumber,
  nb: RawNotebook,
  notebookPath: string,
): { built: CoursePart; examples: string[] } {
  const title = parseTitle(nb) ?? 'Part ' + part;
  const isPractice = part === 4;
  const parsed = isPractice
    ? parsePractice(nb, week)
    : { ...parseTeaching(nb, week), problems: [] as PracticeProblem[] };

  if (isPractice) {
    const authored = loadSolutions(CONTENT, week, day);
    for (const p of parsed.problems) {
      p.solution = authored[String(p.number)] ?? null;
    }
  }

  const built: CoursePart = {
    part,
    kind: isPractice ? 'practice' : part === 1 ? 'prerequisite' : 'concept',
    title,
    tab_label: tabLabel(part),
    source_notebook: notebookPath,
    // A part with no example blocks and no problem stubs has nothing to run. Week 1 Day 1.2 is
    // 13 markdown cells and zero code; a TypeScript tab with no new language to cover is the same.
    has_runnable_code:
      parsed.blocks.some((b) => b.type === 'example' || b.type === 'your-turn') ||
      parsed.problems.length > 0,
    blocks: parsed.blocks,
    problems: parsed.problems,
  };
  return { built, examples: parsed.examples };
}

function importDay(week: number, day: number): CourseDay | null {
  const parts: CoursePart[] = [];
  let dayTitle = '';
  // Every example seen in parts 1-3, in reading order - part 3's come last, matching "the
  // concept just taught". A practice notebook (_4) almost never has an example of its own to
  // draw from, so its problems borrow from this instead, via nearestBoilerplate().
  const dayExamples: string[] = [];
  let practicePart: CoursePart | null = null;

  for (const part of [1, 2, 3, 4] as PartNumber[]) {
    const rel = 'week' + week + '/day' + day + '_' + part + '.ipynb';
    const nb = readNotebook(path.join(TRAINING_REPO, rel));
    if (!nb) {
      // A missing _1 gets a generated placeholder, so the TypeScript tab is present and
      // honest rather than absent on the four Week 1 days that predate the primer convention.
      if (part === 1) {
        parts.push(placeholderPart(week, day));
        continue;
      }
      // A missing _3 is real: Week 1 Day 1 is theory plus practice, with no second concept
      // notebook. Drop the tab, keep the day. Only a missing _2 means there is no day here.
      if (part === 3) continue;
      if (part === 4) continue;
      return null;
    }
    const { built, examples } = buildPart(week, day, part, nb, rel);
    if (part === 2) dayTitle = built.title;
    if (part !== 4) dayExamples.push(...examples);
    if (part === 4) practicePart = built;
    parts.push(built);
  }

  // Practice problems get the same "never a blank comment" treatment as a your-turn block -
  // the day's own setup, prepended to each stub. Skipped for Reflection problems (a written
  // answer, not code) and when nothing taught that day ever opened a page in a way the harness
  // can replay.
  if (practicePart) {
    const boilerplate = nearestBoilerplate(dayExamples);
    if (boilerplate) {
      for (const p of practicePart.problems) {
        if (p.difficulty === 'Reflection') continue;
        p.stub = boilerplate + '\n\n' + p.stub;
      }
    }
  }

  const built: CourseDay = {
    schema: 'course-day/v1',
    week: week as CourseDay['week'],
    day: day as CourseDay['day'],
    title: dayTitle || 'Day ' + day,
    locked: week > AVAILABLE_WEEKS,
    parts: parts as CourseDay['parts'],
  };

  // Everything the notebooks do not decide, merged through the same functions `npm run overlay`
  // uses - one implementation, so the two paths cannot drift.
  const withPlaceholder = applyDayRefs(applyGeneratedPlaceholder(built));
  const formatted = applyHeadingFormat(
    applyVariations(withPlaceholder, loadVariations(CONTENT, week, day)),
  );
  const overlay = loadOverlay(CONTENT, week, day);
  return overlay ? applyOverlay(formatted, overlay) : formatted;
}

/**
 * The concepts ledger is written for the course AUTHOR, not the learner - it opens with rules
 * for maintaining itself and carries sections like "Outstanding: three committed CI workflows
 * are broken". Only the tables that map a concept to the day that taught it are learner-facing,
 * so only those are imported.
 */
const LEARNER_FACING_SECTIONS = [
  'TypeScript',
  'Playwright',
  'Selectors proven against the live app',
];

type ConceptEntry = { section: string; term: string; link: string; note: string };

function importConcepts(): ConceptEntry[] {
  const file = path.join(TRAINING_REPO, '_shared', 'CONCEPTS.md');
  if (!fs.existsSync(file)) return [];
  // CONCEPTS.md is CRLF. Without this the section name is 'TypeScript\r', matches nothing,
  // and every concept silently drops - which is exactly what happened the first time.
  const lines = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').split('\n');
  const out: ConceptEntry[] = [];
  let section = '';
  let inSection = false;

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      section = h2[1].trim();
      inSection = LEARNER_FACING_SECTIONS.includes(section);
      continue;
    }
    if (!inSection) continue;
    if (!line.trimStart().startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^:?-{2,}:?$/.test(cells[0])) continue; // the table's rule row
    if (/^(Concept|Selector)/i.test(cells[0])) continue; // the header row

    const term = cells[0].replace(/\*\*/g, '').trim();
    if (!term) continue;
    out.push({
      section,
      term,
      link: rewriteLinks(cells[1] ?? '', 1),
      note: rewriteLinks(cells[2] ?? '', 1),
    });
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(TRAINING_REPO)) {
    console.error('Training repo not found: ' + TRAINING_REPO);
    console.error('Set TRAINING_REPO to the Playwright-Typescript-Training checkout.');
    process.exit(1);
  }

  fs.rmSync(path.join(CONTENT, 'weeks'), { recursive: true, force: true });
  fs.mkdirSync(CONTENT, { recursive: true });
  fs.mkdirSync(SOLUTIONS, { recursive: true });

  const weeks: IndexWeek[] = [];
  let totalDays = 0;
  let totalParts = 0;
  let totalProblems = 0;
  let availableDays = 0;

  for (let week = 1; week <= 8; week++) {
    if (!fs.existsSync(path.join(TRAINING_REPO, 'week' + week))) continue;
    const dir = path.join(CONTENT, 'weeks', 'week-' + week);
    fs.mkdirSync(dir, { recursive: true });
    const days: IndexWeek['days'] = [];

    for (let day = 1; day <= 5; day++) {
      const built = importDay(week, day);
      if (!built) continue;
      fs.writeFileSync(
        path.join(dir, 'day-' + day + '.json'),
        JSON.stringify(built, null, 2) + '\n',
      );
      days.push({ day: built.day, title: built.title, locked: built.locked });
      totalDays++;
      totalParts += built.parts.length;
      totalProblems += built.parts.reduce((n, p) => n + p.problems.length, 0);
      if (!built.locked) availableDays++;
    }

    weeks.push({
      week: week as IndexWeek['week'],
      theme: WEEK_THEMES[week] ?? '',
      locked: week > AVAILABLE_WEEKS,
      days,
    });
  }

  const index: CourseIndex = {
    schema: 'course-index/v1',
    title: 'Beginner to Advanced: Playwright Fundamentals',
    imported_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    source_repo: TRAINING_REPO,
    totals: {
      weeks: weeks.length,
      days: totalDays,
      parts: totalParts,
      practice_problems: totalProblems,
      available_days: availableDays,
    },
    weeks,
  };
  fs.writeFileSync(
    path.join(CONTENT, 'course-index.json'),
    JSON.stringify(index, null, 2) + '\n',
  );

  const concepts = importConcepts();
  fs.writeFileSync(
    path.join(CONTENT, 'concepts.json'),
    JSON.stringify({ schema: 'concepts/v1', entries: concepts }, null, 2) + '\n',
  );

  console.log('Imported from ' + TRAINING_REPO);
  console.log(
    '  ' + weeks.length + ' weeks - ' + totalDays + ' days - ' + totalParts + ' parts - ' +
      totalProblems + ' practice problems - ' + concepts.length + ' concept entries',
  );
  console.log('  ' + availableDays + ' days available, ' + (totalDays - availableDays) + ' locked');
}

main();
