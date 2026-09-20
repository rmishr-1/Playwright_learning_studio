/**
 * Import proof - run with `npm run verify` after `npm run import`.
 *
 * Asserts the imported content is structurally sound BEFORE any of it reaches a learner.
 * Every check here exists because the importer got it wrong at least once: the day count,
 * the problem-heading shapes, the CRLF in CONCEPTS.md, and the days that do not have four parts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CourseDay } from '../../shared/contracts/course_day';
import { CourseIndex } from '../../shared/contracts/course_index';
import { findNotebookisms, findUnresolvedLinks } from '../../scripts/notebook-parse';

const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log('  PASS  ' + label);
  } else {
    failures++;
    console.log('  FAIL  ' + label + (detail ? ' - ' + detail : ''));
  }
}

function main(): void {
  const indexFile = path.join(CONTENT, 'course-index.json');
  if (!fs.existsSync(indexFile)) {
    console.error('No course-index.json. Run `npm run import` first.');
    process.exit(1);
  }

  console.log('Course index');
  const index = CourseIndex.parse(JSON.parse(fs.readFileSync(indexFile, 'utf-8')));
  check('index validates against the contract', true);
  check('38 days imported', index.totals.days === 38, 'got ' + index.totals.days);
  check('8 weeks imported', index.totals.weeks === 8, 'got ' + index.totals.weeks);
  check(
    '10 days available (weeks 1-2), 28 locked',
    index.totals.available_days === 10,
    'got ' + index.totals.available_days,
  );

  console.log('\nDays');
  const days: CourseDay[] = [];
  for (const week of index.weeks) {
    for (const d of week.days) {
      const file = path.join(CONTENT, 'weeks', 'week-' + week.week, 'day-' + d.day + '.json');
      days.push(CourseDay.parse(JSON.parse(fs.readFileSync(file, 'utf-8'))));
    }
  }
  check('every day validates against the contract', days.length === 38, 'got ' + days.length);
  check('no day has zero parts', days.every((d) => d.parts.length > 0));
  check('no day has an empty title', days.every((d) => d.title.trim().length > 0));
  check(
    'every part has at least one block or problem',
    days.every((d) => d.parts.every((p) => p.blocks.length > 0 || p.problems.length > 0)),
  );

  // Week 1 Day 1 has no _3 notebook - the one day that is not four parts.
  const w1d1 = days.find((d) => d.week === 1 && d.day === 1)!;
  check(
    'Week 1 Day 1 has 3 parts (no _3 notebook exists)',
    w1d1.parts.length === 3,
    'got ' + w1d1.parts.length,
  );
  check(
    'every other day has 4 parts',
    days.filter((d) => !(d.week === 1 && d.day === 1)).every((d) => d.parts.length === 4),
  );

  console.log('\nWeek 1 generated placeholders');
  const placeholders = days
    .filter((d) => d.week === 1 && d.day <= 4)
    .map((d) => d.parts.find((p) => p.part === 1));
  check(
    'Week 1 days 1-4 carry a generated prerequisite part',
    placeholders.every((p) => p?.kind === 'generated-prerequisite'),
  );
  check(
    'Week 1 day 5 has a real prerequisite notebook',
    days.find((d) => d.week === 1 && d.day === 5)!.parts[0].kind === 'prerequisite',
  );

  console.log('\nPractice');
  const inScope = days.filter((d) => !d.locked);
  check(
    'every available day has practice problems',
    inScope.every((d) => d.parts.some((p) => p.problems.length > 0)),
  );
  check(
    'every available day has exactly 3 problems',
    inScope.every((d) => d.parts.reduce((n, p) => n + p.problems.length, 0) === 3),
    inScope
      .filter((d) => d.parts.reduce((n, p) => n + p.problems.length, 0) !== 3)
      .map((d) => 'w' + d.week + 'd' + d.day)
      .join(' '),
  );
  check(
    'every available problem has an authored solution',
    inScope.every((d) => d.parts.every((p) => p.problems.every((q) => q.solution !== null))),
    inScope
      .flatMap((d) =>
        d.parts.flatMap((p) =>
          p.problems.filter((q) => q.solution === null).map((q) => 'w' + d.week + 'd' + d.day + ' P' + q.number),
        ),
      )
      .join(' '),
  );
  check(
    'locked weeks have no solutions yet, so no reveal button can disappoint',
    days.filter((d) => d.locked).every((d) => d.parts.every((p) => p.problems.every((q) => q.solution === null))),
  );
  check(
    'every problem carries a statement',
    days.every((d) => d.parts.every((p) => p.problems.every((q) => q.statement.trim().length > 0))),
  );

  // Document order. Rendering every paragraph before every problem put the practice
  // notebook's closing "When you are done" note above Problem 1.
  const misplaced: string[] = [];
  for (const d of days) {
    for (const p of d.parts) {
      if (p.problems.length === 0) continue;
      const refs = p.blocks.filter((b) => b.type === 'problem-ref').map((b) => b.text);
      for (const q of p.problems) {
        if (!refs.includes(String(q.number))) {
          misplaced.push('w' + d.week + 'd' + d.day + ' P' + q.number + ' has no position');
        }
      }
      const numeric = refs.map(Number);
      if (numeric.some((n, i) => i > 0 && n < numeric[i - 1])) {
        misplaced.push('w' + d.week + 'd' + d.day + ' problems out of order');
      }
    }
  }
  check(
    'every problem is positioned in document order',
    misplaced.length === 0,
    misplaced.slice(0, 5).join(' | '),
  );

  console.log('\nLinks');
  const unresolved: string[] = [];
  for (const d of days) {
    for (const p of d.parts) {
      for (const b of p.blocks) {
        if (b.type === 'markdown') unresolved.push(...findUnresolvedLinks(b.text));
      }
      for (const q of p.problems) unresolved.push(...findUnresolvedLinks(q.statement));
    }
  }
  check(
    'no .ipynb link survives the rewrite',
    unresolved.length === 0,
    unresolved.slice(0, 5).join(' '),
  );

  // The href rewrite alone is not enough: link LABELS and prose still said ".ipynb" and
  // "Kernel must say Deno", which instructs the learner to do something impossible here.
  const notebookisms: string[] = [];
  for (const d of days.filter((x) => !x.locked)) {
    for (const p of d.parts) {
      for (const b of p.blocks) {
        if (b.type === 'markdown') {
          for (const n of findNotebookisms(b.text)) {
            notebookisms.push('w' + d.week + 'd' + d.day + 'p' + p.part + ': ' + n);
          }
        }
      }
      for (const q of p.problems) {
        for (const n of findNotebookisms(q.statement)) {
          notebookisms.push('w' + d.week + 'd' + d.day + ' problem ' + q.number + ': ' + n);
        }
      }
    }
  }
  check(
    'no notebook-only wording reaches an available day',
    notebookisms.length === 0,
    notebookisms.slice(0, 6).join(' | '),
  );

  console.log('\nConcepts');
  const concepts = JSON.parse(
    fs.readFileSync(path.join(CONTENT, 'concepts.json'), 'utf-8'),
  ) as { entries: { term: string; section: string; link: string }[] };
  check('concepts imported', concepts.entries.length > 100, 'got ' + concepts.entries.length);
  check(
    'no authoring-only section leaked in',
    concepts.entries.every((e) => !/^Outstanding|^Toolchain|^Third-party|^API endpoints/.test(e.section)),
  );
  check(
    'no concept link still points at a notebook file',
    concepts.entries.every((e) => !e.link.includes('.ipynb')),
  );

  console.log(
    '\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.'),
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
