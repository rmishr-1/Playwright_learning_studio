---
day: 5
title: Playwright Test Runner Basics
subtitle: Write, organise, filter, run and debug real Playwright tests — then build your Week 1 mini-project
estimatedTime: 3.5–4 hours
topics:
  - Playwright Test Runner Basics
  - "Framework Structure Overview (applied: organising a spec file and helper module)"
objectives:
  - Explain every part of a Playwright test — import, test(), title, async callback, fixtures, await, expect
  - Use the built-in fixtures `page`, `context`, `browser`, `browserName` and `request`
  - Find elements with user-facing locators and perform basic actions (click, fill, check, selectOption, press)
  - Write web-first assertions and generic assertions, and know which ones need `await`
  - Group tests with `test.describe` and share setup with `beforeEach`, `afterEach`, `beforeAll`, `afterAll`
  - Control tests with `test.only`, `test.skip`, `test.fixme` and tags, and filter them from the CLI
  - Explain how the runner discovers, parallelises, times out, retries and reports tests
  - Debug a failing test from its error output and the HTML report
prerequisitesFromEarlierDays:
  - "Day 2: the pw-course project, running tests, playwright.config.ts"
  - "Day 4: functions, callbacks, arrow functions, destructuring, async/await, import/export"
workspace: pw-course/tests/day5/
---

# Prerequisites

## P1 · Checklist before you start

You're ready for today if you can tick all of these. If not, revisit the lesson in brackets.

- [ ] I can open the terminal in `pw-course` and run `npx playwright test --project=chromium` (Day 2 · I4–I6)
- [ ] My `playwright.config.ts` uses `reporter: [['list'], ['html', { open: 'never' }]]` (Day 2 · I5)
- [ ] I can read `async ({ page }) => { … }` as "an async arrow function that destructures `page`" (Day 4 · F3–F4)
- [ ] I know why every browser action needs `await` (Day 4 · F5)
- [ ] I can import a named export from another file (Day 4 · F6)

## P2 · HTML roles — how Playwright "sees" a page

Playwright's recommended way to find elements is the way **users and assistive technologies** (screen readers) see them: by **role** and **accessible name**.

Most HTML elements have a built-in role:

| HTML | Role | Accessible name comes from… |
|---|---|---|
| `<button>Sign in</button>` | `button` | its text → "Sign in" |
| `<a href="/help">Help</a>` | `link` | its text → "Help" |
| `<h1>Dashboard</h1>` (also h2–h6) | `heading` | its text → "Dashboard" |
| `<input type="text">` / `type="email"` with a `<label>` | `textbox` | its label → e.g. "Email" |
| `<input type="checkbox">` | `checkbox` | its label → e.g. "Remember me" |
| `<select>` | `combobox` | its label → e.g. "Course" |
| `<ul>` / `<li>` | `list` / `listitem` | — |
| `<p role="alert">` | `alert` | its text |

So `page.getByRole('button', { name: 'Sign in' })` means: *the button whose accessible name is "Sign in"* — exactly how you'd describe it in a manual test case.

> [!NOTE]
> A **password** input (`type="password"`) has no ARIA role, so `getByRole('textbox')` won't find it — find it by its label instead: `page.getByLabel('Password')`.

```quiz
id: d5-p2-q1
type: single
question: "Which locator finds `<a href=\"/pricing\">See pricing</a>`?"
options:
  - "`page.getByRole('button', { name: 'See pricing' })`"
  - "`page.getByRole('link', { name: 'See pricing' })`"
  - "`page.getByRole('heading', { name: 'pricing' })`"
  - "`page.getByLabel('See pricing')`"
answer: b
explanation: An `<a href>` element has the role `link`, and its accessible name is its text.
```

## P3 · Today's practice website

Real websites change, go down, or need a VPN — not ideal for learning. Today you'll test two small **practice pages** that live inside your project as HTML text, and load them with `page.setContent(html)` instead of `page.goto(url)`. Everything you learn works the same on real sites.

Create the file `tests/day5/practice-pages.ts`. It's a normal module (Day 4!) that **exports** two HTML strings. Because its name doesn't end in `.spec.ts`, Playwright won't treat it as a test file.

```ts file=tests/day5/practice-pages.ts mode=editor
// Practice web pages for Day 5.
// Each constant holds the HTML of one page. Tests load it with: await page.setContent(loginPage);

// ---------------------------------------------------------------------------
// Page 1: QA Academy sign-in
//   Valid user:   student@qa.academy / Learn@123  → "Signing in…" then (0.8 s later) the Dashboard
//   Empty fields: "Please enter your email and password"
//   Wrong login:  "Invalid email or password"
// ---------------------------------------------------------------------------
export const loginPage = `
<!DOCTYPE html>
<html lang="en">
<head><title>QA Academy - Sign in</title></head>
<body>
  <h1>Sign in to QA Academy</h1>
  <form id="login-form">
    <label for="email">Email</label>
    <input id="email" type="email" placeholder="you@example.com">

    <label for="password">Password</label>
    <input id="password" type="password" placeholder="Your password">

    <label><input id="remember" type="checkbox"> Remember me</label>

    <button type="submit">Sign in</button>
  </form>
  <p id="message" role="alert" data-testid="login-message"></p>

  <script>
    const form = document.getElementById('login-form');
    const message = document.getElementById('message');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (email === '' || password === '') {
        message.textContent = 'Please enter your email and password';
      } else if (email === 'student@qa.academy' && password === 'Learn@123') {
        message.textContent = 'Signing in…';
        setTimeout(showDashboard, 800);          // pretend the server is slow
      } else {
        message.textContent = 'Invalid email or password';
      }
    });

    function showDashboard() {
      document.title = 'QA Academy - Dashboard';
      document.body.innerHTML =
        '<h1>Dashboard</h1>' +
        '<p>Welcome back, Student!</p>' +
        '<ul><li>Week 1 - Fundamentals</li><li>Week 2 - Locators</li><li>Week 3 - Page Objects</li></ul>' +
        '<button id="logout">Log out</button>';
      document.getElementById('logout').addEventListener('click', () => {
        document.title = 'QA Academy - Signed out';
        document.body.innerHTML = '<h1>Signed out</h1><p>See you soon!</p>';
      });
    }
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Page 2: QA Academy course enrolment (used in the Practice mini-project)
// ---------------------------------------------------------------------------
export const enrolPage = `
<!DOCTYPE html>
<html lang="en">
<head><title>QA Academy - Enrol</title></head>
<body>
  <h1>Enrol in a course</h1>
  <form id="enrol-form">
    <label for="name">Full name</label>
    <input id="name" placeholder="e.g. Asha Verma">

    <label for="enrol-email">Email</label>
    <input id="enrol-email" type="text" placeholder="you@example.com">

    <label for="course">Course</label>
    <select id="course">
      <option value="">-- choose a course --</option>
      <option value="pw">Playwright Basics</option>
      <option value="api">API Testing</option>
      <option value="perf">Performance Testing</option>
    </select>

    <label><input id="terms" type="checkbox"> I accept the terms</label>

    <button type="submit" disabled>Enrol now</button>
  </form>
  <p data-testid="seats">Seats left: 12</p>
  <p id="result" role="status"></p>

  <script>
    let seats = 12;
    const terms = document.getElementById('terms');
    const submit = document.querySelector('button[type=submit]');
    const result = document.getElementById('result');

    // The Enrol button is enabled only while the terms box is ticked
    terms.addEventListener('change', () => {
      submit.disabled = !terms.checked;
    });

    document.getElementById('enrol-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('enrol-email').value.trim();
      const course = document.getElementById('course');

      if (name === '') { result.textContent = 'Name is required'; return; }
      if (!email.includes('@')) { result.textContent = 'Enter a valid email'; return; }
      if (course.value === '') { result.textContent = 'Please choose a course'; return; }

      seats = seats - 1;
      document.querySelector('[data-testid=seats]').textContent = 'Seats left: ' + seats;
      const courseName = course.options[course.selectedIndex].text;
      const firstName = name.split(' ')[0];
      result.textContent = 'Thanks, ' + firstName + '! You are enrolled in ' + courseName + '.';
    });
  </script>
