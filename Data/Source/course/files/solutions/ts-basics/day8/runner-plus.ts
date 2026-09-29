type TestBody = () => Promise<void>;
type RegisteredTest = { title: string; body: TestBody; skipped: boolean };

const registeredTests: RegisteredTest[] = [];

function test(title: string, body: TestBody): void {
  registeredTests.push({ title, body, skipped: false });
}

// Register a test that should NOT run (like Playwright's test.skip)
function skip(title: string, body: TestBody): void {
  registeredTests.push({ title, body, skipped: true });
}

function expectEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function run(): Promise<void> {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const registered of registeredTests) {
    if (registered.skipped) {
      skipped++;
      console.log(`  - ${registered.title} (skipped)`);
      continue;
    }
    try {
      await registered.body();
      passed++;
      console.log(`  ✓ ${registered.title}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ✘ ${registered.title}`);
      console.log(`      ${message}`);
    }
  }
  console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
}

test('discount is 10%', async () => {
  expectEqual(1000 * 0.9, 900);
});
skip('payment by UPI', async () => {
  expectEqual('not built yet', 'done');
});
test('free shipping over 999', async () => {
  const shipping = 1200 > 999 ? 0 : 49;
  expectEqual(shipping, 49);
});

await run();
