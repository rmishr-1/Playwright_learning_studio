// ---------- the mini "framework" ----------
type TestFunction = () => Promise<void>;          // a test body: an async function

interface RegisteredTest {
  title: string;
  body: TestFunction;
}

const registeredTests: RegisteredTest[] = [];

// 1. test(): register a test — it does NOT run it yet (same idea as Playwright)
function test(title: string, body: TestFunction): void {
  registeredTests.push({ title, body });
}

// 2. expectEqual(): a tiny assertion — throws an Error when the values differ
function expectEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

// 3. run(): execute every registered test, one after another, and report
async function run(): Promise<void> {
  let passed = 0;
  for (const t of registeredTests) {             // for...of works with await
    try {
      await t.body();                            // run the test body and wait for it
      console.log(`  ✓ ${t.title}`);
      passed++;
    } catch (error) {
      console.log(`  ✘ ${t.title}`);
      console.log(`      ${(error as Error).message}`);
    }
  }
  console.log(`\n  ${passed} passed, ${registeredTests.length - passed} failed`);
}

// ---------- the "tests" ----------
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test('cart total adds up', async () => {
  const prices = [499, 1299, 250];
  let total = 0;
  for (const price of prices) {
    total += price;
  }
  expectEqual(total, 2048);
});

test('page title is correct', async () => {
  await wait(100);                               // pretend the page is loading
  const title = 'My Shop – Home';
  expectEqual(title, 'My Shop – Home');
});

test('discount is applied', async () => {
  const price = 1000;
  const discounted = price * 0.9;
  expectEqual(discounted, 850);                  // wrong expectation → this test fails
});

run();