</body>
</html>
`;
```

> [!TESTER]
> Read the comments at the top of each page like a requirements document. Your tests will check each rule — just as you'd derive manual test cases from requirements.

# Fundamentals

## F1 · Anatomy of a Playwright test

```ts mode=read
import { test, expect } from '@playwright/test';          // 1. import the tools

test('valid user can sign in', async ({ page }) => {      // 2. test(title, async callback)
  await page.setContent(loginPage);                        // 3. ARRANGE — get to the start state
  await page.getByLabel('Email').fill('student@qa.academy');   // 4. ACT — do what a user does
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading')).toHaveText('Dashboard');   // 5. ASSERT — check the result
});
```

| Part | Meaning |
|---|---|
| `import { test, expect } from '@playwright/test'` | Bring in the test-declaring function and the assertion function |
| `test('valid user can sign in', …)` | Register a test with a **title** that reads like a test-case name |
| `async ({ page }) => { … }` | The test body: an **async** callback. Playwright calls it and passes **fixtures**; we destructure `page` |
| `await page.…` | Each browser step returns a Promise — `await` it |
| `await expect(…).toHaveText(…)` | An **assertion** — the expected result |

The **Arrange → Act → Assert** pattern (also called *Given / When / Then*) keeps tests readable: set up, perform the action, check the outcome.

> [!TIP] Good test titles
> Write titles as behaviour: `'shows an error for a wrong password'`, not `'test2'`. The title is what you'll read in reports at 2 a.m. when something breaks.

```quiz
id: d5-f1-q1
type: single
question: Why is the test body written as `async ({ page }) => { … }`?
options:
  - "`async` makes the test run faster"
  - It's an async callback, so it can use `await`; Playwright passes a fixtures object and `{ page }` destructures the page from it
  - "`page` is a global variable that must be declared this way"
  - It's required by the TypeScript compiler for all functions
answer: b
explanation: The callback must be `async` to use `await`, and `{ page }` picks the page fixture out of the object Playwright passes in.
```

## F2 · Fixtures: tools the runner hands you

**Fixtures** are ready-made objects that Playwright creates **before** your test and cleans up **after** it. You ask for them by name in the callback's parameters.

| Fixture | What you get | Typical use |
|---|---|---|
| `page` | A fresh tab in a fresh context | 95% of UI tests |
| `context` | The browser context that `page` belongs to | Open a second tab, set cookies/permissions |
| `browser` | The shared browser instance | Create extra contexts (multi-user tests), `beforeAll` |
| `browserName` | `'chromium'`, `'firefox'` or `'webkit'` | Browser-specific skips or expectations |
| `request` | An API client — no browser needed | API tests, creating test data via API |

```ts mode=read
test('fixtures demo', async ({ page, context, browserName }) => {
  console.log(`Running on ${browserName}`);
  const secondTab = await context.newPage();   // another tab in the SAME context as page
  // …
});
```

Playwright only creates the fixtures you ask for — and because each test gets its **own** `page` and `context`, tests are isolated from each other (Day 1 · F3).

```quiz
id: d5-f2-q1
type: single
question: A test must check that an admin and a customer see different menus at the same time. Which fixture helps you create two separate sessions?
options:
  - "`browserName`"
  - "`browser` — to create two new contexts"
  - "`request`"
  - Two `page` fixtures in the same test
answer: b
explanation: "`browser.newContext()` twice gives two isolated sessions (admin and customer) in one test — like Day 1's contexts demo."
```

## F3 · Finding elements and acting on them

Week 2 is all about locators. For now, learn the core set.

### Getting to a page

| Method | Use |
|---|---|
| `await page.goto('https://shop.example.com/login')` | Open a URL (with `baseURL` in the config you can write `page.goto('/login')`) |
| `await page.setContent(html)` | Load HTML directly — used for today's practice pages |
| `await page.title()` / `page.url()` | Read the current title / URL |

### Locators — "how to find the element"

Prefer them in this order (user-facing first):

| Locator | Finds… | Example |
|---|---|---|
| `getByRole(role, { name })` | By role + accessible name | `page.getByRole('button', { name: 'Sign in' })` |
| `getByLabel(text)` | Form field by its label | `page.getByLabel('Email')` |
| `getByPlaceholder(text)` | Input by placeholder | `page.getByPlaceholder('you@example.com')` |
| `getByText(text)` | Element by visible text | `page.getByText('Welcome back')` |
| `getByTestId(id)` | By `data-testid` attribute | `page.getByTestId('login-message')` |
| `locator(css)` | By CSS selector (fallback) | `page.locator('#email')` |

Text matching is **case-insensitive and matches part of the text** by default: `getByText('welcome')` finds "Welcome back, Student!". Add `{ exact: true }` for an exact match.

A locator is a **recipe**, not the element itself: creating it doesn't touch the page (so no `await`). The search happens when you act or assert — and that's when auto-waiting kicks in.

