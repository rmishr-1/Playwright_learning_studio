/**
 * Executes every snippet Week 1 offers a "Load into editor" button on, through the real runner.
 *
 * A learner only ever presses Run on a fence that actually carries the button, so this filters
 * fences the same way frontend/src/components/Markdown.tsx's isExecutable() does before
 * running them - keep the two in sync. A fence the UI declines to offer (an import/export spec
 * file, a fragment missing `launch()`) is reported separately and not counted as a failure; a
 * fence the UI DOES offer must run clean, or the learner meets a stack trace produced by the
 * course, not by their own mistake.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { startRun } from '../src/runner';
import { prepareRun } from '../src/runner';
import type { CourseDay } from '../../shared/contracts/course_day';

const WEEKS = ['week-1'].map((w) => path.join(__dirname, '../../Data/Content/weeks', w));

type Snippet = { where: string; code: string };

/** Mirrors frontend/src/components/Markdown.tsx's isExecutable(), HARNESS_GLOBALS included. */
const HARNESS_GLOBALS = new Set(['launch', 'show', 'login', 'USERS', 'BASE_URL']);
const HARNESS_IMPORT_LINE = /^import\s+\{([^}]*)\}\s+from\s+["'](?:\.\.\/)*_shared\/deno-helpers(?:\.ts)?["'];?$/;
function isExecutable(code: string): boolean {
  const badImport = code.split('\n').some((line) => {
    if (!/^\s*(import|export)\s/.test(line)) return false;
    const m = HARNESS_IMPORT_LINE.exec(line.trim());
    if (!m) return true;
    const names = m[1].split(',').map((n) => n.trim()).filter(Boolean);
    return names.some((n) => !HARNESS_GLOBALS.has(n));
  });
  if (badImport) return false;
  if (/\b(page|browser)\./.test(code) && !/\blaunch\s*\(/.test(code)) return false;
  if (/\b(test|expect)\s*\(/.test(code)) return false;
  if (/\bDeno\b/.test(code)) return false;
  if (/^\s*\w+\s*:/.test(code)) return false;
  const names = [...code.matchAll(/^\s*(?:const|let)\s+(\w+)\s*=/gm)].map((m) => m[1]);
  if (new Set(names).size !== names.length) return false;
  if (!/[(=;{]/.test(code)) return false;
  return true;
}

/**
 * Every fence in a markdown body, paired with its own language tag. The language must be
 * captured as "any word" and filtered afterwards, not matched against the ts/js whitelist
 * inline - a whitelist-in-pattern approach fails to match a `bash` OPENING fence (its language
 * satisfies neither the whitelist nor the "no language" branch), so the regex falls through to
 * pairing that bash block's CLOSING marker with the next fence's opening instead, corrupting
 * every fence that follows a non-ts/js block in the same document. The real app never hits this:
 * marked.parse() builds one <pre><code class="language-x"> per fence regardless of language, so
 * this only needed fixing here, in the proof, not in the product.
 */
function fences(md: string): string[] {
  return [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)]
    .filter((m) => !m[1] || ['ts', 'js', 'typescript', 'javascript'].includes(m[1]))
    .map((m) => m[2]);
}

function collect(): Snippet[] {
  const out: Snippet[] = [];
  for (const WEEK of WEEKS)
  for (const file of fs.readdirSync(WEEK).filter((f) => f.endsWith('.json')).sort()) {
    const day: CourseDay = JSON.parse(fs.readFileSync(path.join(WEEK, file), 'utf-8'));
    for (const part of day.parts) {
      for (const block of part.blocks) {
        if (block.type === 'example') {
          out.push({ where: `w${day.week}d${day.day}p${part.part} example`, code: block.text });
        } else if (block.type === 'markdown') {
          fences(block.text).forEach((code, i) =>
            out.push({ where: `w${day.week}d${day.day}p${part.part} prose fence ${i + 1}`, code }),
          );
        }
      }
      for (const problem of part.problems ?? []) {
        if (problem.solution) {
          fences(problem.solution).forEach((code, i) =>
            out.push({
              where: `w${day.week}d${day.day} problem ${problem.number} solution fence ${i + 1}`,
              code,
            }),
          );
        }
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const all = collect().filter((s) => s.code.trim().length > 0);
  const skipped = all.filter((s) => !isExecutable(s.code));
  const snippets = all.filter((s) => isExecutable(s.code));
  console.log(
    `${all.length} fences carry a code button; ${skipped.length} are not offered as runnable ` +
      `(spec files, fragments); running the remaining ${snippets.length} through the runner...\n`,
  );

  const bad: { where: string; status: string; detail: string }[] = [];

  for (const s of snippets) {
    const runId = prepareRun();
    const started = startRun({ run_id: runId, week: 1, day: 1, part: 1, code: s.code });
    if ('queue_full' in started) {
      bad.push({ where: s.where, status: 'queue_full', detail: 'runner refused the run' });
      continue;
    }
    const result = await started.done;
    const detail = result.error?.message ?? result.stderr.split('\n')[0] ?? '';
    const mark = result.status === 'ok' ? 'ok  ' : 'FAIL';
    console.log(`${mark} ${s.where}  (${result.status}, ${result.duration_ms}ms) ${detail.slice(0, 110)}`);
    if (result.status !== 'ok') bad.push({ where: s.where, status: result.status, detail });
  }

  console.log(`\n${snippets.length - bad.length}/${snippets.length} runnable fences run clean.`);
  console.log(`${skipped.length} fences correctly show "Run this in your own project" instead of a button:`);
  for (const s of skipped) console.log(`  - ${s.where}`);

  if (bad.length) {
    console.log('\nFailures (these DO show a Run button and should not):');
    for (const b of bad) console.log(`  - ${b.where}  [${b.status}] ${b.detail.slice(0, 160)}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
