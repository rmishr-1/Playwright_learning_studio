/**
 * Applies the authored lesson overlays to the already-imported tree.
 *
 *   npm run overlay          # every day that has an overlay
 *   npm run overlay -- 2     # week 2 only
 *
 * `npm run import` already does this as part of a full import, but it needs the training-repo
 * checkout of 147 notebooks. Authoring a lesson overlay does not - the generated days are already
 * committed - so this entry point exists to apply and re-apply overlays on their own. Because
 * applyOverlay() is idempotent the two paths agree: whichever ran last, the day is the same.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyOverlay, applyVariations, loadOverlay, loadVariations } from './lesson-overlay';
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

  for (let week = 1; week <= 8; week++) {
    if (onlyWeek !== null && week !== onlyWeek) continue;
    for (let day = 1; day <= 5; day++) {
      const file = path.join(CONTENT, 'weeks', 'week-' + week, 'day-' + day + '.json');
      if (!fs.existsSync(file)) continue;
      const overlay = loadOverlay(CONTENT, week, day);
      const variations = loadVariations(CONTENT, week, day);
      if (!overlay && Object.keys(variations).length === 0) continue;

      const before = fs.readFileSync(file, 'utf-8');
      // Parsed through the contract on the way in AND out: in, so a side-car is never merged into
      // a day that is already malformed; out, so a merge that produced something invalid fails
      // here rather than in the learner's browser.
      let merged = applyVariations(CourseDay.parse(JSON.parse(before)), variations);
      if (overlay) merged = applyOverlay(merged, overlay);
      const after = JSON.stringify(CourseDay.parse(merged), null, 2) + '\n';

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
      console.log('  w' + week + 'd' + day + ' <- ' + from.join(' + '));
    }
  }

  console.log(
    applied + ' day(s) updated, ' + unchanged + ' already current' +
      (onlyWeek !== null ? ' (week ' + onlyWeek + ' only)' : ''),
  );
}

main();