```ts mode=read
const signIn = page.getByRole('button', { name: 'Sign in' });   // just a recipe — no await
await signIn.click();                                             // now it finds, waits, clicks
```

### Actions

| Action | Example |
|---|---|
| Click | `await page.getByRole('button', { name: 'Sign in' }).click()` |
| Type into a field (replaces its value) | `await page.getByLabel('Email').fill('student@qa.academy')` |
| Press a key | `await page.getByLabel('Password').press('Enter')` |
| Tick / untick a checkbox | `await page.getByLabel('Remember me').check()` / `.uncheck()` |
| Choose from a `<select>` | `await page.getByLabel('Course').selectOption('API Testing')` |
| Clear a field | `await page.getByLabel('Email').clear()` |

```quiz
id: d5-f3-q1
type: single
question: Which line needs NO `await`?
options:
  - "`page.getByLabel('Email').fill('a@b.com')`"
  - "`const email = page.getByLabel('Email')`"
  - "`page.getByRole('button', { name: 'Save' }).click()`"
  - "`page.setContent(html)`"
answer: b
explanation: Creating a locator only describes how to find the element — it doesn't talk to the browser yet. Actions like fill, click and setContent do, so they're awaited.
```

## F4 · Assertions with `expect`

### Web-first assertions — auto-retrying (use `await`!)

These keep checking the page until the condition is true or the timeout expires (**5 seconds** by default):

| Assertion | Passes when… |
|---|---|
| `await expect(locator).toBeVisible()` | the element is visible |
| `await expect(locator).toBeHidden()` | it's hidden or doesn't exist |
| `await expect(locator).toHaveText('Dashboard')` | its text **equals** this (regex allowed: `/Dash/`) |
| `await expect(locator).toContainText('Welcome')` | its text **contains** this |
| `await expect(locator).toHaveValue('a@b.com')` | an input's current value is this |
| `await expect(locator).toBeChecked()` | a checkbox/radio is ticked |
| `await expect(locator).toBeEnabled()` / `.toBeDisabled()` | the element is (not) enabled |
| `await expect(locator).toHaveCount(3)` | the locator matches exactly 3 elements |
| `await expect(locator).toHaveAttribute('type', 'email')` | an attribute has this value |
| `await expect(page).toHaveTitle(/Dashboard/)` | the tab title matches |
| `await expect(page).toHaveURL(/dashboard/)` | the URL matches |

Add `.not` to invert: `await expect(page.getByRole('alert')).not.toBeEmpty()`, `await expect(button).not.toBeVisible()`.

### Generic assertions — check a plain value once (no `await`)

For values you already have in a variable — no retrying:

| Assertion | Example |
|---|---|
| `toBe` (strict equal, like `===`) | `expect(total).toBe(3)` |
| `toEqual` (same content — for objects/arrays) | `expect(tags).toEqual(['@smoke', '@login'])` |
| `toContain` | `expect(title).toContain('Academy')` |
| `toBeTruthy` / `toBeFalsy` | `expect(isVisible).toBeTruthy()` |
| `toBeGreaterThan` / `toBeLessThan` | `expect(price).toBeGreaterThan(0)` |
| `toHaveLength` | `expect(items).toHaveLength(3)` |

```ts mode=read
// ❌ Flaky: reads the text ONCE, maybe before the page updated
const text = await page.getByRole('alert').textContent();
expect(text).toBe('Invalid email or password');

// ✅ Reliable: retries until the text matches (up to 5 s)
await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
```

> [!WARNING]
> Prefer **web-first** assertions for anything on the page. Use generic assertions only for plain values (numbers you calculated, arrays, API data).

You can add a custom message that appears in the report when the assertion fails:

```ts mode=read
await expect(page.getByRole('heading'), 'user should land on the dashboard').toHaveText('Dashboard');
```

```quiz
id: d5-f4-q1
type: single
question: After clicking "Sign in" with a wrong password, the page's script shows "Invalid email or password" — on a slow machine this can take a moment. Which assertion is reliable?
options:
  - "`expect(await page.getByRole('alert').textContent()).toBe('Invalid email or password')`"
  - "`await expect(page.getByRole('alert')).toHaveText('Invalid email or password')`"
  - "`expect(page.getByRole('alert')).toHaveText('Invalid email or password')` without await"
  - "`page.waitForTimeout(800)` then a generic toBe"
answer: b
explanation: The web-first assertion retries until it matches. Option A reads the text once (maybe too early). Option C forgets await. Fixed waits (D) are slow and still flaky.
```

```quiz
id: d5-f4-q2
type: single
question: What's the difference between `toHaveText('Welcome')` and `toContainText('Welcome')`?
options:
  - None
  - "`toHaveText` needs the whole text to match; `toContainText` passes if 'Welcome' appears anywhere in it"
  - "`toContainText` is case-sensitive, `toHaveText` isn't"
  - "`toHaveText` only works on headings"
answer: b
explanation: For "Welcome back, Student!", `toContainText('Welcome')` passes but `toHaveText('Welcome')` fails (with a plain string, toHaveText compares the full text).
```

## F5 · Grouping tests and sharing setup: `describe` and hooks

### `test.describe` — a group (like a test suite / folder in a test-management tool)

```ts mode=read
test.describe('Sign in page', () => {
  test('valid user reaches the dashboard', async ({ page }) => { /* … */ });
  test('wrong password shows an error', async ({ page }) => { /* … */ });
});
```

Report titles include the group: `Sign in page › wrong password shows an error`. Groups can be nested.

### Hooks — run code around tests

| Hook | Runs | Gets `page`? | Typical use |
|---|---|---|---|
| `test.beforeEach` | before **each** test in the file/group | ✅ yes | open the page, log in |
| `test.afterEach` | after **each** test | ✅ yes | extra clean-up, logging |
| `test.beforeAll` | **once** before all tests in the file/group (per worker) | ❌ no — use `browser` | expensive one-time setup, e.g. create test data via API |
| `test.afterAll` | **once** after all tests (per worker) | ❌ no | delete test data |

```mermaid
flowchart TD
  BA["beforeAll (once)"] --> BE1["beforeEach"] --> T1["test 1"] --> AE1["afterEach"]
  AE1 --> BE2["beforeEach"] --> T2["test 2"] --> AE2["afterEach"]
  AE2 --> AA["afterAll (once)"]
```

Hooks declared **inside** a `describe` apply only to tests in that group; hooks at the top of the file apply to every test in the file.

