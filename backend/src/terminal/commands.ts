/**
 * Parses one line typed into the studio's Terminal.
 *
 * The Terminal runs the commands the course uses, and nothing else:
 *
 *   npx playwright test [files] [options]   in the project folder
 *   npx playwright show-report
 *   node day3/hello.ts                      in ts-basics/, as the TypeScript lessons do
 *   npm run check -- day3/hello.ts          the TypeScript type checker, in ts-basics/
 *   node -v, npm -v, npx playwright --version
 *
 * A line is never handed to a shell: it is split into words here, every option and path is
 * checked, and the program is started with those words as an argument array. Anything else gets a
 * message saying what the Terminal can run, rather than an error from a shell the learner cannot
 * see.
 */

export type Parsed =
  /** `paths` are the files and folders the command names, relative to the project folder. */
  | { kind: 'test'; args: string[]; paths: string[] }
  /** `file` is relative to ts-basics/. */
  | { kind: 'node'; file: string }
  | { kind: 'check'; file: string }
  | { kind: 'version'; program: 'node' | 'npm' | 'playwright' }
  | { kind: 'show-report' }
  | { kind: 'help' }
  | { kind: 'refused'; message: string };

/** The file the editor is saved as when it holds no file of its own and the command names none. */
export const DEFAULT_SPEC = 'tests/editor.spec.ts';

/** Options that take no value. */
const FLAGS = new Set([
  '--list',
  '--headed',
  '--quiet',
  '-q',
  '--pass-with-no-tests',
  '--fail-on-flaky-tests',
  '--last-failed',
  '--only-changed',
  '-x',
]);

/**
 * Options that take a value, written either `--name=value` or `--name value`, each with a check
 * on the value. A value is passed to the runner as one argument, so it cannot become a second
 * command; the checks exist to give a clear message instead of a confusing runner error.
 */
const NUMBER = /^\d{1,4}$/;
/** A whole number up to a limit: enough for any lesson, not enough to exhaust the computer. */
const UP_TO = (max: number) => (v: string): boolean => /^\d{1,4}$/.test(v) && Number(v) <= max;
const TEXT = (v: string): boolean => v.length > 0 && v.length <= 200;
const WITH_VALUE: Record<string, (v: string) => boolean> = {
  '--project': (v) => /^[\w.-]{1,40}$/.test(v),
  '--grep': TEXT,
  '-g': TEXT,
  '--grep-invert': TEXT,
  '--workers': (v) => UP_TO(16)(v) || (/^\d{1,3}%$/.test(v) && Number(v.slice(0, -1)) <= 100),
  '-j': UP_TO(16),
  '--retries': UP_TO(10),
  '--repeat-each': UP_TO(100),
  '--max-failures': (v) => NUMBER.test(v),
  '--timeout': (v) => /^\d{1,7}$/.test(v),
  '--trace': (v) => ['on', 'off', 'on-first-retry', 'on-all-retries', 'retain-on-failure', 'retain-on-first-failure'].includes(v),
  '--reporter': (v) => ['list', 'line', 'dot', 'html'].includes(v),
};

/** Options a learner may know from the lessons that need a window the studio cannot provide. */
const NOT_HERE: Record<string, string> = {
  '--ui': 'UI mode opens its own application window, so it runs only in your own project.',
  '--debug': 'Debug mode opens the Playwright Inspector, so it runs only in your own project.',
  codegen: 'Codegen opens its own browser and Inspector windows, so it runs only in your own project.',
  install: 'The studio already has the browsers it needs, so there is nothing to install here.',
  init: 'The studio already has a project ready for you, so there is nothing to create here.',
};

/** Commands that set up the learner's own computer. The studio's workspace is already set up. */
const SETUP = new Set(['npm', 'mkdir', 'cd', 'code', 'ls', 'dir', 'pwd', 'npx']);
const SETUP_MESSAGE =
  'That command sets up your own computer. The studio already has a project ready, with a ts-basics\n' +
  'folder, so there is nothing to set up here. Type help to see the commands you can run.';

export const HELP = [
  'This terminal runs the commands the course uses, on the files in the editor and in your project.',
  '',
  '  npx playwright test                         Run every test',
  '  npx playwright test tests/day1/auto-wait.spec.ts  Run one file',
  '  npx playwright test --project=chromium      Run in one browser',
  '  npx playwright test --headed                Run with a visible browser window',
  '  npx playwright test --list                  List the tests without running them',
  '  npx playwright test -g "sign in"            Run only the tests whose names match',
  '  npx playwright show-report                  Open the report of the last run',
  '  node day3/hello.ts                          Run a TypeScript file from ts-basics',
  '  npm run check -- day3/hello.ts              Check a TypeScript file for type errors',
  '  node -v, npm -v, npx playwright --version   Show a version',
  '  clear                                       Clear the terminal',
  '',
  'Selecting Run on a lesson saves the editor as that lesson\'s file first.',
  'Press Ctrl+C to stop a command that is running.',
].join('\n');

