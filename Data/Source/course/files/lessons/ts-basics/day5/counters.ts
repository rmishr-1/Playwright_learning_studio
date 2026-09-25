// Counting results as a test run progresses
let passed = 0;
let failed = 0;
let totalTimeMs = 0;

// Test 1: login — passed in 1200 ms
passed++;
totalTimeMs += 1200;

// Test 2: search — failed in 5300 ms
failed++;
totalTimeMs += 5300;

// Test 3: checkout — passed in 2500 ms
passed += 1;
totalTimeMs = totalTimeMs + 2500;

// Summary
const total = passed + failed;
console.log(`Ran ${total} tests: ${passed} passed, ${failed} failed`);
console.log(`Total time: ${totalTimeMs} ms (${totalTimeMs / 1000} seconds)`);
console.log(`Average per test: ${totalTimeMs / total} ms`);
