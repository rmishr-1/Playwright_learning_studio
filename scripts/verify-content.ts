/**
 * Runs every lesson file and every exercise solution through the studio's own Terminal, and checks
 * each result against what the course says it should be.
 *
 *   npm run verify:content              every item
 *   npm run verify:content -- day3      only the items whose label contains "day3"
 *
 * It goes through the same code a learner's Run does (backend/src/terminal): the command is parsed,
 * the code is saved as its lesson file in a workspace, and the command runs there. It works in a
 * workspace folder of its own, so it never touches the files a learner has saved.
 *
 * - `node` files must print exactly the output the lesson shows.
 * - `npm run check` must pass, or fail with the lesson's error when the sample fails on purpose.
 * - Playwright tests must pass, or fail when the sample fails on purpose.
 * - A sample that needs the internet is skipped when playwright.dev cannot be reached.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-verify-'));
process.env.STUDIO_WORKSPACE_ROOT = workRoot;

// Imported after the variable is set, because the workspace module reads it when it loads.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prepareRun, attachStream } = require('../backend/src/runner') as typeof import('../backend/src/runner');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startCommand } = require('../backend/src/terminal') as typeof import('../backend/src/terminal');

type Item = {
  label: string;
  code: string;
  file: string;
  run: string;
  expectError: boolean;
  network: boolean;
  expected: string | null;
  workspace: 'demo' | 'project';
};

type SrcBlock = { type: string; [key: string]: unknown };

function collect(): Item[] {
  const items: Item[] = [];
  // Every course package: a folder in Data/Source/ with a json/ folder (workspace/ is not one).
  const source = path.join(ROOT, 'Data', 'Source');
  const packages = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'workspace' && fs.existsSync(path.join(source, e.name, 'json')))
    .map((e) => e.name);
  for (const w of packages) {
    const json = path.join(source, w, 'json');
    const dayFiles = fs.readdirSync(json).filter((n) => /^day\d+\.json$/.test(n));
    dayFiles.sort((a, b) => Number(a.slice(3, -5)) - Number(b.slice(3, -5)));
    for (const f of dayFiles) {
      const day = JSON.parse(fs.readFileSync(path.join(json, f), 'utf-8')) as {
        day: number;
        workspace?: string;
        sections: { lessons: { id: string; blocks: SrcBlock[] }[] }[];
      };
      const workspace = /^pre-loaded/i.test(day.workspace ?? '') ? 'demo' : 'project';
      for (const lesson of day.sections.flatMap((s) => s.lessons)) {
        lesson.blocks.forEach((b, i) => {
          if (b.type === 'code' && typeof b.run === 'string' && typeof b.file === 'string') {
            items.push({
              label: w + ' ' + lesson.id + ' ' + b.file,
              code: b.content as string,
              file: b.file,
              run: b.run,
              expectError: b.expectError === true,
              network: b.network === true,
              expected: typeof b.expectedOutput === 'string' ? b.expectedOutput : nextOutput(lesson.blocks, i),
              workspace,
            });
          }
          // A model answer is run only when it is the whole file. Some answers to a test exercise are
          // notes plus the one line that changes; the app loads those into the editor on their own.
          const wholeFile =
            typeof b.solution === 'string' && (!String(b.file).endsWith('.spec.ts') || /\btest\s*(\.\w+\s*)?\(/.test(b.solution));
          if (b.type === 'exercise' && typeof b.run === 'string' && typeof b.solution === 'string' && typeof b.file === 'string' && wholeFile) {
            items.push({
              label: w + ' ' + String(b.id) + ' solution ' + b.file,
              code: b.solution,
              file: b.file,
              run: b.run,
              expectError: false,
              network: b.network === true,
              expected: typeof b.expectedOutput === 'string' ? b.expectedOutput : null,
              workspace,
            });
          }
        });
      }
    }
  }
  return items;
}

/** The output block after a code block, skipping the terminal block that runs it. */
function nextOutput(blocks: SrcBlock[], i: number): string | null {
  for (let j = i + 1; j < blocks.length && j <= i + 3; j++) {
    if (blocks[j].type === 'output') return blocks[j].content as string;
    if (blocks[j].type === 'code') return null;
  }
  return null;
}

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function execute(item: Item): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const runId = prepareRun();
    let out = '';
    const detach = attachStream(runId, (e) => {
      if (e.event === 'term') out += e.data;
      if (e.event === 'exit') {
        detach();
        resolve({ code: e.code, out: stripAnsi(out).replace(/\r\n/g, '\n') });
      }
    });
    startCommand(runId, item.run, item.code, item.file, item.workspace);
  });
}

/** The program's own output: without the studio's "Saved the editor as" line. */
const programOutput = (out: string): string =>
  out
    .split('\n')
    .filter((l) => !l.startsWith('Saved the editor as '))
    .join('\n')
    .trim();

async function online(): Promise<boolean> {
  try {
    const res = await fetch('https://playwright.dev/', { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const only = process.argv[2];
  const items = collect().filter((i) => !only || i.label.includes(only));
  const net = await online();
  let passed = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const item of items) {
    if (item.network && !net) {
      skipped++;
      console.log('skip  ' + item.label + '  (needs the internet)');
      continue;
    }
    const started = Date.now();
    const { code, out } = await execute(item);
    const got = programOutput(out);
    let problem: string | null = null;

    if (item.run.startsWith('node ')) {
      if (code !== 0 && !item.expectError) problem = 'exited with ' + code;
      else if (item.expected !== null && got !== item.expected.trim()) {
        problem = 'output differs\n--- expected\n' + item.expected.trim() + '\n--- got\n' + got;
      }
    } else if (item.run.startsWith('npm run check')) {
      if (item.expectError) {
        if (code === 0) problem = 'expected a type error, but the check passed';
        else if (item.expected && !got.includes(item.expected.trim())) {
          problem = 'type error differs\n--- expected\n' + item.expected.trim() + '\n--- got\n' + got;
        }
      } else if (code !== 0) problem = 'the check failed\n' + got;
    } else {
      if (item.expectError && code === 0) problem = 'expected the tests to fail, but they passed';
      if (!item.expectError && code !== 0) problem = 'the tests failed\n' + got.split('\n').slice(-25).join('\n');
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1) + 's';
    if (problem) {
      failures.push(item.label + ': ' + problem);
      console.log('FAIL  ' + item.label + '  (' + secs + ')');
    } else {
      passed++;
      console.log('ok    ' + item.label + '  (' + secs + ')');
    }
  }

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed, ' + skipped + ' skipped, of ' + items.length);
  for (const f of failures) console.log('\n' + f);
  fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failures.length ? 1 : 0);
}

void main();
