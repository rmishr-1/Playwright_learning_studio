const results: string[] = ['pass', 'fail', 'pass', 'skip', 'pass', 'fail'];

// Counters
let passed = 0;
let failed = 0;
let skipped = 0;

// Count each result
for (const result of results) {
  if (result === 'pass') {
    passed++;
  } else if (result === 'fail') {
    failed++;
  } else {
    skipped++;
  }
}

// Verdict: PASS only if nothing failed
const verdict = failed === 0 ? 'PASS' : 'FAIL';

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Verdict: ${verdict}`);
