---
day: 7
week: 2
title: 'TypeScript II: Conditions, Loops & Functions'
subtitle: Make decisions, repeat work and package steps into reusable functions — including the callback pattern behind every Playwright test
estimatedTime: 3 hours
topics:
- Conditions
- Loops
- Functions
objectives:
- Use `if / else if / else`, `switch` and the ternary operator to make decisions
- Explain truthy and falsy values
- Repeat work with `for`, `for...of`, `while` and array methods, using `break` and `continue`
- Write functions with typed parameters, return types, optional and default parameters, and arrow functions
- Pass functions to other functions (callbacks) — the pattern behind `test('title', async () => {…})`
prerequisitesFromEarlierDays:
- 'Day 5–6: variables, types, operators, arrays, objects, type aliases'
workspace: pw-course/ts-basics/day7/
---

# Prerequisites

## P1 · Blocks, indentation and scope

Curly braces `{ }` group statements into a **block**. Code inside a block is **indented** (moved right) so you can see what belongs together.

```ts mode=read
if (isLoggedIn) {            // the block starts
  console.log('Welcome');    // indented: belongs to the if
  showDashboard();
}                            // the block ends
console.log('Done');         // not indented: always runs
```

**Scope** means *where a variable exists*. A `let` or `const` created **inside** a block exists only inside that block:

```ts mode=read
const suite = 'Checkout';           // outside any block: visible everywhere below
if (true) {
  const message = 'inside';         // only exists inside these braces
  console.log(suite, message);      // ✅ both visible
}
console.log(message);               // ❌ Cannot find name 'message'
```

> [!TIP]
> In VS Code, select code and press `Shift + Alt + F` (Windows/Linux) or `Shift + Option + F` (Mac) to auto-format indentation.

## P2 · Truthy and falsy

Conditions need `true` or `false`. When you give them another value, JavaScript treats it as "truthy" or "falsy".

**Falsy** — these count as `false`: `false`, `0`, `''` (empty string), `null`, `undefined`, `NaN`.
**Truthy** — *everything else*: `'hello'`, `42`, `[]`, `{}`, `'false'` (a non-empty string!).

```ts mode=read
const errorMessage = '';
if (errorMessage) {
  console.log('Error shown:', errorMessage);   // skipped — '' is falsy
}
```

```quiz
id: d7-p2-q1
type: multiple
question: Which values are FALSY? (Select all that apply)
options:
  - "`0`"
  - "`'0'`"
  - "`''`"
  - "`undefined`"
answer: [a, c, d]
explanation: "`'0'` is a non-empty string, so it's truthy. The number 0, the empty string and undefined are falsy."
```

## P3 · Quick recap from Days 5–6

```quiz
id: d7-p3-q1
type: single
question: "`const browsers = ['chromium', 'firefox']; browsers.push('webkit');` — what is `browsers[2]`?"
options:
  - "'firefox'"
  - "'webkit'"
  - undefined
  - An error, because browsers is const
answer: b
explanation: "`const` stops you replacing the array, not changing its contents. After push, index 2 is 'webkit'."
```

```quiz
id: d7-p3-q2
type: single
question: "What is `5 > 3 && 2 > 4`?"
options:
  - "true"
  - "false"
answer: b
explanation: "5 > 3 is true but 2 > 4 is false. With `&&`, both must be true."
```

# Fundamentals

## F1 · Conditions: making decisions

### `if`, `else if`, `else`

```ts file=ts-basics/day7/conditions.ts mode=editor run="node day7/conditions.ts"
const statusCode = 404;

// Checked from top to bottom — the FIRST true condition wins, the rest are skipped
if (statusCode >= 200 && statusCode < 300) {
  console.log('Success');
} else if (statusCode >= 400 && statusCode < 500) {
  console.log('Client error — check the request');
} else if (statusCode >= 500) {
  console.log('Server error — raise a bug');
} else {
  console.log('Something else');
}

// A condition can use a truthy/falsy value directly
const couponCode = '';
if (!couponCode) {
  console.log('No coupon applied');
}
```

