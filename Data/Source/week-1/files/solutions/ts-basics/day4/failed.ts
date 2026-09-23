interface TestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}

const run: TestResult[] = [
  { title: 'login works', status: 'passed', durationMs: 1200 },
  { title: 'search works', status: 'failed', durationMs: 5300 },
  { title: 'cart updates', status: 'passed', durationMs: 900 },
  { title: 'checkout completes', status: 'failed', durationMs: 30000 },
  { title: 'profile edits', status: 'skipped', durationMs: 0 },
];

// 1 + 2: failed tests → their titles
const failedTests = run.filter((r) => r.status === 'failed');
const failedTitles = failedTests.map((r) => r.title);

// 3: find the test with the largest duration
const slowest = (results: TestResult[]): TestResult => {
  let max = results[0];
  for (const r of results) {
    if (r.durationMs > max.durationMs) {
      max = r;
    }
  }
  return max;
};

const worst = slowest(run);
console.log(`Failed (${failedTests.length}): ${failedTitles.join(', ')}`);
console.log(`Slowest: ${worst.title} (${worst.durationMs / 1000}s)`);
