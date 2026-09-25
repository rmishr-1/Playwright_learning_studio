// Types that describe a test run
type Status = 'passed' | 'failed' | 'skipped';
type TestResult = { title: string; status: Status; durationMs: number; error?: string };
type TestRun = { browser: 'chromium' | 'firefox' | 'webkit'; results: TestResult[] };

// One finished run
const run: TestRun = {
  browser: 'firefox',
  results: [
    { title: 'login works', status: 'passed', durationMs: 1200 },
    { title: 'search works', status: 'failed', durationMs: 5300, error: 'Timeout 5000ms exceeded' },
    { title: 'profile edits', status: 'skipped', durationMs: 0 },
  ],
};

const second = run.results[1];
console.log(`Browser: ${run.browser}, ${run.results.length} results`);
console.log(`2nd test: ${second.title} - ${second.status} after ${second.durationMs / 1000}s`);
console.log(`Its error: ${second.error ?? 'none'}`);
console.log(`1st test error: ${run.results[0].error ?? 'none'}`);
