/**
 * "Check my answer" on a code exercise.
 *
 * The check comes from the course (the exercise's `check`), never from the browser, so a learner
 * cannot mark their own answer as correct. The learner's code is saved as the exercise's file and
 * the check's command runs in the Terminal's workspace, through the same code a Run uses
 * (terminal/index.ts), with the same limits: one command at a time, and a time limit.
 */
import { attachStream, prepareRun, retireStream } from './runner';
import { startCommand } from './terminal';
import type { CheckRequest, CheckResult } from '../../shared/contracts/check';
import type { PracticeProblem } from '../../shared/contracts/course_day';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

/** What the command printed, without the Terminal's own note about where it saved the editor. */
const programOutput = (out: string): string =>
  stripAnsi(out)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.startsWith('Saved the editor as '))
    .join('\n')
    .trim();

/** What a check keeps of a command's output: its end, where the summary and the verdict are. */
const MAX_CHECK_OUTPUT = 2_000_000;

/** The last lines of a long output: where a test runner puts its summary and the first failure. */
const tail = (s: string, lines = 40): string => s.split('\n').slice(-lines).join('\n');

function run(command: string, code: string, file: string, req: CheckRequest): Promise<{ exit: number | null; out: string }> {
  return new Promise((resolve) => {
    const runId = prepareRun();
    let out = '';
    const detach = attachStream(runId, (e) => {
      if (e.event === 'term') {
        out += e.data;
        if (out.length > MAX_CHECK_OUTPUT) out = out.slice(-MAX_CHECK_OUTPUT / 2);
      }
      if (e.event === 'exit') {
        detach();
        resolve({ exit: e.code, out });
      }
    });
    try {
      startCommand(runId, command, code, file, req.workspace);
    } catch (e) {
      detach();
      retireStream(runId, 0);
      throw e;
    }
  });
}

export async function checkAnswer(problem: PracticeProblem, req: CheckRequest): Promise<CheckResult> {
  const check = problem.check!;
  const { exit, out } = await run(check.run, req.code, problem.file!, req);
  const printed = programOutput(out);

  if (printed.includes('A command is already running')) {
    return {
      status: 'busy',
      message: 'A command is running in the Terminal. Wait for it to finish, or press Ctrl+C there, then check again.',
      expected: null,
      actual: null,
      output: null,
    };
  }

  if (check.kind === 'stdoutEquals') {
    const expected = check.expected.trim();
    const passed = exit === 0 && printed === expected;
    return {
      status: passed ? 'passed' : 'failed',
      message: passed
        ? 'Your program printed exactly the expected output.'
        : exit !== 0
          ? 'Your program stopped with an error before it finished. Read the error below.'
          : 'Your program ran, but its output is not the expected output yet. Compare the two below.',
      expected,
      actual: printed,
      output: exit !== 0 ? tail(printed) : null,
    };
  }

  const passed = exit === 0;
  // A file with no test() in it yet (the starting comment, say) is not a failing test, and saying
  // "not every test passed" would send the learner looking for an error that is not there.
  const noTests = !passed && /No tests found/.test(printed);
  return {
    status: passed ? 'passed' : 'failed',
    message: passed
      ? 'Every test passed.'
      : noTests
        ? 'Your file has no tests yet. Write at least one test(...) in it, then check again.'
        : 'Not every test passed yet. The end of the test run is below: read the first error.',
    expected: null,
    actual: null,
    output: passed || noTests ? null : tail(printed),
  };
}
