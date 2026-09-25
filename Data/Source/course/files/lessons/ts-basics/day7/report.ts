// Build a test-run report with array methods
type Status = 'passed' | 'failed' | 'skipped';
type TestResult = { title: string; status: Status; durationMs: number };

const results: TestResult[] = [
  { title: 'login works', status: 'passed', durationMs: 1200 },
  { title: 'search works', status: 'failed', durationMs: 5300 },
  { title: 'add to cart', status: 'passed', durationMs: 2100 },
  { title: 'checkout', status: 'failed', durationMs: 7400 },
  { title: 'profile edits', status: 'skipped', durationMs: 0 },
];

// forEach: do something with every item (here: print a numbered list)
results.forEach((result, index) => {
  console.log(`${index + 1}. ${result.title} - ${result.status}`);
});

// filter: keep only the items that match
const failures = results.filter((result) => result.status === 'failed');

// map: turn every item into something else (here: just its title)
const failedTitles = failures.map((result) => result.title);
console.log(`Failed (${failures.length}): ${failedTitles.join(', ')}`);

// find: the FIRST item that matches, or undefined
const firstSlow = results.find((result) => result.durationMs > 5000);
console.log(`First slow test: ${firstSlow?.title ?? 'none'}`);

// some / every: yes-or-no questions about the whole list
const anyFailed = results.some((result) => result.status === 'failed');
const allUnder10s = results.every((result) => result.durationMs < 10000);
console.log(`Any failed? ${anyFailed}. All under 10 s? ${allUnder10s}`);

// A plain loop still works for totals
let totalMs = 0;
for (const result of results) {
  totalMs += result.durationMs;
}
console.log(`Total time: ${totalMs / 1000} s`);