> [!NOTE] "Per worker"
> With parallel workers, each worker process runs its **own** `beforeAll`/`afterAll` for the tests it receives. Don't rely on `beforeAll` to share state between tests — each test should be able to run on its own.

```quiz
id: d5-f5-q1
type: single
question: A file has `beforeAll`, `beforeEach` and 3 tests, all run by ONE worker. How many times does each hook run?
options:
  - beforeAll 3, beforeEach 3
  - beforeAll 1, beforeEach 3
  - beforeAll 1, beforeEach 1
  - beforeAll 3, beforeEach 1
answer: b
explanation: beforeAll runs once per worker for the file; beforeEach runs before every test.
```

```quiz
id: d5-f5-q2
type: single
question: "Why does `test.beforeAll(async ({ page }) => { … })` throw an error?"
options:
  - beforeAll cannot be async
  - The `page` fixture is created per test, so it isn't available in beforeAll — use `browser` instead
  - beforeAll must be inside a describe
  - Hooks can't receive fixtures at all
answer: b
explanation: "`page` belongs to a single test. `beforeAll` runs outside any single test, so it can only use worker-level fixtures such as `browser`."
```

## F6 · Controlling which tests run: annotations and tags

| Annotation | Effect |
|---|---|
| `test.only('…', …)` | Run **only** this test (and other `.only` tests). Handy while writing — never commit it! |
| `test.skip('…', …)` | Don't run this test; report it as skipped |
| `test.skip(condition, 'reason')` *(inside a test)* | Skip only when the condition is true, e.g. `test.skip(browserName === 'webkit', 'Feature not supported in Safari yet')` |
| `test.fixme('…', …)` | Skip because the **test** needs fixing (marks it as "fixme" in the report) |
| `test.fail()` *(inside a test)* | "This test is expected to fail" (known bug) — it passes when it fails, and alerts you when it starts passing |
| `test.slow()` *(inside a test)* | Triple the timeout for this test |

The config line `forbidOnly: !!process.env.CI` makes CI **fail** if someone left a `test.only` in the code — otherwise CI would silently run only one test.

### Tags

Tags label tests so you can run subsets such as smoke or regression packs:

```ts mode=read
test('valid user reaches the dashboard', { tag: '@smoke' }, async ({ page }) => { /* … */ });

test('remember-me box can be ticked', { tag: ['@regression', '@login'] }, async ({ page }) => { /* … */ });

test.describe('Enrolment', { tag: '@enrol' }, () => { /* every test inside gets @enrol */ });
```

(Tags written inside the title, like `'login works @smoke'`, also work.)

```bash terminal
npx playwright test --grep @smoke            # only tests tagged @smoke
npx playwright test --grep-invert @slow      # everything EXCEPT @slow
npx playwright test --grep "@smoke|@login"   # @smoke OR @login
```

```quiz
id: d5-f6-q1
type: single
question: A teammate pushed code with `test.only` still in it. What happens on CI with the generated config?
options:
  - CI runs only that one test and reports success
  - CI fails the run, because `forbidOnly` is true when the CI variable is set
  - CI ignores `.only`
  - CI deletes the test
answer: b
explanation: "`forbidOnly: !!process.env.CI` turns a leftover `.only` into a failure on CI, protecting the full suite from being silently skipped."
```

## F7 · What the runner does when you press Run

```mermaid
flowchart LR
  A["1. Load config<br/>playwright.config.ts"] --> B["2. Discover tests<br/>*.spec.ts in testDir"]
  B --> C["3. Multiply by projects<br/>(chromium, firefox, webkit)"]
  C --> D["4. Distribute to workers<br/>(parallel processes)"]
  D --> E["5. For each test:<br/>fixtures → hooks → body → teardown"]
  E --> F["6. Retry failures<br/>(if retries > 0)"]
  F --> G["7. Report<br/>list, html…"]
```

### Timeouts to remember

| Timeout | Default | Change it with |
|---|---|---|
| Whole test — the body plus `beforeEach` hooks and fixture setup | **30 s** | `timeout` in the config, `--timeout=60000`, or `test.setTimeout(60000)` |
| Each web-first assertion (`expect`) | **5 s** | `expect: { timeout: 10000 }` in the config, or `{ timeout: 10000 }` on one assertion |
| Each action (`click`, `fill`…) | no separate limit — bounded by the test timeout | `use: { actionTimeout: 10000 }` |

### Results you can get

| Status | Meaning |
|---|---|
| ✓ **passed** | Everything worked |
| ✘ **failed** | An action/assertion failed or timed out |
| **flaky** | Failed first, then **passed on retry** — investigate! |
| **skipped** | Skipped by `test.skip` / `test.fixme` |

When any test fails, the command ends with a non-zero **exit code** — that's how CI knows the build is red.

```quiz
id: d5-f7-q1
type: single
question: "With `retries: 1`, a test fails on the first attempt and passes on the retry. How is it reported?"
options:
  - passed
  - failed
  - flaky
  - skipped
answer: c
explanation: Passing only on retry means the result isn't consistent. Playwright marks it flaky so you can investigate the root cause.
```

# Implementation

## I1 · Your first test from scratch

Make sure `tests/day5/practice-pages.ts` exists (Prerequisites · P3). Now create `tests/day5/first.spec.ts`:

```ts file=tests/day5/first.spec.ts mode=editor run="npx playwright test tests/day5/first.spec.ts --project=chromium --headed"
import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';   // our practice page (no .ts needed in test files)

test('valid user can sign in', async ({ page }) => {
  // Arrange: open the sign-in page
  await page.setContent(loginPage);
  await expect(page).toHaveTitle('QA Academy - Sign in');

  // Act: sign in like a user would
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: the dashboard appears (after ~0.8 s — Playwright waits for it)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome back')).toBeVisible();
  await expect(page).toHaveTitle(/Dashboard/);
});
```

```bash terminal
npx playwright test tests/day5/first.spec.ts --project=chromium --headed
```

```output terminal
Running 1 test using 1 worker

  ✓  1 [chromium] › tests/day5/first.spec.ts:4:5 › valid user can sign in (1.2s)

  1 passed (1.9s)
```

Watch the browser pane: the form fills in, "Signing in…" shows briefly, then the Dashboard appears.

**Try it:** change `'Learn@123'` to `'learn@123'` (lowercase L) and run again. Read the error — which line failed, what was expected, what was received? Then change it back.

## I2 · A complete suite with `describe`, `beforeEach` and tags

Now test **every rule** of the sign-in page. Opening the page is the same for every test, so it moves into `beforeEach`.