```output console
Client error — check the request
No coupon applied
```

### `switch` — choose between many exact values

```ts file=ts-basics/day7/switch.ts mode=editor run="node day7/switch.ts"
const browserName: string = 'webkit';
let realBrowser: string;

switch (browserName) {
  case 'chromium':
    realBrowser = 'Chrome / Edge';
    break;                          // stop here — otherwise the next case runs too!
  case 'firefox':
    realBrowser = 'Firefox';
    break;
  case 'webkit':
    realBrowser = 'Safari';
    break;
  default:                          // none of the cases matched
    realBrowser = 'Unknown';
}

console.log(`${browserName} is like ${realBrowser}`);
```

```output console
webkit is like Safari
```

> [!WARNING]
> Forgetting `break` is a classic bug: execution "falls through" into the next case.

### Choosing the right tool

| Situation | Use |
|---|---|
| Ranges or combined conditions (`>= 200 && < 300`) | `if / else if / else` |
| One variable compared to many exact values | `switch` |
| Choose between two values in one line | ternary `cond ? a : b` |

```quiz
id: d7-f1-q1
type: single
question: "`const score = 75;` — what prints? `if (score >= 90) { console.log('A'); } else if (score >= 70) { console.log('B'); } else if (score >= 50) { console.log('C'); }`"
options:
  - A
  - B
  - B and C
  - C
answer: b
explanation: The chain stops at the first true condition. 75 >= 70 is true, so 'B' prints and the 'C' check is skipped.
```

## F2 · Loops: repeating work

Automation is about repetition — the same check for every user, every browser, every row. Loops do that.

### `for...of` — for each item in a list (your most-used loop)

```ts mode=read
const users = ['asha', 'ravi', 'meera'];
for (const user of users) {
  console.log(`Logging in as ${user}`);
}
```

### Classic `for` — when you need a counter

```ts mode=read
// start at 1; keep going while attempt <= 3; add 1 after each round
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`Attempt ${attempt}`);
}
```

### `while` and `do...while` — repeat until something changes

```ts mode=read
let itemsInCart = 3;
while (itemsInCart > 0) {        // checks BEFORE each round (may run 0 times)
  itemsInCart--;
}

let tries = 0;
do {                              // runs at least ONCE, checks AFTER each round
  tries++;
} while (tries < 3);
```

> [!WARNING] Infinite loops
> If the condition never becomes false (e.g. you forget `itemsInCart--`), the loop never ends. Press `Ctrl + C` in the terminal to stop it.

### `break` and `continue`

```ts file=ts-basics/day7/loops.ts mode=editor run="node day7/loops.ts"
const results = ['pass', 'pass', 'skip', 'fail', 'pass'];

// continue: skip the rest of THIS round, go to the next item
for (const result of results) {
  if (result === 'skip') {
    continue;
  }
  console.log('Counted:', result);
}

// break: stop the whole loop immediately
for (let i = 0; i < results.length; i++) {
  if (results[i] === 'fail') {
    console.log(`First failure at position ${i}`);
    break;
  }
}
```

```output console
Counted: pass
Counted: pass
Counted: fail
Counted: pass
First failure at position 3
```

### Array methods that loop for you

