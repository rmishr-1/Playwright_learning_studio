/**
 * Parses one line typed into the studio's Terminal.
 *
 * The Terminal runs Playwright commands only. A line is never handed to a shell: it is split
 * into words here, every option is checked against the list below, and the test runner is
 * started with those words as an argument array. Anything else gets a message saying what the
 * Terminal can run, rather than an error from a shell the learner cannot see.
 */

export type Parsed =
  | { kind: 'test'; args: string[]; specFile: string }
  | { kind: 'show-report' }
  | { kind: 'help' }
  | { kind: 'refused'; message: string };

/** The file the editor is saved as when the command names none. */
export const DEFAULT_SPEC = 'editor.spec.ts';

/** Options that take no value. */
const FLAGS = new Set(['--list', '--headed', '--quiet', '-q', '--pass-with-no-tests', '--fail-on-flaky-tests']);

/**
 * Options that take a value, written either `--name=value` or `--name value`, each with a check
 * on the value. A value is passed to the runner as one argument, so it cannot become a second
 * command; the checks exist to give a clear message instead of a confusing runner error.
 */
const NUMBER = /^\d{1,4}$/;
const WITH_VALUE: Record<string, (v: string) => boolean> = {
  '--project': (v) => /^[\w.-]{1,40}$/.test(v),
  '--grep': (v) => v.length > 0 && v.length <= 200,
  '-g': (v) => v.length > 0 && v.length <= 200,
  '--grep-invert': (v) => v.length > 0 && v.length <= 200,
  '--workers': (v) => NUMBER.test(v) || /^\d{1,3}%$/.test(v),
  '-j': (v) => NUMBER.test(v),
  '--retries': (v) => NUMBER.test(v),
  '--repeat-each': (v) => NUMBER.test(v),
  '--max-failures': (v) => NUMBER.test(v),
  '--timeout': (v) => /^\d{1,7}$/.test(v),
  '--trace': (v) => ['on', 'off', 'on-first-retry', 'on-all-retries', 'retain-on-failure', 'retain-on-first-failure'].includes(v),
  '--reporter': (v) => ['list', 'line', 'dot', 'html'].includes(v),
};

/** Options a learner may know from the lessons that need a window the studio cannot provide. */
const NOT_HERE: Record<string, string> = {
  '--ui': 'UI mode opens its own application window, so it runs only in your own project.',
  '--debug': 'Debug mode opens the Playwright Inspector, so it runs only in your own project.',
  'codegen': 'Codegen opens its own browser and Inspector windows, so it runs only in your own project.',
  'install': 'The studio already has the browser it needs, so there is nothing to install here.',
};

export const HELP = [
  'This terminal runs Playwright commands on the code in the editor.',
  '',
  '  npx playwright test                    Run the tests in the editor',
  '  npx playwright test tests/login.spec.ts  Save the editor as that file, then run it',
  '  npx playwright test --list             List the tests without running them',
  '  npx playwright test --headed           Run with a visible browser window',
  '  npx playwright test --project=chromium',
  '  npx playwright test -g "wrong password"  Run only the tests whose names match',
  '  npx playwright show-report             Open the report of the last run',
  '  clear                                  Clear the terminal',
  '',
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

const ONLY_PLAYWRIGHT =
  'This terminal runs Playwright commands only, such as npx playwright test. Type help to see them all.';

export function parse(line: string): Parsed {
  const words = tokenize(line.trim());
  if (!words) return { kind: 'refused', message: 'A quote is not closed. Close it, and run the command again.' };
  if (words.length === 1 && words[0] === 'help') return { kind: 'help' };

  // `npx playwright ...`, and also `playwright ...` on its own, which is the same program.
  const rest = words[0] === 'npx' ? words.slice(1) : words;
  if (rest[0] !== 'playwright') return { kind: 'refused', message: ONLY_PLAYWRIGHT };
  const sub = rest[1];
  if (sub === undefined || sub === '--help' || sub === '-h') return { kind: 'help' };
  if (NOT_HERE[sub]) return { kind: 'refused', message: NOT_HERE[sub] };
  if (sub === 'show-report') {
    return rest.length === 2
      ? { kind: 'show-report' }
      : { kind: 'refused', message: 'show-report opens the report of the last run, and takes no options here.' };
  }
  if (sub !== 'test') return { kind: 'refused', message: 'npx playwright ' + sub + ' is not available here. ' + ONLY_PLAYWRIGHT };

  const args: string[] = [];
  let specFile: string | null = null;
  const words2 = rest.slice(2);
  for (let i = 0; i < words2.length; i++) {
    const w = words2[i];
    if (NOT_HERE[w]) return { kind: 'refused', message: NOT_HERE[w] };
    if (FLAGS.has(w)) {
      args.push(w);
      continue;
    }
    if (w.startsWith('-')) {
      const eq = w.indexOf('=');
      const name = eq === -1 ? w : w.slice(0, eq);
      const check = WITH_VALUE[name];
      if (!check) return { kind: 'refused', message: 'The option ' + name + ' is not available here. Type help to see the options you can use.' };
      let value: string | undefined;
      if (eq !== -1) value = w.slice(eq + 1);
      else value = words2[++i];
      if (value === undefined || !check(value)) return { kind: 'refused', message: 'The option ' + name + ' needs a valid value.' };
      args.push(name, value);
      continue;
    }
    // A file name. The first one that ends in .ts becomes the name the editor is saved under,
    // so the commands in the lessons work exactly as written, including the ones that show a
    // wrongly named file being ignored. Anything else is a filter the runner applies itself.
    if (/\.ts$/.test(w)) {
      const m = /^(?:\.\/)?(?:tests\/)?([\w.-]{1,80}\.ts)$/.exec(w);
      if (!m) return { kind: 'refused', message: 'Name a file inside the tests folder, such as tests/login.spec.ts.' };
      if (specFile === null) specFile = m[1];
      args.push('tests/' + m[1]);
      continue;
    }
    if (!/^[\w.\/-]{1,80}$/.test(w)) return { kind: 'refused', message: 'The filter "' + w + '" is not a file or test name the runner can use.' };
    args.push(w);
  }
  return { kind: 'test', args, specFile: specFile ?? DEFAULT_SPEC };
}