```ts file=tests/day5/login.spec.ts mode=editor run="npx playwright test tests/day5/login.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

test.describe('Sign in page', () => {
  // Runs before EACH test in this group: every test starts on a fresh sign-in page
  test.beforeEach(async ({ page }) => {
    await page.setContent(loginPage);
  });

  test('shows the sign-in form', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeEmpty();
    await expect(page.getByPlaceholder('you@example.com')).toHaveAttribute('type', 'email');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('valid user reaches the dashboard', { tag: '@smoke' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Signing in…');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);   // three course weeks listed
  });

  test('wrong password shows an error', { tag: '@regression' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeHidden();
  });

  test('empty form shows a validation message', { tag: '@regression' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('login-message')).toHaveText('Please enter your email and password');
  });

  test('pressing Enter submits the form', { tag: '@regression' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByLabel('Password').press('Enter');   // keyboard instead of mouse
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('remember-me can be ticked and unticked', { tag: '@regression' }, async ({ page }) => {
    const rememberMe = page.getByRole('checkbox', { name: 'Remember me' });   // a locator in a variable
    await expect(rememberMe).not.toBeChecked();
    await rememberMe.check();
    await expect(rememberMe).toBeChecked();
    await rememberMe.uncheck();
    await expect(rememberMe).not.toBeChecked();
  });
});
```

```bash terminal
npx playwright test tests/day5/login.spec.ts --project=chromium
```

```output terminal
Running 6 tests using 4 workers

  ✓  1 [chromium] › tests/day5/login.spec.ts:10:7 › Sign in page › shows the sign-in form @smoke (240ms)
  ✓  2 [chromium] › tests/day5/login.spec.ts:27:7 › Sign in page › wrong password shows an error @regression (260ms)
  ✓  3 [chromium] › tests/day5/login.spec.ts:36:7 › Sign in page › empty form shows a validation message @regression (180ms)
  ✓  4 [chromium] › tests/day5/login.spec.ts:17:7 › Sign in page › valid user reaches the dashboard @smoke (1.1s)
  ✓  5 [chromium] › tests/day5/login.spec.ts:41:7 › Sign in page › pressing Enter submits the form @regression (1.0s)
  ✓  6 [chromium] › tests/day5/login.spec.ts:48:7 › Sign in page › remember-me can be ticked and unticked @regression (150ms)

  6 passed (2.4s)
```

Notice: `fullyParallel: true` lets tests from the same file run at the same time, so they may finish in a different order each run. That's fine — every test is independent thanks to `beforeEach` and fresh pages.

```quiz
id: d5-i2-q1
type: single
question: Why is `await page.setContent(loginPage)` in `beforeEach` and not in a `beforeAll`?
options:
  - "`beforeAll` is slower"
  - "`beforeAll` can't use the `page` fixture, and every test needs its own fresh page anyway"
  - "`beforeEach` runs only once"
  - There is no difference
answer: b
explanation: Each test gets its own new page, so opening the practice page must happen per test — in beforeEach, which also has access to `page`.
```

## I3 · Filter, list, tag and skip

Run subsets of your suite:

```bash terminal
# only smoke tests
npx playwright test tests/day5 --grep @smoke --project=chromium

# everything except smoke tests
npx playwright test tests/day5 --grep-invert @smoke --project=chromium

# titles containing "error"
npx playwright test tests/day5 -g "error" --project=chromium

# what would run in ALL browsers, without running it
npx playwright test tests/day5/login.spec.ts --list
```

```output terminal
Listing tests:
  [chromium] › day5/login.spec.ts:10:7 › Sign in page › shows the sign-in form @smoke
  [chromium] › day5/login.spec.ts:17:7 › Sign in page › valid user reaches the dashboard @smoke
  …
  [webkit] › day5/login.spec.ts:48:7 › Sign in page › remember-me can be ticked and unticked @regression
Total: 18 tests in 1 file
```

6 tests × 3 projects = 18.

Now try the annotations. Create `tests/day5/annotations.spec.ts`:

```ts file=tests/day5/annotations.spec.ts mode=editor run="npx playwright test tests/day5/annotations.spec.ts"
import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

test('runs everywhere', async ({ page }) => {
  await page.setContent(loginPage);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('skipped on WebKit only', async ({ page, browserName }) => {
  // Conditional skip: imagine a known Safari-only issue
  test.skip(browserName === 'webkit', 'Known Safari issue BUG-123');
  await page.setContent(loginPage);
  await expect(page.getByLabel('Remember me')).not.toBeChecked();
});

test.skip('password reset link', async ({ page }) => {
  // Not built yet — skipped for everyone
});

test.fixme('sign in with Google', async ({ page }) => {
  // The test itself needs work — shows as "fixme" in the report
});
```

```bash terminal
npx playwright test tests/day5/annotations.spec.ts
```

```output terminal
Running 12 tests using 4 workers

  ✓   1 [chromium] › tests/day5/annotations.spec.ts:4:5 › runs everywhere (210ms)
  ✓   2 [chromium] › tests/day5/annotations.spec.ts:9:5 › skipped on WebKit only (190ms)
  -   3 [chromium] › tests/day5/annotations.spec.ts:16:6 › password reset link
  -   4 [chromium] › tests/day5/annotations.spec.ts:20:6 › sign in with Google
  ✓   5 [firefox] › tests/day5/annotations.spec.ts:4:5 › runs everywhere (520ms)
  …
  -  11 [webkit] › tests/day5/annotations.spec.ts:9:5 › skipped on WebKit only
  …

  7 skipped
  5 passed (3.1s)
```

> [!TIP] `test.only` while you work
> Change one `test(` to `test.only(` and run the file — only that test runs. Remove `.only` before you commit: on CI it fails the whole run (`forbidOnly`).

## I4 · See the hooks run in order

```ts file=tests/day5/hooks.spec.ts mode=editor run="npx playwright test tests/day5/hooks.spec.ts --project=chromium --workers=1"
import { test, expect } from '@playwright/test';

test.beforeAll(async () => {
  console.log('beforeAll  → once, before the tests');
});

test.beforeEach(async ({ page }) => {
  console.log('beforeEach → before each test');
  await page.setContent('<h1>Hooks demo</h1>');
});

test.afterEach(async () => {
  console.log('afterEach  → after each test');
});

test.afterAll(async () => {
  console.log('afterAll   → once, after the tests');
});

test('first test', async ({ page }) => {
  console.log('test body  → first test');
  await expect(page.getByRole('heading')).toHaveText('Hooks demo');
});

test('second test', async ({ page }) => {
  console.log('test body  → second test');
  await expect(page.getByRole('heading')).toBeVisible();
});
```

