// A tiny test runner: the same idea as Playwright Test, in about 30 lines

// A test body: a function that takes nothing and returns a Promise
type TestBody = () => Promise<void>;
type RegisteredTest = { title: string; body: TestBody };

const registeredTests: RegisteredTest[] = [];

// test(): register a test. It does NOT run yet.
export function test(title: string, body: TestBody): void {
  registeredTests.push({ title, body });        // short for { title: title, body: body }
}

// expectEqual(): a tiny assertion. It throws when the values differ.
export function expectEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

// run(): run every registered test, one after another, and report
export async function run(): Promise<void> {
  let passed = 0;
  for (const registered of registeredTests) {
    try {
      await registered.body();                  // run the test and wait for it
      passed++;
      console.log(`  ✓ ${registered.title}`);
    } catch (error) {                           // a failed check lands here
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ✘ ${registered.title}`);
      console.log(`      ${message}`);
    }
  }
  console.log(`${passed} passed, ${registeredTests.length - passed} failed`);
}
