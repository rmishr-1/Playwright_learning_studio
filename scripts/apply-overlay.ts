/**
 * Brings the already-imported tree back in line with everything the notebooks do not decide: the
 * authored side-cars, and the fields the importer derives by rule.
 *
 *   npm run overlay          # every day
 *   npm run overlay -- 2     # week 2 only
 *
 * `npm run import` does all of this too, but it needs the training-repo checkout of 147 notebooks.
 * Authoring a lesson, or changing a rule like the tab label, does not - the generated days are
 * already committed - so this entry point exists to apply that work on its own, and launcher.bat
 * runs it on every start. Every step is idempotent, so the two paths agree: whichever ran last,
 * the day is the same.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyDayRefs,
  applyDerivedLabels,
  applyGeneratedPlaceholder,
  applyHeadingFormat,
  applyStudioCopy,
  applyOverlay,
  applyRemovedParts,
  applyRewrites,
  applySolutions,
  applyVariations,
  loadOverlay,
  loadRewrites,
  loadSolutions,
  loadVariations,
} from './lesson-overlay';
import { CourseDay } from '../shared/contracts/course_day';

const CONTENT = path.resolve(__dirname, '..', 'Data', 'Content');

function main(): void {
  const onlyWeek = process.argv[2] ? Number(process.argv[2]) : null;
  if (onlyWeek !== null && !Number.isInteger(onlyWeek)) {
    console.error('Usage: npm run overlay [-- <week>]');
    process.exit(1);
  }

  let applied = 0;
  let unchanged = 0;
  // Day titles, for the course index below. A rewrite of a Fundamentals part retitles its day,
  // and the week menu reads the index, not the day file.
  const titles = new Map<string, string>();

  for (let week = 1; week <= 8; week++) {
    if (onlyWeek !== null && week !== onlyWeek) continue;
    for (let day = 1; day <= 5; day++) {
      const file = path.join(CONTENT, 'weeks', 'week-' + week, 'day-' + day + '.json');
      if (!fs.existsSync(file)) continue;
      const overlay = loadOverlay(CONTENT, week, day);
      const variations = loadVariations(CONTENT, week, day);

      const before = fs.readFileSync(file, 'utf-8');
      // Parsed through the contract on the way in AND out: in, so a side-car is never merged into
      // a day that is already malformed; out, so a merge that produced something invalid fails
      // here rather than in the learner's browser.
      let merged = applyRemovedParts(applyDerivedLabels(CourseDay.parse(JSON.parse(before))));
      // Before applyHeadingFormat: this writes a raw heading, which that rule then normalises.
      merged = applyGeneratedPlaceholder(merged);
      merged = applyHeadingFormat(merged);
      merged = applyStudioCopy(merged);
      // After applyStudioCopy, which can emit a link label of its own.
      merged = applyDayRefs(merged);
      merged = applySolutions(merged, loadSolutions(CONTENT, week, day));
      merged = applyVariations(merged, variations);
      // After applyVariations, so a rewritten lesson's own your-turn prompts are the ones that ship;
      // before applyOverlay, because the cards are placed relative to the body.
      merged = applyRewrites(merged, loadRewrites(CONTENT, week, day));
      if (overlay) merged = applyOverlay(merged, overlay);
      const after = JSON.stringify(CourseDay.parse(merged), null, 2) + '\n';
      titles.set(week + '/' + day, merged.title);

      if (after === before) {
        unchanged++;
        continue;
      }
      fs.writeFileSync(file, after);
      applied++;
      const from = [
        overlay ? 'lessons' : null,
        Object.keys(variations).length > 0 ? 'variations' : null,
      ].filter(Boolean);
      // A day with no side-car can still change here, when a derived rule did.
      console.log('  w' + week + 'd' + day + ' <- ' + (from.length ? from.join(' + ') : 'derived fields'));
    }
  }

  console.log(
    applied + ' day(s) updated, ' + unchanged + ' already current' +
      (onlyWeek !== null ? ' (week ' + onlyWeek + ' only)' : ''),
  );

  // The importer writes the index from the day titles it built; keep it in step with the titles
  // the rewrites now decide, so the two paths agree.
  const indexFile = path.join(CONTENT, 'course-index.json');
  const before = fs.readFileSync(indexFile, 'utf-8');
  const index = JSON.parse(before) as { weeks: { week: number; days: { day: number; title: string }[] }[] };
  for (const w of index.weeks) {
    for (const d of w.days) d.title = titles.get(w.week + '/' + d.day) ?? d.title;
  }
  const after = JSON.stringify(index, null, 2) + '\n';
  if (after !== before) {
    fs.writeFileSync(indexFile, after);
    console.log('course-index.json <- day titles');
  }
}

main();