`--workers=1` makes the tests run one after another so the order is easy to read:

```bash terminal
npx playwright test tests/day5/hooks.spec.ts --project=chromium --workers=1
```

```output terminal
Running 2 tests using 1 worker

beforeAll  → once, before the tests
beforeEach → before each test
test body  → first test
afterEach  → after each test
  ✓  1 [chromium] › tests/day5/hooks.spec.ts:20:5 › first test (160ms)
beforeEach → before each test
test body  → second test
afterEach  → after each test
afterAll   → once, after the tests
  ✓  2 [chromium] › tests/day5/hooks.spec.ts:25:5 › second test (40ms)

  2 passed (900ms)
```

**Try it:** run the same command **without** `--workers=1`. If Playwright starts two or more workers (the default is half your CPU cores), each worker runs its own `beforeAll` and `afterAll` — you'll see them printed more than once.

## I5 · Debug a failing test

Create a test with two deliberate mistakes:

```ts file=tests/day5/broken.spec.ts mode=editor expect=error run="npx playwright test tests/day5/broken.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

test('wrong expected text', async ({ page }) => {
  await page.setContent(loginPage);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Mistake 1: the real message is "Please enter your email and password"
  await expect(page.getByRole('alert')).toHaveText('Email is required');
});

test('element that does not exist', async ({ page }) => {
  test.setTimeout(5000);   // fail faster than the default 30 s while we practise
  await page.setContent(loginPage);
  // Mistake 2: there is no "Log in" button — it's called "Sign in"
  await page.getByRole('button', { name: 'Log in' }).click();
});
```

```bash terminal
npx playwright test tests/day5/broken.spec.ts --project=chromium
```

```output terminal
  1) [chromium] › tests/day5/broken.spec.ts:4:5 › wrong expected text ─────────────

    Error: expect(locator).toHaveText(expected) failed

    Locator:  getByRole('alert')
    Expected: "Email is required"
    Received: "Please enter your email and password"
    Timeout:  5000ms

       6 |   await page.getByRole('button', { name: 'Sign in' }).click();
       7 |   // Mistake 1: the real message is "Please enter your email and password"
    >  8 |   await expect(page.getByRole('alert')).toHaveText('Email is required');
         |                                         ^

  2) [chromium] › tests/day5/broken.spec.ts:11:5 › element that does not exist ──────

    Test timeout of 5000ms exceeded.

    Error: locator.click: Test timeout of 5000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: 'Log in' })

      14 |   // Mistake 2: there is no "Log in" button — it's called "Sign in"
    > 15 |   await page.getByRole('button', { name: 'Log in' }).click();
         |                                                      ^

  2 failed
```

Two very different failures:

| Failure | Clue in the output | Typical cause |
|---|---|---|
| **Assertion failed** | `Expected: …` vs `Received: …` | Wrong expectation — or a real bug in the app |
| **Timeout waiting for an element** | `waiting for getByRole('button', { name: 'Log in' })` | Wrong locator, element never appears, or appears too late |

### Your debugging toolbox

| Tool | Command | Best for |
|---|---|---|
| Error output | *(always shown)* | First look: which line, expected vs received |
| HTML report | `npx playwright show-report` | Browsing failures, steps and timings; screenshots/traces when enabled |
| Headed mode | `--headed` | Watching what really happens |
| Inspector | `npx playwright test tests/day5/broken.spec.ts --debug` | Stepping through one action at a time |
| UI Mode | `npx playwright test --ui` | Watch mode, time-travel through each step |

Fix both mistakes (`'Please enter your email and password'` and `'Sign in'`), remove the `test.setTimeout` line, and run again until it's green.

## I6 · Read the HTML report

```bash terminal
npx playwright test tests/day5 --project=chromium
npx playwright show-report
```

In the report:

1. Use the filters at the top (**Passed / Failed / Flaky / Skipped**) and the search box — try typing `@smoke`.
2. Click a test to see every step (`setContent`, `fill`, `click`, `expect …`) with its duration.
3. Failed tests show the same error as the terminal, plus attachments when screenshots or traces are enabled in the config.

Press `Ctrl + C` in the terminal to stop the report server when you're done.

# Practice

## Quiz · Day 5 check

```quiz
id: d5-pr-q1
type: single
question: Which file names will Playwright pick up as tests in `tests/`? (Choose the best answer)
options:
  - Any .ts file
  - Files ending in .spec.ts or .test.ts
  - Only example.spec.ts
  - Files that start with "test"
answer: b
explanation: That's why `practice-pages.ts` is treated as a normal module, not a test file.
```

```quiz
id: d5-pr-q2
type: single
question: Which assertion checks that an input field contains the text the user typed?
options:
  - "`toHaveText`"
  - "`toHaveValue`"
  - "`toContainText`"
  - "`toHaveTitle`"
answer: b
explanation: An input's typed content is its *value*, not its text. Use `await expect(locator).toHaveValue('…')`.
```

```quiz
id: d5-pr-q3
type: single
question: What is the default timeout for a whole test, and for one web-first assertion?
options:
  - 5 s and 30 s
  - 30 s and 5 s
  - 60 s and 10 s
  - No limit for both
answer: b
explanation: "A test may take up to 30 s (its body plus beforeEach hooks and fixture setup; afterEach and beforeAll/afterAll get their own limit of the same length). Each expect retries for up to 5 s."
```

```quiz
id: d5-pr-q4
type: multiple
question: Which of these are valid ways to tag a test as @smoke? (Select all that apply)
options:
  - "`test('login works', { tag: '@smoke' }, async ({ page }) => {…})`"
  - "`test('login works @smoke', async ({ page }) => {…})`"
  - "`test.smoke('login works', async ({ page }) => {…})`"
  - "`test.describe('Login', { tag: '@smoke' }, () => {…})` around the test"
answer: [a, b, d]
explanation: Tags go in the details object, in the title, or on a describe (applies to every test inside). There is no `test.smoke`.
```

```quiz
id: d5-pr-q5
type: single
question: "`test.skip(browserName === 'firefox', 'Upload not supported')` is written inside a test. When is the test skipped?"
options:
  - Always
  - Only when it runs in the firefox project
  - Never — skip must be outside the test
  - Only on CI
answer: b
explanation: The conditional form of `test.skip` skips only when the condition is true.
```

