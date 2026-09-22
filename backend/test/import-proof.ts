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
import { findNotebookisms, findSupersededCopy, findUnresolvedLinks } from '../../scripts/notebook-parse';
import { applyHeadingFormat, ROLE_HEADING_WEEKS } from '../../scripts/lesson-overlay';
import { ERROR_RULES, lintExplanationShape, lintProse, type Finding } from './style-rules';

const CONTENT = path.resolve(__dirname, '..', '..', 'Data', 'Content');

let failures = 0;
let warnings = 0;

/** Advisory only. A warning names something a human should look at, never something that is
 *  categorically wrong - so it prints and moves on rather than failing the build. */
function warn(label: string, detail: string): void {
  warnings++;
  console.log('  WARN  ' + label + (detail ? ' - ' + detail : ''));
}

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
  // The generated part carries a heading and nothing else. Its body was reworded three times
  // before it was removed altogether, each rewording adding a LEGACY_COPY entry to carry the old
  // text forward; this check is what those entries were standing in for. The authored at-a-glance
  // directly beneath it already says what is new today, when the language lessons start and where
  // to go next, so generated prose repeating that in sentences is what must not come back.
  const notBare = days
    .filter((d) => d.parts.some((p) => p.kind === 'generated-prerequisite'))
    .flatMap((d) =>
      d.parts
        .filter((p) => p.kind === 'generated-prerequisite')
        .flatMap((p) =>
          p.blocks[0]?.type === 'markdown' && /^#[^\n]*\n*$/.test(p.blocks[0].text)
            ? []
            : ['w' + d.week + 'd' + d.day + 'p' + p.part],
        ),
    );
  check(
    'the generated TypeScript part is its heading and nothing else',
    notBare.length === 0,
    notBare.join(' | '),
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

  // Tab labels name the part's role, so they come from the part number alone. They used to be a
  // truncated copy of the part's own title, which restated the H1 below it and clipped mid-word.
  const ROLE_LABEL: Record<number, string> = {
    1: 'TypeScript',
    2: 'Fundamentals',
    3: 'Implementation',
    4: 'Practice',
  };
  const mislabelled = days.flatMap((d) =>
    d.parts
      .filter((p) => p.tab_label !== ROLE_LABEL[p.part])
      .map((p) => 'w' + d.week + 'd' + d.day + 'p' + p.part + ' = ' + JSON.stringify(p.tab_label)),
  );
  check(
    'every tab is labelled for its role, on every day',
    mislabelled.length === 0,
    mislabelled.slice(0, 5).join(' | '),
  );

  // Page headings are standardised on "Week N - Day D - <Tab>", with whatever the heading said
  // about the lesson kept after a further " - ". Placeholder headings ("TypeScript check-in:
  // nothing new today") keep only the prefix. Both open weeks, since a rule that applies to one
  // week is not a rule.
  const roleWeeks = [...ROLE_HEADING_WEEKS].sort((a, b) => a - b);
  const HEADING = new RegExp(
    '^# Week (?:' + roleWeeks.join('|') + ') - Day [1-5] - ' +
      '(?:TypeScript|Fundamentals|Implementation|Practice)(?: - \\S.*)?$',
  );
  const badHeadings: string[] = [];
  for (const d of days.filter((x) => ROLE_HEADING_WEEKS.has(x.week))) {
    for (const p of d.parts) {
      // Both halves trim: the block test used to trimStart while the line search did not, so a
      // block with leading whitespace was reported as having no heading at all.
      const opening = p.blocks.find((b) => b.type === 'markdown' && b.text.trimStart().startsWith('# '));
      const line = opening?.text.split('\n').map((l) => l.trim()).find((l) => l.startsWith('# '));
      if (!line) {
        badHeadings.push('w' + d.week + 'd' + d.day + 'p' + p.part + ' has no heading');
      } else if (!HEADING.test(line)) {
        badHeadings.push('w' + d.week + 'd' + d.day + 'p' + p.part + ': ' + line);
      }
    }
  }
  check(
    'every heading in an open week follows "Week N - Day D - <Tab>"',
    badHeadings.length === 0,
    badHeadings.slice(0, 4).join(' | '),
  );

  // The separator is the point of the rule, so assert it directly rather than trusting the shape
  // regex above to imply it. A comma left in the PREFIX means a heading the transform did not
  // reach; a comma in the SUBJECT is ordinary prose and must survive untouched, which is why this
  // only inspects the text up to the tab name.
  const commaPrefixes = days
    .filter((x) => ROLE_HEADING_WEEKS.has(x.week))
    .flatMap((d) =>
      d.parts.flatMap((p) => {
        const line = p.blocks
          .find((b) => b.type === 'markdown' && b.text.trimStart().startsWith('# '))
          ?.text.split('\n')
          .find((l) => l.startsWith('# '));
        const prefix = line?.split(/ - (?!.* - )/)[0] ?? line ?? '';
        const upToTab = line?.match(/^# .*?(TypeScript|Fundamentals|Implementation|Practice)/)?.[0] ?? prefix;
        return upToTab.includes(',') ? ['w' + d.week + 'd' + d.day + 'p' + p.part + ': ' + line] : [];
      }),
    );
  check(
    'no heading prefix still separates with a comma',
    commaPrefixes.length === 0,
    commaPrefixes.slice(0, 4).join(' | '),
  );

  // The transform runs on every `npm run overlay`, which launcher.bat runs at startup - so if it
  // is not idempotent the headings drift a little further every time anyone opens the app, and the
  // drift gets committed by the next push. The committed tree being a FIXED POINT is the strongest
  // cheap statement of that: f(committed) === committed implies f(f(raw)) === f(raw), and it also
  // catches the other failure mode, which is that somebody changed the rule and never re-ran the
  // overlay. That is the gap findSupersededCopy closes for prose and nothing closed for headings.
  const notFixed = days.flatMap((d) =>
    JSON.stringify(applyHeadingFormat(d)) === JSON.stringify(d) ? [] : ['w' + d.week + 'd' + d.day],
  );
  check(
    'the committed tree is a fixed point of the heading rule',
    notFixed.length === 0,
    notFixed.slice(0, 5).join(' | '),
  );

  // "TypeScript - TypeScript for building a unique value" reads as a stutter, and there are two
  // independent ways to produce one: a generated placeholder whose subject repeats the tab, and a
  // real primer that happens to open with the tab's own name. One pattern catches both.
  const STUTTER = /^# Week \d+ - Day \d+ - (TypeScript|Fundamentals|Implementation|Practice) - \1\b/i;
  const stutters = days
    .filter((x) => ROLE_HEADING_WEEKS.has(x.week))
    .flatMap((d) =>
      d.parts.flatMap((p) => {
        const line = p.blocks[0]?.text.split('\n').find((l) => l.startsWith('# ')) ?? '';
        return STUTTER.test(line) ? ['w' + d.week + 'd' + d.day + 'p' + p.part + ': ' + line] : [];
      }),
    );
  check('no heading repeats its own tab name', stutters.length === 0, stutters.slice(0, 4).join(' | '));

  // An at-a-glance is placed relative to block 0 being the H1. That holds throughout weeks 1-2,
  // but w3d1p2's H1 sits at block 1 - so when week 3 joins the rule, the card would be inserted
  // ABOVE the heading and the existing "at <= 1" check would still pass. Fail here first.
  const headingNotFirst = days
    .filter((x) => ROLE_HEADING_WEEKS.has(x.week))
    .flatMap((d) =>
      d.parts.flatMap((p) =>
        p.blocks[0]?.type === 'markdown' && p.blocks[0].text.trimStart().startsWith('# ')
          ? []
          : ['w' + d.week + 'd' + d.day + 'p' + p.part],
      ),
    );
  check(
    'every part in an open week opens on its heading',
    headingNotFirst.length === 0,
    headingNotFirst.slice(0, 4).join(' | '),
  );

  // The rule must not throw away a real primer just because it sits on a TypeScript tab. Three of
  // them exist across the open weeks, and each would be destroyed by a rule that keyed off the tab
  // rather than off what the heading actually says.
  const primers: ReadonlyArray<readonly [number, number, string]> = [
    [1, 5, 'Arrow functions'],
    [2, 2, 'how TypeScript decides'],
    [2, 3, 'Building a unique value'],
  ];
  const lostPrimers = primers.flatMap(([week, day, subject]) => {
    const p1 = days.find((d) => d.week === week && d.day === day)?.parts.find((p) => p.part === 1);
    return p1?.blocks[0].text.includes(subject) ? [] : ['w' + week + 'd' + day + 'p1 lost "' + subject + '"'];
  });
  check(
    'a real primer keeps its subject, on every TypeScript tab that has one',
    lostPrimers.length === 0,
    lostPrimers.join(' | '),
  );

  // The authored lesson overlays. Weeks 1 and 2 are the authored weeks; 3-8 have no overlay
  // yet, and the checks below are written so that stays a difference in coverage, not a failure.
  console.log('\nLesson overlays');
  const AUTHORED_WEEKS = [1, 2];
  const authored = days.filter((d) => AUTHORED_WEEKS.includes(d.week));
  const authoredParts = authored.flatMap((d) => d.parts.map((p) => ({ d, p })));
  const countOf = (p: CourseDay['parts'][number], t: string) =>
    p.blocks.filter((b) => b.type === t).length;

  check(
    'every authored part opens with an at-a-glance or already had its own summary',
    authoredParts.every(({ p }) => countOf(p, 'at-a-glance') === 1 || countOf(p, 'checkpoint') > 0),
    authoredParts
      .filter(({ p }) => countOf(p, 'at-a-glance') !== 1 && countOf(p, 'checkpoint') === 0)
      .map(({ d, p }) => 'w' + d.week + 'd' + d.day + 'p' + p.part)
      .join(' '),
  );
  check(
    'no part carries more than one at-a-glance or recap - re-applying an overlay must not stack',
    authoredParts.every(({ p }) => countOf(p, 'at-a-glance') <= 1 && countOf(p, 'recap') <= 1),
    authoredParts
      .filter(({ p }) => countOf(p, 'at-a-glance') > 1 || countOf(p, 'recap') > 1)
      .map(({ d, p }) => 'w' + d.week + 'd' + d.day + 'p' + p.part)
      .join(' '),
  );
  check(
    'every authored concept part has retrieval checkpoints',
    authoredParts.filter(({ p }) => p.kind === 'concept').every(({ p }) => countOf(p, 'checkpoint') >= 2),
    authoredParts
      .filter(({ p }) => p.kind === 'concept' && countOf(p, 'checkpoint') < 2)
      .map(({ d, p }) => 'w' + d.week + 'd' + d.day + 'p' + p.part)
      .join(' '),
  );

  // An at-a-glance below the fold is not at a glance.
  check(
    'an at-a-glance sits directly after the part heading',
    authoredParts.every(({ p }) => {
      const at = p.blocks.findIndex((b) => b.type === 'at-a-glance');
      return at === -1 || at <= 1;
    }),
  );
  // The closing sections belong before the pointer to the next lesson, not after it.
  check(
    'checkpoints and recap come before any "What\'s next"',
    authoredParts.every(({ p }) => {
      const next = p.blocks.findIndex((b) => b.type === 'markdown' && /^##\s+What's next/im.test(b.text));
      if (next === -1) return true;
      return p.blocks.every((b, i) => !(i > next && (b.type === 'checkpoint' || b.type === 'recap')));
    }),
    authoredParts
      .filter(({ p }) => {
        const next = p.blocks.findIndex((b) => b.type === 'markdown' && /^##\s+What's next/im.test(b.text));
        return next !== -1 && p.blocks.some((b, i) => i > next && (b.type === 'checkpoint' || b.type === 'recap'));
      })
      .map(({ d, p }) => 'w' + d.week + 'd' + d.day + 'p' + p.part)
      .join(' '),
  );

  const badCheckpoints: string[] = [];
  for (const d of days) {
    for (const p of d.parts) {
      for (const b of p.blocks) {
        const where = 'w' + d.week + 'd' + d.day + 'p' + p.part;
        if (b.type === 'checkpoint') {
          if (!b.checkpoint) badCheckpoints.push(where + ': checkpoint block with no payload');
          else if (b.checkpoint.answer >= b.checkpoint.options.length) {
            badCheckpoints.push(where + ': answer index out of range');
          } else if (!b.text.trim()) badCheckpoints.push(where + ': checkpoint with no question');
        } else if (b.checkpoint) {
          badCheckpoints.push(where + ': ' + b.type + ' block carries a checkpoint payload');
        }
      }
    }
  }
  check('every checkpoint is answerable', badCheckpoints.length === 0, badCheckpoints.slice(0, 5).join(' | '));

  // The defect this whole pass existed to fix: week 2's your-turn blocks were all the same
  // "retype the example above from memory" string, which is a prompt for nobody in particular.
  const filler = authoredParts.flatMap(({ d, p }) =>
    p.blocks
      .filter((b) => b.type === 'your-turn' && !b.variation)
      .map(() => 'w' + d.week + 'd' + d.day + 'p' + p.part),
  );
  check(
    'no authored your-turn is left on the generic prompt',
    filler.length === 0,
    filler.length + ' without a variation: ' + [...new Set(filler)].join(' '),
  );

  // Voice and style - the mechanical half of docs/PLAYBOOK.md.
  //
  // These lint the text this project AUTHORS. Lesson bodies are generated from notebooks that are
  // not in this checkout, so linting them would fail on text nobody here can edit and would leave
  // `npm run verify` permanently red. The rules, and their limits, are in docs/PLAYBOOK.md.
  console.log('\nVoice and style');
  const findings: Finding[] = [];
  const authoredFiles = (dir: string): string[] => {
    const d = path.join(CONTENT, dir);
    return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort() : [];
  };

  for (const file of authoredFiles('lessons')) {
    const raw = JSON.parse(fs.readFileSync(path.join(CONTENT, 'lessons', file), 'utf-8')) as {
      parts: Record<string, {
        at_a_glance?: string;
        recap?: string;
        checkpoints?: { question: string; options: string[]; explanation: string }[];
      }>;
    };
    for (const [partNo, part] of Object.entries(raw.parts)) {
      const at = 'lessons/' + file + ' p' + partNo;
      if (part.at_a_glance) findings.push(...lintProse(part.at_a_glance, at + ' at_a_glance'));
      if (part.recap) findings.push(...lintProse(part.recap, at + ' recap'));
      (part.checkpoints ?? []).forEach((c, i) => {
        const cp = at + ' checkpoint ' + (i + 1);
        findings.push(...lintProse(c.question, cp + ' question'));
        c.options.forEach((o, j) => findings.push(...lintProse(o, cp + ' option ' + (j + 1))));
        findings.push(...lintProse(c.explanation, cp + ' explanation'));
        findings.push(...lintExplanationShape(c.explanation, cp + ' explanation'));
      });
    }
  }
  for (const file of authoredFiles('variations')) {
    const raw = JSON.parse(fs.readFileSync(path.join(CONTENT, 'variations', file), 'utf-8')) as Record<string, string>;
    for (const [key, text] of Object.entries(raw)) {
      findings.push(...lintProse(text, 'variations/' + file + ' ' + key));
    }
  }
  for (const file of authoredFiles('solutions')) {
    const raw = JSON.parse(fs.readFileSync(path.join(CONTENT, 'solutions', file), 'utf-8')) as Record<string, string>;
    for (const [key, text] of Object.entries(raw)) {
      findings.push(...lintProse(text, 'solutions/' + file + ' problem ' + key));
    }
  }

  // EVERY error-severity finding fails the build, whatever its rule is called. This used to loop
  // over a hard-coded list of rule names, so a rule added to style-rules.ts but not to that list
  // was computed and then silently dropped - which is exactly what happened to defines-by-absence,
  // announced as enforced while 11 violations passed. The list below is for reporting only: every
  // known rule gets a PASS line so the output shows what was checked, and any rule not on it is
  // still reported and still fails.
  const errors = findings.filter((f) => f.severity === 'error');
  const errorRules = [...new Set([...ERROR_RULES, ...errors.map((f) => f.rule)])];
  for (const rule of errorRules) {
    const hits = errors.filter((f) => f.rule === rule);
    check(
      'authored text passes: ' + rule,
      hits.length === 0,
      hits.length + ' hit(s): ' + hits.slice(0, 3).map((f) => f.where + ' ' + f.detail).join(' | '),
    );
  }

  // Warnings are advisory, so they are summarised by rule rather than listed in full: the counts
  // are the useful signal, and a wall of individual warnings trains people to scroll past them.
  const warns = findings.filter((x) => x.severity === 'warn');
  const warnRules = [...new Set(warns.map((f) => f.rule))].sort();
  for (const rule of warnRules) {
    const hits = warns.filter((f) => f.rule === rule);
    warn(rule, hits.length + ' hit(s), e.g. ' + hits[0].where + ' ' + hits[0].detail);
  }

  // Closes the loop: the text linted above is the text a learner sees. An overlay-typed block in a
  // day file must be byte-identical to the authored string it came from, which also catches anyone
  // hand-editing the generated tree.
  const drifted: string[] = [];
  for (const d of days) {
    const file = path.join(CONTENT, 'lessons', 'w' + d.week + 'd' + d.day + '.json');
    if (!fs.existsSync(file)) continue;
    const src = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      parts: Record<string, { at_a_glance?: string; recap?: string; checkpoints?: { question: string }[] }>;
    };
    for (const p of d.parts) {
      const authoredPart = src.parts[String(p.part)];
      if (!authoredPart) continue;
      const shipped = (t: string) => p.blocks.filter((b) => b.type === t).map((b) => b.text);
      const at = 'w' + d.week + 'd' + d.day + 'p' + p.part;
      if (authoredPart.at_a_glance && shipped('at-a-glance')[0] !== authoredPart.at_a_glance) {
        drifted.push(at + ' at-a-glance');
      }
      if (authoredPart.recap && shipped('recap')[0] !== authoredPart.recap) drifted.push(at + ' recap');
      const qs = shipped('checkpoint');
      (authoredPart.checkpoints ?? []).forEach((c, i) => {
        if (qs[i] !== c.question) drifted.push(at + ' checkpoint ' + (i + 1));
      });
    }
  }
  check('every shipped card matches its authored source', drifted.length === 0, drifted.slice(0, 4).join(' | '));

  // The script-level rewrites only run on import or `npm run overlay`. A day file that still
  // carries the superseded wording is a day nobody re-ran the overlay over - which is how "This
  // day introduces no new TypeScript" survived its own rewrite and stayed on the first screen of
  // the course. AVAILABLE days only: locked weeks are revised before they open.
  const superseded: string[] = [];
  for (const d of days.filter((x) => !x.locked)) {
    for (const p of d.parts) {
      for (const b of p.blocks) {
        for (const c of findSupersededCopy(b.text)) {
          superseded.push('w' + d.week + 'd' + d.day + 'p' + p.part + ': ' + c);
        }
      }
    }
  }
  check(
    'no shipped day still carries copy a script has already replaced',
    superseded.length === 0,
    superseded.slice(0, 4).join(' | '),
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
    '\n' + (failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.') +
      (warnings > 0 ? '  (' + warnings + ' advisory warning(s))' : ''),
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