/** Splits a line into words, honoring single and double quotes. */
export function tokenize(line: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (quote) return null;
  if (has || cur) out.push(cur);
  return out;
}

/** A path under tests/, a file or a folder, with no way to climb out of it. */
function testsPath(w: string): string | null {
  const clean = w.replace(/^\.\//, '').replace(/\/$/, '');
  // No part may start with '-', so a path can never be read as an option.
  if (!/^tests(\/\w[\w.-]*)*$/.test(clean) || clean.split('/').includes('..')) return null;
  return clean;
}

/** A TypeScript file in ts-basics/, written as the lessons write it: `day3/hello.ts`. */
function tsBasicsFile(w: string): string | null {
  const clean = w.replace(/^\.\//, '').replace(/^ts-basics\//, '');
  // No part may start with '-' or '.', so a file name can never be read as an option.
  if (!/^(\w[\w.-]*\/)*\w[\w.-]*\.ts$/.test(clean) || clean.split('/').includes('..')) return null;
  return clean;
}

function parseTest(words: string[]): Parsed {
  const args: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (Object.hasOwn(NOT_HERE, w)) return { kind: 'refused', message: NOT_HERE[w] };
    if (FLAGS.has(w)) {
      args.push(w);
      continue;
    }
    if (w.startsWith('-')) {
      const eq = w.indexOf('=');
      const name = eq === -1 ? w : w.slice(0, eq);
      const check = WITH_VALUE[name];
      if (!check) return { kind: 'refused', message: 'The option ' + name + ' is not available here. Type help to see the options you can use.' };
      const value = eq !== -1 ? w.slice(eq + 1) : words[++i];
      if (value === undefined || !check(value)) return { kind: 'refused', message: 'The option ' + name + ' needs a valid value.' };
      args.push(name, value);
      continue;
    }
    if (w.startsWith('tests') || w.startsWith('./')) {
      const p = testsPath(w);
      if (!p) return { kind: 'refused', message: 'Name a file or folder inside tests, such as tests/day5/login.spec.ts.' };
      paths.push(p);
      args.push(p);
      continue;
    }
    // Anything else is a filter the runner matches against file names, such as `example`.
    if (!/^[\w.-]{1,80}$/.test(w)) return { kind: 'refused', message: 'The filter "' + w + '" is not a file or test name the runner can use.' };
    args.push(w);
  }
  return { kind: 'test', args, paths };
}

export function parse(line: string): Parsed {
  const words = tokenize(line.trim());
  if (!words) return { kind: 'refused', message: 'A quote is not closed. Close it, and run the command again.' };
  if (words.length === 1 && words[0] === 'help') return { kind: 'help' };
  const [first, ...rest] = words;

  if (first === 'node') {
    if (rest.length === 1 && (rest[0] === '-v' || rest[0] === '--version')) return { kind: 'version', program: 'node' };
    // Older Node versions need this flag; the studio's does not, so it is accepted and dropped.
    const files = rest.filter((w) => w !== '--experimental-strip-types');
    const file = files.length === 1 ? tsBasicsFile(files[0]) : null;
    return file
      ? { kind: 'node', file }
      : { kind: 'refused', message: 'Name one TypeScript file in ts-basics, such as: node day3/hello.ts' };
  }

  if (first === 'npm') {
    if (rest.length === 1 && (rest[0] === '-v' || rest[0] === '--version')) return { kind: 'version', program: 'npm' };
    if (rest[0] === 'run' && rest[1] === 'check') {
      const after = rest.slice(2).filter((w) => w !== '--');
      const file = after.length === 1 ? tsBasicsFile(after[0]) : null;
      return file
        ? { kind: 'check', file }
        : { kind: 'refused', message: 'Name one TypeScript file to check, such as: npm run check -- day3/hello.ts' };
    }
    return { kind: 'refused', message: SETUP_MESSAGE };
  }

  // `npx playwright ...`, and also `playwright ...` on its own, which is the same program.
  const pw = first === 'npx' ? rest : words;
  if (pw[0] !== 'playwright') return { kind: 'refused', message: SETUP.has(first) ? SETUP_MESSAGE : 'That command is not available here. Type help to see the commands you can run.' };
  const sub = pw[1];
  if (sub === undefined || sub === '--help' || sub === '-h') return { kind: 'help' };
  if (sub === '--version' || sub === '-V') return { kind: 'version', program: 'playwright' };
  if (Object.hasOwn(NOT_HERE, sub)) return { kind: 'refused', message: NOT_HERE[sub] };
  if (sub === 'show-report') {
    return pw.length === 2
      ? { kind: 'show-report' }
      : { kind: 'refused', message: 'show-report opens the report of the last run, and takes no options here.' };
  }
  if (sub !== 'test') return { kind: 'refused', message: 'npx playwright ' + sub + ' is not available here. Type help to see the commands you can run.' };
  return parseTest(pw.slice(2));
}