```quiz
id: d5-pr-q6
type: single
question: "`getByText('welcome')` — does it match an element with the text \"Welcome back, Student!\"?"
options:
  - No — it's case-sensitive and needs the whole text
  - Yes — by default text matching is case-insensitive and matches a substring
  - Only if you add `{ exact: true }`
  - Only inside a describe
answer: b
explanation: "Default text matching is case-insensitive and partial. `{ exact: true }` makes it case-sensitive and whole-string."
```

```quiz
id: d5-pr-q7
type: single
question: You run `npx playwright test --grep @smoke --project=firefox`. Two files contain 3 and 4 tests; 2 tests in total are tagged @smoke. How many test runs?
options:
  - "2"
  - "6"
  - "7"
  - "21"
answer: a
explanation: "Only the 2 @smoke tests are selected, and only one project runs: 2 × 1 = 2."
```

```quiz
id: d5-pr-q8
type: single
question: What is the MAIN purpose of `beforeEach` in a Playwright test file?
options:
  - To run the tests faster
  - To put shared setup (like opening the page) in one place so every test starts from the same state
  - To share a single page between all tests
  - To skip tests
answer: b
explanation: It removes repetition and guarantees each test begins from a known state — while each test still gets its own fresh page.
```

## Spot the bug

````exercise
id: d5-bug1
title: Four bugs, one test file
level: medium
type: code
prompt: |
  This file has **four** bugs. Some make tests fail, some make them unreliable, one breaks CI. Find and fix them all, then save the fixed version as `tests/day5/bugs.spec.ts` and run it.

  ```ts
  import { test, expect } from '@playwright/test';
  import { loginPage } from './practice-pages';

  test.beforeAll(async ({ page }) => {
    await page.setContent(loginPage);
  });

  test.only('wrong password shows an error', async ({ page }) => {
    await page.setContent(loginPage);
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('nope');
    page.getByRole('button', { name: 'Sign in' }).click();
    expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  });
  ```
file: tests/day5/bugs.spec.ts
run: npx playwright test tests/day5/bugs.spec.ts --project=chromium
hints:
  - Which fixtures are available in beforeAll?
  - Which lines talk to the browser but have no `await`?
  - What does `forbidOnly` do on CI?
solution: |
  import { test, expect } from '@playwright/test';
  import { loginPage } from './practice-pages';

  // Bug 1: beforeAll can't use `page` → use beforeEach (and remove the duplicate setContent in the test)
  test.beforeEach(async ({ page }) => {
    await page.setContent(loginPage);
  });

  // Bug 2: test.only would fail CI (forbidOnly) and hide all other tests → plain test()
  test('wrong password shows an error', async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('nope');
    // Bug 3: missing await on the click
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Bug 4: missing await on the web-first assertion
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  });
````

## Exercises

````exercise
id: d5-ex1
title: Test the log-out flow
level: easy
type: code
prompt: |
  Create `tests/day5/logout.spec.ts` with one test, `user can log out`:

  1. Sign in as `student@qa.academy` / `Learn@123`.
  2. Wait for the Dashboard heading.
  3. Click **Log out**.
  4. Assert the heading **Signed out** is visible, the text **See you soon!** is visible, and the title contains `Signed out`.
file: tests/day5/logout.spec.ts
run: npx playwright test tests/day5/logout.spec.ts --project=chromium --headed
hints:
  - "`page.getByRole('button', { name: 'Log out' })`"
  - "`await expect(page).toHaveTitle(/Signed out/)`"
solution: |
  import { test, expect } from '@playwright/test';
  import { loginPage } from './practice-pages';

  test('user can log out', async ({ page }) => {
    // Sign in
    await page.setContent(loginPage);
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Log out
    await page.getByRole('button', { name: 'Log out' }).click();

    // Check the signed-out page
    await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
    await expect(page.getByText('See you soon!')).toBeVisible();
    await expect(page).toHaveTitle(/Signed out/);
  });
````

````exercise
id: d5-ex2
title: Data-driven sign-in errors
level: medium
type: code
prompt: |
  Use a **loop** (Day 4!) to create one test per row of test data. Create `tests/day5/login-data.spec.ts`:

  ```ts
  const invalidLogins = [
    { email: '', password: '', message: 'Please enter your email and password' },
    { email: 'student@qa.academy', password: '', message: 'Please enter your email and password' },
    { email: 'nobody@qa.academy', password: 'Learn@123', message: 'Invalid email or password' },
    { email: 'student@qa.academy', password: 'learn@123', message: 'Invalid email or password' },
  ];
  ```

  For each row, register a test titled like `rejects "nobody@qa.academy" / "Learn@123"` that fills the fields, clicks **Sign in** and checks the alert text. Put all tests inside `test.describe('Invalid sign-in')` with a `beforeEach` that loads the page.

  Run with `--project=chromium` — you should see **4** tests.
file: tests/day5/login-data.spec.ts
run: npx playwright test tests/day5/login-data.spec.ts --project=chromium
hints:
  - "Put `for (const data of invalidLogins) { test(`rejects ...`, async ({ page }) => { … }); }` inside the describe."
  - Test titles must be unique — including the email and password makes them unique.
  - "`fill('')` is fine for empty fields."
solution: |
  import { test, expect } from '@playwright/test';
  import { loginPage } from './practice-pages';

  // Test data: one row = one test
  const invalidLogins = [
    { email: '', password: '', message: 'Please enter your email and password' },
    { email: 'student@qa.academy', password: '', message: 'Please enter your email and password' },
    { email: 'nobody@qa.academy', password: 'Learn@123', message: 'Invalid email or password' },
    { email: 'student@qa.academy', password: 'learn@123', message: 'Invalid email or password' },
  ];

  test.describe('Invalid sign-in', () => {
    test.beforeEach(async ({ page }) => {
      await page.setContent(loginPage);
    });

    // Create one test per data row
    for (const data of invalidLogins) {
      test(`rejects "${data.email}" / "${data.password}"`, async ({ page }) => {
        await page.getByLabel('Email').fill(data.email);
        await page.getByLabel('Password').fill(data.password);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert')).toHaveText(data.message);
      });
    }
  });
````

````exercise
id: d5-ex3
title: Run exactly what you need
level: easy
type: terminal
prompt: |
  Write (and run) the command for each:

  1. Only the `@smoke` tests in `tests/day5`, Chromium only.
  2. Every test in `tests/day5` **except** `@smoke`, one worker, Firefox only.
  3. Only tests with `dashboard` in the title, with the browser visible.
  4. List all tests in `tests/day5/login.spec.ts` for WebKit without running them.
  5. Re-run only the tests that failed last time, then open the HTML report.