Arrays have built-in methods that take a small function (you'll write these properly in F3):

| Method | Does | Example | Result |
|---|---|---|---|
| `forEach` | runs code for each item | `names.forEach((n) => console.log(n))` | prints each name |
| `map` | makes a new array by transforming each item | `[1, 2, 3].map((n) => n * 2)` | `[2, 4, 6]` |
| `filter` | keeps only items that pass a test | `['pass', 'fail'].filter((r) => r === 'fail')` | `['fail']` |
| `find` | returns the first matching item | `users.find((u) => u.isAdmin)` | first admin or `undefined` |
| `some` / `every` | is it true for any / all items? | `results.every((r) => r === 'pass')` | `true` or `false` |

> [!WARNING] `forEach` and `await` don't mix
> Later, when a loop contains Playwright actions (`await page.click(…)`), use `for...of`. `forEach` does **not** wait for `await` inside it — a subtle and common bug.

```quiz
id: d7-f2-q1
type: single
question: How many times does "Hi" print? `for (let i = 0; i < 3; i++) { console.log('Hi'); }`
options:
  - "2"
  - "3"
  - "4"
  - Forever
answer: b
explanation: i takes the values 0, 1, 2 (three rounds). When i becomes 3, `i < 3` is false and the loop stops.
```

```quiz
id: d7-f2-q2
type: single
question: "What does `[5, 12, 8, 20].filter((n) => n > 10)` return?"
options:
  - "[5, 8]"
  - "[12, 20]"
  - "12"
  - "true"
answer: b
explanation: "`filter` keeps the items for which the function returns true: 12 and 20."
```

## F3 · Functions: reusable steps

A **function** is a named, reusable block of steps — like a reusable test step "Log in as user X" that many test cases call.

### Declaring and calling

```ts file=ts-basics/day7/functions.ts mode=editor run="node day7/functions.ts"
// name     parameters (inputs, with types)       return type
function calculatePassRate(passed: number, total: number): number {
  return (passed / total) * 100;              // return sends a value back to the caller
}

// A function that returns nothing uses the type void
function printHeader(title: string): void {
  console.log(`===== ${title} =====`);
}

// Calling (using) the functions
printHeader('Nightly run');
const rate = calculatePassRate(45, 50);       // arguments: the actual values
console.log(`Pass rate: ${rate}%`);
console.log(`Smoke pass rate: ${calculatePassRate(9, 10)}%`);
```

```output console
===== Nightly run =====
Pass rate: 90%
Smoke pass rate: 90%
```

Words to know: **parameters** are the input names in the definition (`passed`, `total`); **arguments** are the actual values you pass (`45`, `50`); **`return`** ends the function and hands back a value.

### Optional and default parameters

```ts file=ts-basics/day7/parameters.ts mode=editor run="node day7/parameters.ts"
// timeout has a DEFAULT value; tag is OPTIONAL (may be undefined)
function describeTest(title: string, timeout: number = 30000, tag?: string): string {
  const tagText = tag ? ` ${tag}` : '';        // add the tag only if one was given
  return `${title}${tagText} (timeout ${timeout / 1000}s)`;
}

console.log(describeTest('Login works'));
console.log(describeTest('Checkout completes', 60000));
console.log(describeTest('Search returns results', 30000, '@smoke'));
```

```output console
Login works (timeout 30s)
Checkout completes (timeout 60s)
Search returns results @smoke (timeout 30s)
```

### Rest parameters — any number of arguments

```ts mode=read
function logTags(title: string, ...tags: string[]): void {
  console.log(title, 'has', tags.length, 'tags');
}
logTags('Checkout', '@smoke', '@regression', '@payments');   // Checkout has 3 tags
```

### Arrow functions — the short form you'll see everywhere

```ts mode=read
// Regular function
function double(n: number): number {
  return n * 2;
}

// Same thing as an arrow function stored in a constant
const doubleArrow = (n: number): number => {
  return n * 2;
};

// Even shorter: one expression → no braces, no return keyword
const doubleShort = (n: number) => n * 2;
```

### Functions as values: callbacks

In TypeScript a function is a value — you can pass it **into another function**. The receiving function decides *when* to run it. A function passed like this is called a **callback**.

```ts file=ts-basics/day7/callbacks.ts mode=editor run="node day7/callbacks.ts"
// runStep receives a NAME and a FUNCTION, prints the name, then calls the function
function runStep(name: string, action: () => void): void {
  console.log(`▶ ${name}`);
  action();                       // run the function we were given
}

// Pass an arrow function directly as the second argument
runStep('Open the home page', () => {
  console.log('  …navigating to /home');
});

runStep('Search for "mouse"', () => {
  console.log('  …typing into the search box');
});
```

```output console
▶ Open the home page
  …navigating to /home
▶ Search for "mouse"
  …typing into the search box
```

> [!TESTER] This is exactly how Playwright tests are written
> ```ts
> test('Open the home page', async ({ page }) => { … });
> ```
> `test` is a function that receives a **title** and a **callback**. Playwright decides when to run your callback — and hands it a ready-made `page`. You just wrote the same pattern yourself!

```quiz
id: d7-f3-q1
type: single
question: "`` function greet(name: string, greeting = 'Hello'): string { return `${greeting}, ${name}`; } `` — what does `greet('Ravi')` return?"
options:
  - "'Ravi, Hello'"
  - "'Hello, Ravi'"
  - "'undefined, Ravi'"
  - An error — greeting is missing
answer: b
explanation: "`greeting` has a default value 'Hello', used when no second argument is passed."
```

```quiz
id: d7-f3-q2
type: single
question: Which is a correct arrow function that adds two numbers?
options:
  - "`const add = (a: number, b: number) => a + b;`"
  - "`const add = function => a + b;`"
  - "`add(a, b) => { a + b }`"
  - "`const add => (a + b);`"
answer: a
explanation: Parameters in brackets, then `=>`, then the result. With a single expression the value is returned automatically.
```

# Implementation

## I1 · A data-driven validator

Combine **objects** (Day 6), **functions**, **conditions** and **loops**: a function checks a password against rules, and a loop runs it over a table of test data — exactly like a data-driven test.

```ts file=ts-basics/day7/password-rules.ts mode=editor run="node day7/password-rules.ts"
// Business rule: 8+ characters, at least one digit, at least one uppercase letter
function validatePassword(password: string): string[] {
  const problems: string[] = [];

  if (password.length < 8) {
    problems.push('too short');
  }
  if (!/[0-9]/.test(password)) {          // /[0-9]/ = "any digit" pattern
    problems.push('needs a digit');
  }
  if (!/[A-Z]/.test(password)) {          // /[A-Z]/ = "any uppercase letter" pattern
    problems.push('needs an uppercase letter');
  }
  return problems;                        // an empty list means the password is valid
}

// Test data: each case says what we EXPECT
type PasswordCase = {
  input: string;
  shouldBeValid: boolean;
};

const cases: PasswordCase[] = [
  { input: 'Secret123', shouldBeValid: true },
  { input: 'short1A', shouldBeValid: false },
  { input: 'alllowercase1', shouldBeValid: false },
  { input: 'NoDigitsHere', shouldBeValid: false },
  { input: 'Valid2Password', shouldBeValid: true },
];

let passed = 0;
for (const testCase of cases) {
  const problems = validatePassword(testCase.input);
  const isValid = problems.length === 0;
  const ok = isValid === testCase.shouldBeValid;          // did reality match the expectation?
  if (ok) {
    passed++;
  }
  const details = isValid ? 'valid' : problems.join(', ');
  console.log(`${ok ? '✓' : '✗'} "${testCase.input}" → ${details}`);
}

console.log(`${passed}/${cases.length} cases behaved as expected`);
```

```output console
✓ "Secret123" → valid
✓ "short1A" → too short
✓ "alllowercase1" → needs an uppercase letter
✓ "NoDigitsHere" → needs a digit
✓ "Valid2Password" → valid
5/5 cases behaved as expected
```

**Try it:** add a case `{ input: 'Abcdefg1', shouldBeValid: true }` and predict the output first. Then add a new rule — "must not contain spaces" (`password.includes(' ')`) — and a case that checks it.

## I2 · Generate a smoke-test checklist

Combine a **function**, a **loop** and **conditions** to produce a smoke-test checklist from a list of pages — the kind of thing you'd run after every deployment.

```ts file=ts-basics/day7/checklist.ts mode=editor run="node day7/checklist.ts"
// Each page we want to check after a deployment
type PageCheck = {
  path: string;
  expectedTitle: string;
  critical: boolean;      // critical pages block the release if broken
};

const pages: PageCheck[] = [
  { path: '/', expectedTitle: 'Home', critical: true },
  { path: '/login', expectedTitle: 'Sign in', critical: true },
  { path: '/help', expectedTitle: 'Help centre', critical: false },
  { path: '/about', expectedTitle: 'About us', critical: false },
];

// A function that describes one check as a line of text
function describeCheck(check: PageCheck, index: number): string {
  const marker = check.critical ? '!' : ' ';                  // mark critical pages
  return `${index + 1}. [${marker}] open ${check.path} → expect title "${check.expectedTitle}"`;
}

// A function that counts how many checks are critical
function countCritical(checks: PageCheck[]): number {
  let count = 0;
  for (const check of checks) {
    if (check.critical) {
      count++;
    }
  }
  return count;
}

console.log('Smoke checklist');
for (let i = 0; i < pages.length; i++) {
  console.log(describeCheck(pages[i], i));
}
console.log(`${countCritical(pages)} of ${pages.length} checks are release-blocking`);
```

```output console
Smoke checklist
1. [!] open / → expect title "Home"
2. [!] open /login → expect title "Sign in"
3. [ ] open /help → expect title "Help centre"
4. [ ] open /about → expect title "About us"
2 of 4 checks are release-blocking
```

**Try it:** add a page `{ path: '/cart', expectedTitle: 'Your cart', critical: true }` and predict both the new line and the last line before running.

# Practice

## Quiz · Day 7 check

```quiz
id: d7-pr-q1
type: single
question: Which loop always runs its body at least once?
options:
  - for
  - while
  - do...while
  - for...of
answer: c
explanation: "`do...while` checks the condition AFTER each round, so the body runs at least once."
```

```quiz
id: d7-pr-q2
type: single
question: What does `continue` do inside a loop?
options:
  - Stops the loop completely
  - Skips the rest of the current round and moves to the next one
  - Restarts the loop from the first item
  - Pauses the program
answer: b
explanation: "`continue` skips to the next round; `break` exits the loop."
```

```quiz
id: d7-pr-q3
type: single
question: "`function f(a: number, b?: number) { return b === undefined ? a : a + b; }` — what is `f(4)`?"
options:
  - "4"
  - NaN
  - An error
  - undefined
answer: a
explanation: "`b` is optional and wasn't passed, so it is undefined and the function returns `a`."
```

```quiz
id: d7-pr-q4
type: single
question: What is a callback?
options:
  - A phone call from the test runner
  - A function passed into another function, to be called later by that function
  - A function that calls itself forever
  - A type of loop
answer: b
explanation: "In `test('title', async ({ page }) => {…})`, the arrow function is a callback that Playwright calls when it runs the test."
```

## Predict the output

````exercise
id: d7-pr-p1
title: Predict — loop with conditions
level: easy
type: predict
prompt: What does this print?
code: |
  const statuses = [200, 301, 404, 500];
  for (const code of statuses) {
    if (code >= 500) {
      console.log(code, 'server');
      break;
    } else if (code >= 400) {
      console.log(code, 'client');
      continue;
    }
    console.log(code, 'ok');
  }
answer: |
  200 ok
  301 ok
  404 client
  500 server

  404 hits `continue`, so 'ok' is skipped for it. 500 prints 'server' and `break` ends the loop (it was the last item anyway).
````

````exercise
id: d7-pr-p3
title: Predict — scope
level: medium
type: predict
prompt: Which line does the type checker reject, and why?
code: |
  const suite = 'Login';
  for (let i = 0; i < 2; i++) {
    const title = `${suite} test ${i}`;
    console.log(title);
  }
  console.log(title);
answer: |
  The last line: `console.log(title);` → "Cannot find name 'title'".

  `title` is declared with `const` inside the loop's block, so it only exists inside that block. `suite` is fine because it's declared outside.
````

## Exercises

````exercise
id: d7-ex1
title: Test-run reporter
level: easy
type: code
prompt: |
  Create `day7/reporter.ts`. Given
  ```ts
  const results: string[] = ['pass', 'fail', 'pass', 'skip', 'pass', 'fail'];
  ```
  use **one `for...of` loop** and **`if / else if / else`** to count passes, failures and skips, then print:
  ```
  Passed: 3
  Failed: 2
  Skipped: 1
  Verdict: FAIL
  ```
  The verdict is `PASS` only when there are **no** failures (use a ternary).
file: ts-basics/day7/reporter.ts
run: node day7/reporter.ts
hints:
  - Create three `let` counters starting at 0 before the loop.
  - "`const verdict = failed === 0 ? 'PASS' : 'FAIL';`"
solution: |
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
expectedOutput: |
  Passed: 3
  Failed: 2
  Skipped: 1
  Verdict: FAIL
````

````exercise
id: d7-ex2
title: Priority mapper with switch
level: easy
type: code
prompt: |
  Create `day7/priority.ts`. Write a function `slaHours(priority: 'P1' | 'P2' | 'P3' | 'P4'): number` that uses a **switch** to return the bug-fix deadline: P1 → 4, P2 → 24, P3 → 72, P4 → 168.

  Then loop over `['P1', 'P3', 'P4']` and print:
  ```
  P1 must be fixed within 4 hours
  P3 must be fixed within 72 hours
  P4 must be fixed within 168 hours
  ```
file: ts-basics/day7/priority.ts
run: node day7/priority.ts
hints:
  - "With `return` inside each case you don't need `break` — `return` leaves the function immediately."
  - "Type the list so TypeScript accepts it: `const priorities: ('P1' | 'P2' | 'P3' | 'P4')[] = ['P1', 'P3', 'P4'];`"
solution: |
  type Priority = 'P1' | 'P2' | 'P3' | 'P4';

  // Return the SLA (in hours) for a bug priority
  function slaHours(priority: Priority): number {
    switch (priority) {
      case 'P1':
        return 4;
      case 'P2':
        return 24;
      case 'P3':
        return 72;
      case 'P4':
        return 168;
    }
  }

  const priorities: Priority[] = ['P1', 'P3', 'P4'];
  for (const p of priorities) {
    console.log(`${p} must be fixed within ${slaHours(p)} hours`);
  }
expectedOutput: |
  P1 must be fixed within 4 hours
  P3 must be fixed within 72 hours
  P4 must be fixed within 168 hours
````

````exercise
id: d7-ex3
title: Find the failed tests
level: medium
type: code
prompt: |
  Create `day7/failed.ts` with this data:
  ```ts
  type TestResult = { title: string; status: 'passed' | 'failed' | 'skipped'; durationMs: number; };
  const run: TestResult[] = [
    { title: 'login works', status: 'passed', durationMs: 1200 },
    { title: 'search works', status: 'failed', durationMs: 5300 },
    { title: 'cart updates', status: 'passed', durationMs: 900 },
    { title: 'checkout completes', status: 'failed', durationMs: 30000 },
    { title: 'profile edits', status: 'skipped', durationMs: 0 },
  ];
  ```
  1. Use `filter` to get only the failed tests.
  2. Use `map` to get their titles.
  3. Write an **arrow function** `slowest(results: TestResult[]): TestResult` that loops over the list and returns the test with the largest `durationMs`.
  4. Print:
  ```
  Failed (2): search works, checkout completes
  Slowest: checkout completes (30s)
  ```
file: ts-basics/day7/failed.ts
run: node day7/failed.ts
hints:
  - "`run.filter((r) => r.status === 'failed')`"
  - "In `slowest`, start with `let max = results[0];` and replace it whenever you find a longer duration."
solution: |
  type TestResult = {
    title: string;
    status: 'passed' | 'failed' | 'skipped';
    durationMs: number;
  };

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
expectedOutput: |
  Failed (2): search works, checkout completes
  Slowest: checkout completes (30s)
````

## Reflection

1. When would you choose `switch` over `if / else if`?
2. Write, from memory, an arrow function that takes a `name: string` and returns `` `Hello, ${name}` ``.
3. Read this line aloud in plain English: `runStep('Open the home page', () => { … });`

> [!TIP] Coming up on Day 8
> `async`/`await` — the one concept behind every `await page.click()` — plus interfaces, destructuring, modules, and a mini test runner you build yourself.
