type TestFunction = () => Promise<void>;

interface RegisteredTest {
  title: string;
  body: TestFunction;
  skipped: boolean;
}

const registeredTests: RegisteredTest[] = [];
let beforeEachHook: TestFunction | undefined;      // no hook until beforeEach() is called

function test(title: string, body: TestFunction): void {
  registeredTests.push({ title, body, skipped: false });
}

function skip(title: string, body: TestFunction): void {
  registeredTests.push({ title, body, skipped: true });
}

function beforeEach(fn: TestFunction): void {
  beforeEachHook = fn;
}

function expectEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

async function run(): Promise<void> {
  let passed = 0;
  let failed = 0;
  let skippedCount = 0;

  for (const t of registeredTests) {
    if (t.skipped) {                                // don't run skipped tests
      console.log(`  - ${t.title} (skipped)`);
      skippedCount++;
      continue;
    }
    try {
      if (beforeEachHook) {
        await beforeEachHook();                     // fresh state before every test
      }
      await t.body();
      console.log(`  ✓ ${t.title}`);
      passed++;
    } catch (error) {
      console.log(`  ✘ ${t.title}`);
      console.log(`      ${(error as Error).message}`);
      failed++;
    }
  }
  console.log(`\n  ${passed} passed, ${failed} failed, ${skippedCount} skipped`);
}

// ---------- the tests ----------
let cart: number[] = [];
beforeEach(async () => { cart = []; });
test('adds one item', async () => { cart.push(499); expectEqual(cart.length, 1); });
test('cart starts empty', async () => { expectEqual(cart.length, 0); });
skip('applies coupon', async () => { expectEqual(1, 2); });
test('total is right', async () => { cart.push(100, 200); expectEqual(cart.length, 3); });

run();
