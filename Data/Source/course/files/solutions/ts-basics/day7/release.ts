type Status = 'passed' | 'failed' | 'skipped';
type TestResult = { title: string; status: Status; durationMs: number };
const results: TestResult[] = [
  { title: 'login', status: 'passed', durationMs: 1200 },
  { title: 'search', status: 'passed', durationMs: 2300 },
  { title: 'filters', status: 'skipped', durationMs: 0 },
  { title: 'add to cart', status: 'passed', durationMs: 1900 },
  { title: 'checkout', status: 'failed', durationMs: 7400 },
  { title: 'payment', status: 'passed', durationMs: 3100 },
  { title: 'invoice', status: 'skipped', durationMs: 0 },
  { title: 'logout', status: 'passed', durationMs: 600 },
];

let passed = 0;
let failed = 0;
let skipped = 0;
let slowest = results[0];

for (const result of results) {
  switch (result.status) {
    case 'passed':
      passed++;
      break;
    case 'failed':
      failed++;
      break;
    case 'skipped':
      skipped++;
      break;
  }
  if (result.durationMs > slowest.durationMs) {
    slowest = result;
  }
}

const passRate = (passed / (passed + failed)) * 100;
const release = passRate >= 90 && skipped <= 2 ? 'approved' : 'blocked';

console.log(`passed: ${passed}, failed: ${failed}, skipped: ${skipped}`);
console.log(`Pass rate: ${passRate.toFixed(1)}%`);
console.log(`Slowest: ${slowest.title} (${slowest.durationMs / 1000} s)`);
console.log(`Release: ${release}`);