solution: |
  npx playwright test tests/day5 --grep @smoke --project=chromium
  npx playwright test tests/day5 --grep-invert @smoke --workers=1 --project=firefox
  npx playwright test -g "dashboard" --headed
  npx playwright test tests/day5/login.spec.ts --project=webkit --list
  npx playwright test --last-failed
  npx playwright show-report
````

## Week 1 mini-project · Test the enrolment page

````exercise
id: d5-project
title: "Mini-project: automate the QA Academy enrolment page"
level: challenge
type: code
prompt: |
  You've received these requirements for the **enrolment page** (`enrolPage` in `practice-pages.ts`). Like a manual tester, first list your test cases — then automate them in `tests/day5/enrol.spec.ts`.

  **Requirements**
  - **R1** The page title is `QA Academy - Enrol` and the heading is `Enrol in a course`.
  - **R2** The **Enrol now** button is **disabled** until *I accept the terms* is ticked, and disabled again when it is unticked.
  - **R3** Submitting without a name shows `Name is required`.
  - **R4** An email without `@` shows `Enter a valid email`.
  - **R5** Submitting without choosing a course shows `Please choose a course`.
  - **R6** A valid enrolment (name `Asha Verma`, email `asha@example.com`, course **API Testing**) shows `Thanks, Asha! You are enrolled in API Testing.`
  - **R7** After a successful enrolment, `Seats left` goes from **12** to **11**.

  **Your suite must**
  - use `test.describe('Enrolment page', …)` and a `beforeEach` that loads the page,
  - have at least **7** tests (one per requirement — R6 and R7 may share one test if you prefer 6),
  - tag R1 and R6 with `@smoke`, the rest with `@regression`,
  - use user-facing locators (`getByRole`, `getByLabel`, `getByTestId`) and web-first assertions only,
  - pass on **chromium** and **firefox**.

  Then run:
  ```
  npx playwright test tests/day5/enrol.spec.ts --project=chromium --project=firefox
  npx playwright test tests/day5/enrol.spec.ts --grep @smoke
  npx playwright show-report
  ```
file: tests/day5/enrol.spec.ts
run: npx playwright test tests/day5/enrol.spec.ts --project=chromium --project=firefox
hints:
  - "The course dropdown has the label Course: `page.getByLabel('Course').selectOption('API Testing')` (by visible text or by value 'api')."
  - "The seats text has a test id: `page.getByTestId('seats')`."
  - "To test R3–R5 the Enrol button must be enabled — tick the terms box first."
  - Write a small helper function inside the file (e.g. `fillForm(page, name, email, course)`) to avoid repeating the same fills. Its `page` parameter can be typed with `import { type Page } from '@playwright/test'`.
rubric:
  - All 7 requirements have at least one assertion
  - describe + beforeEach used; no test depends on another test
  - Correct tags; `--grep @smoke` runs exactly the R1 and R6 tests
  - Every browser action and web-first assertion is awaited
  - Passes on chromium and firefox
solution: |
  import { test, expect, type Page } from '@playwright/test';
  import { enrolPage } from './practice-pages';

  // Helper: fill the form (empty strings leave a field blank) and accept the terms
  async function fillForm(page: Page, name: string, email: string, course: string): Promise<void> {
    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Email').fill(email);
    if (course !== '') {
      await page.getByLabel('Course').selectOption(course);
    }
    await page.getByLabel('I accept the terms').check();
  }

  test.describe('Enrolment page', () => {
    test.beforeEach(async ({ page }) => {
      await page.setContent(enrolPage);
    });

    test('R1: shows the correct title and heading', { tag: '@smoke' }, async ({ page }) => {
      await expect(page).toHaveTitle('QA Academy - Enrol');
      await expect(page.getByRole('heading', { name: 'Enrol in a course' })).toBeVisible();
    });

    test('R2: Enrol button follows the terms checkbox', { tag: '@regression' }, async ({ page }) => {
      const enrol = page.getByRole('button', { name: 'Enrol now' });
      const terms = page.getByLabel('I accept the terms');
      await expect(enrol).toBeDisabled();
      await terms.check();
      await expect(enrol).toBeEnabled();
      await terms.uncheck();
      await expect(enrol).toBeDisabled();
    });

    test('R3: name is required', { tag: '@regression' }, async ({ page }) => {
      await fillForm(page, '', 'asha@example.com', 'API Testing');
      await page.getByRole('button', { name: 'Enrol now' }).click();
      await expect(page.getByRole('status')).toHaveText('Name is required');
    });

    test('R4: email must contain @', { tag: '@regression' }, async ({ page }) => {
      await fillForm(page, 'Asha Verma', 'asha.example.com', 'API Testing');
      await page.getByRole('button', { name: 'Enrol now' }).click();
      await expect(page.getByRole('status')).toHaveText('Enter a valid email');
    });

    test('R5: a course must be chosen', { tag: '@regression' }, async ({ page }) => {
      await fillForm(page, 'Asha Verma', 'asha@example.com', '');
      await page.getByRole('button', { name: 'Enrol now' }).click();
      await expect(page.getByRole('status')).toHaveText('Please choose a course');
    });

    test('R6: valid enrolment shows a confirmation', { tag: '@smoke' }, async ({ page }) => {
      await fillForm(page, 'Asha Verma', 'asha@example.com', 'API Testing');
      await page.getByRole('button', { name: 'Enrol now' }).click();
      await expect(page.getByRole('status')).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
    });

    test('R7: seats left goes down by one', { tag: '@regression' }, async ({ page }) => {
      await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
      await fillForm(page, 'Asha Verma', 'asha@example.com', 'Playwright Basics');
      await page.getByRole('button', { name: 'Enrol now' }).click();
      await expect(page.getByTestId('seats')).toHaveText('Seats left: 11');
    });
  });
````

## Week 1 wrap-up

You started the week as a manual tester. You can now:

- ✅ Explain Playwright's architecture and why it reduces flaky tests
- ✅ Create a Playwright project and explain every file in it
- ✅ Read and write TypeScript: variables, types, operators, conditions, loops, functions, async/await, modules
- ✅ Write, organise, tag, filter, run and debug Playwright tests
- ✅ Turn written requirements into an automated test suite

> [!TIP] Coming up in Week 2
> **Locators in depth** (role, text, CSS, XPath, filtering, chaining, strictness), **actions** (hover, drag-and-drop, uploads, dialogs, frames), more **assertions**, and your first **Page Object Model** — moving the "how" out of your tests into `pages/`.
