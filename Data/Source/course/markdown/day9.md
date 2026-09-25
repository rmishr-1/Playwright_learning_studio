---
day: 9
week: 2
title: Playwright Test Runner Basics
subtitle: Write real Playwright tests from scratch — find elements with locators, act on them, assert the results, and control and debug your runs
estimatedTime: 3 hours
topics:
  - Anatomy of a Playwright test
  - Built-in fixtures
  - Locators, actions and assertions
  - Annotations — skip, fixme, fail and slow
  - Running, debugging and reading the report
objectives:
  - Read and write a complete Playwright test, line by line
  - Use the built-in fixtures page and browserName
  - Find elements with the recommended locators, and explain strictness
  - Perform user actions — fill, click, check, selectOption, press
  - Check results with web-first assertions, and know when to use generic ones
  - Mark tests with skip, fixme, fail and slow
  - Debug a failing test using the error message, headed mode, the Inspector and traces
prerequisitesFromEarlierDays:
  - "Day 1: Browser, Context and Page; a test case turned into Playwright steps"
  - "Day 2: auto-waiting and web-first assertions"
  - "Day 3: running tests from the terminal, the HTML report"
  - "Day 6: object destructuring — `{ page }`"
  - "Day 8: async/await, arrow-function callbacks, import/export"
workspace: pw-course/tests/day9/
---

# Prerequisites

## P1 · Checklist before you start

From today you're back in the Playwright project. Run every command from the `pw-course` folder, not from `ts-basics`.

- [ ] Run a single test file in Chromium: `npx playwright test tests/example.spec.ts --project=chromium` (Day 3 · F5)
- [ ] Read `async ({ page }) => { … }` as *"an async arrow function that takes the `page` out of the object Playwright passes in"* (Day 6 · F5, Day 8 · F3, F5)
- [ ] Explain why every browser action gets `await` (Day 8 · F5)
- [ ] Import a named export from another file (Day 8 · F7)

```quiz
id: d9-p1-q1
type: single
question: "In `test('checkout works', async ({ page }) => { … })`, what is `{ page }` doing?"
options:
  - Creating a new page object
  - Taking the page property out of the object Playwright passes to the callback
  - Importing page from @playwright/test
  - Declaring a variable that must be filled in later
answer: b
explanation: "Playwright calls your callback with an object of fixtures; object destructuring picks out page."
```

```quiz
id: d9-p1-q2
type: single
question: "What goes wrong if you write `page.getByRole('button', { name: 'Save' }).click();` without `await`?"
options:
  - A type error stops the test from running
  - The next line may run before the click has happened
  - The click is performed twice
  - Nothing — Playwright adds the await for you
answer: b
explanation: "Without await, the test doesn't wait for the click to finish before moving on (Day 8 · F5)."
```

## P2 · HTML roles — how Playwright "sees" a page

Playwright's recommended way to find elements is the way **users and assistive technologies** (screen readers) see them: by **role** and **accessible name**.

Most HTML elements have a built-in role:

| HTML | Role | Accessible name comes from… |
|---|---|---|
| `<button>Sign in</button>` | `button` | its text → "Sign in" |
| `<a href="/help">Help</a>` | `link` | its text → "Help" |
| `<h1>Dashboard</h1>` (also `h2`–`h6`) | `heading` | its text → "Dashboard" |
| `<input type="text">` or `type="email"`, with a `<label>` | `textbox` | its label → e.g. "Email" |
| `<input type="checkbox">` | `checkbox` | its label → e.g. "Remember me" |
| `<select>` | `combobox` | its label → e.g. "Course" |
| `<option>` inside a `<select>` | `option` | its text |
| `<ul>` / `<li>` | `list` / `listitem` | — |
| `<p role="alert">` | `alert` | an urgent message — role set on purpose by the developer |
| `<p role="status">` | `status` | a status message, such as "Saved" — role set by the developer |

So `page.getByRole('button', { name: 'Sign in' })` means *"the button whose accessible name is Sign in"* — the way you'd describe it in a manual test case.

> [!NOTE]
> A **password** input (`type="password"`) has no role, so `getByRole('textbox')` won't find it. Find it by its label instead: `page.getByLabel('Password')`.

```quiz
id: d9-p2-q1
type: single
question: "Which locator finds `<a href=\"/pricing\">See pricing</a>`?"
options:
  - "`page.getByRole('button', { name: 'See pricing' })`"
  - "`page.getByRole('link', { name: 'See pricing' })`"
  - "`page.getByRole('heading', { name: 'See pricing' })`"
  - "`page.getByLabel('See pricing')`"
answer: b
explanation: "An `<a href>` element has the role link, and its accessible name is its text."
```

## P3 · Today's practice website

Real websites change, go down or need a VPN — not ideal for learning. Today you'll test two small **practice pages** that live inside your project as HTML text. Tests load them with `page.setContent(html)` instead of `page.goto(url)`, just like on Day 1. Everything you learn works the same on real sites.

Create `tests/day9/practice-pages.ts`. It's a normal module (Day 8) that **exports** two HTML strings. Its name doesn't end in `.spec.ts`, so Playwright won't treat it as a test file.

```ts file=tests/day9/practice-pages.ts mode=editor
// Practice web pages for Days 9 and 10.
// Each constant holds the HTML of one page. Tests load it with: await page.setContent(signInPage);

// ---------------------------------------------------------------------------
// Page 1: QA Academy sign-in
//   Valid user:   student@qa.academy / Learn@123 → "Signing in…", then (0.8 s later) the Dashboard
//   Empty fields: "Please enter your email and password"
//   Wrong login:  "Invalid email or password"
//   Dashboard:    "Log out" button → "Signed out" page
// ---------------------------------------------------------------------------
export const signInPage = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>QA Academy - Sign in</title></head>
<body>
  <img alt="QA Academy logo" width="40" height="40" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
  <h1>Sign in to QA Academy</h1>
  <form id="signin-form">
    <label for="email">Email</label>
    <input id="email" type="email" placeholder="you@example.com">

    <label for="password">Password</label>
    <input id="password" type="password" placeholder="Your password">

    <label><input id="remember" type="checkbox"> Remember me</label>

    <button type="submit">Sign in</button>
  </form>
  <a href="#" title="Reset your password">Forgot password?</a>
  <p id="message" role="alert"></p>

  <script>
    const form = document.getElementById('signin-form');
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
        '<h2>Your courses</h2>' +
        '<ul><li>Playwright Basics</li><li>API Testing</li><li>Performance Testing</li></ul>' +
        '<button>Log out</button>';
      document.querySelector('button').addEventListener('click', () => {
        document.title = 'QA Academy - Signed out';
        document.body.innerHTML = '<h1>Signed out</h1><p>See you soon!</p>';
      });
    }
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Page 2: QA Academy course enrolment
//   The "Enrol now" button is enabled only while "I accept the terms" is ticked
//   Checks, in order: name required → email must contain @ → a course must be chosen
//   Success: "Thanks, <first name>! You are enrolled in <course>." and one seat fewer
// ---------------------------------------------------------------------------
export const enrolPage = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>QA Academy - Enrol</title></head>
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

The HTML and `<script>` inside are the website's own code. You don't need to understand them. Read the comments at the top of each page like a **requirements document**: every rule there is something a test can check.

# Fundamentals

## F1 · Anatomy of a Playwright test

On Day 1 you ran TC-101 without understanding every symbol. Now you can read the whole test:

```ts mode=read
import { test, expect } from '@playwright/test';          // ① bring in test() and expect() from the package
import { signInPage } from './practice-pages';             // ② bring in our page's HTML (no .ts needed here)

test('student can sign in', async ({ page }) => {          // ③ register a test: a title + an async callback
  await page.setContent(signInPage);                       // ④ Arrange: open the page

  await page.getByLabel('Email').fill('student@qa.academy');     // ⑤ Act: locate an element, then act on it
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();   // ⑥ Assert
});
```

| # | Part | Manual test case equivalent |
|---|---|---|
| ③ | `test('title', …)` | Test case ID and title |
| ④ | Open the page | Precondition / Step 1 |
| ⑤ | Locate + act | Test steps |
| ⑥ | `expect(…)` | Expected result |

Many testers structure each test as **Arrange → Act → Assert**: set things up, do the actions, check the outcome.

### Rules the runner follows

- **Test files** end in `.spec.ts` and live in the `testDir` folder (`tests`). Any other `.ts` file, like `practice-pages.ts`, is just a helper module.
- `test(…)` only **registers** a test — like the mini runner you built on Day 8. `npx playwright test` then runs the registered tests.
- Every test gets a **brand-new, isolated page**, in its own browser context (Day 1). Nothing — cookies, logins, typed text — leaks from one test to the next. So each test must set up everything it needs, and tests can run in any order.
- A test **fails** when anything in it throws an error: a failed assertion, or an action that can't find its element in time. Otherwise it **passes**.

> [!NOTE]
> In Playwright projects, imports of your own files usually leave out `.ts`: `'./practice-pages'`. Playwright finds the file for you (Day 8 · F7).

```quiz
id: d9-f1-q1
type: single
question: Test A signs in. Test B, in the same file, runs after it and expects to see the dashboard without signing in. What happens?
options:
  - Test B passes, because test A already signed in
  - Test B fails — every test gets a fresh, isolated page, so it starts signed out
  - Test B passes only if the tests run in one worker
  - Test B is skipped automatically
answer: b
explanation: Test isolation — every test starts from a clean browser context, so each test must do its own setup.
```

## F2 · Fixtures — what the runner hands you

The object that Playwright passes to your test callback contains **fixtures**: ready-made tools, set up before the test and cleaned up after it. You ask for the ones you need by name, with destructuring:

| Fixture | What it is |
|---|---|
| `page` | A fresh, isolated browser tab for this test. The one you'll use in almost every test |
| `context` | The isolated browser context that `page` belongs to (Day 1) — for cookies, or opening a second tab |
| `browser` | The browser itself — shared across tests to save time |
| `browserName` | The name of the browser running the test: `'chromium'`, `'firefox'` or `'webkit'` |
| `request` | A tool for calling APIs directly, without a page |

```ts mode=read
test('uses two fixtures', async ({ page, browserName }) => {
  console.log(`Running on ${browserName}`);
  await page.setContent('<h1>Hello</h1>');
});
```

Playwright only prepares the fixtures you ask for. On Day 10 you'll see how to create your **own** fixtures.

```quiz
id: d9-f2-q1
type: single
question: "Which fixture tells a test whether it's running in Firefox?"
options:
  - "`page`"
  - "`browserName`"
  - "`context`"
  - "`request`"
answer: b
explanation: "browserName is 'chromium', 'firefox' or 'webkit'."
```

## F3 · Locators — finding elements

A **locator** describes **how to find** an element: *"the button named Sign in"*. Creating one doesn't touch the page. Playwright only searches when you **act** or **assert** on it, and it searches **again** every time — so a locator never goes stale when the page changes.

```ts mode=read
const signInButton = page.getByRole('button', { name: 'Sign in' });   // just a description — no await needed
await signInButton.click();                                             // now Playwright finds it and clicks
```

### Which locator to use

The Playwright docs recommend these, roughly in this order:

| Locator | Finds… | Example on our pages |
|---|---|---|
| `getByRole(role, { name })` | Elements by role and accessible name. **The first choice** | `page.getByRole('button', { name: 'Sign in' })` |
| `getByLabel(text)` | Form fields by their label | `page.getByLabel('Password')` |
| `getByPlaceholder(text)` | Inputs by their hint text | `page.getByPlaceholder('you@example.com')` |
| `getByText(text)` | Non-interactive text — paragraphs, messages | `page.getByText('Welcome back, Student!')` |
| `getByAltText(text)` | Images by their alt text | `page.getByAltText('QA Academy logo')` |
| `getByTitle(text)` | Elements by their `title` attribute | `page.getByTitle('Reset your password')` |
| `getByTestId(id)` | Elements by `data-testid="…"` — a hook developers add for tests | `page.getByTestId('seats')` |

Why prefer these? They describe the page the way a **user** sees it. A developer can rename a CSS class without breaking your test, but if the *Sign in* button's text changes, the user-facing behaviour really did change.

> [!NOTE] CSS and XPath
> `page.locator('#email')` (CSS) and `page.locator('//input[@id="email"]')` (XPath) also work. The docs advise against them as a first choice: they depend on page structure, which changes often. Use them as a last resort.

### Matching rules

| By default… | To change it |
|---|---|
| Matching ignores upper/lower case: `name: 'sign in'` finds *Sign in* | `{ exact: true }` for exact, case-sensitive matching |
| A **part** of the text is enough: `getByText('Welcome')` finds *Welcome back, Student!* | `{ exact: true }` |
| Extra spaces and line breaks are ignored | — |

### Strictness: one element at a time

An action like `click()` or `fill()` — and an assertion about one element, like `toBeVisible()` or `toHaveText('…')` — must know **exactly one** element. If a locator matches several, Playwright refuses and fails the test, instead of guessing:

```ts mode=read
await page.getByRole('textbox').fill('Asha');   // the enrol page has TWO text boxes…
// Error: locator.fill: Error: strict mode violation: getByRole('textbox') resolved to 2 elements:
//     1) <input id="name" placeholder="e.g. Asha Verma"/> aka getByRole('textbox', { name: 'Full name' })
//     2) <input type="text" id="enrol-email" placeholder="you@example.com"/> aka getByRole('textbox', { name: 'Email' })
```

The error even suggests better locators. Your options:

| Fix | Example |
|---|---|
| Be more specific (best) | `page.getByRole('textbox', { name: 'Full name' })` |
| Filter by text | `page.getByRole('option').filter({ hasText: 'API' })` |
| Pick by position (last resort — breaks if the order changes) | `.first()`, `.last()`, `.nth(1)` (counting from 0) |

Assertions that are about **many** elements, like `toHaveCount`, are happy with several matches.

```quiz
id: d9-f3-q1
type: single
question: "Which locator does the Playwright documentation recommend as the first choice?"
options:
  - "`page.locator('#submit-btn')`"
  - "`page.getByRole('button', { name: 'Submit' })`"
  - "`page.locator('//form/div[3]/button')`"
  - "`page.getByTestId('submit')`"
answer: b
explanation: "Role locators reflect how users and assistive technology see the page. Test ids are a good fallback; CSS and XPath are the last resort."
```

```quiz
id: d9-f3-q2
type: single
question: "A page has three 'Add to cart' buttons. What happens with `await page.getByRole('button', { name: 'Add to cart' }).click();`?"
options:
  - The first button is clicked
  - All three are clicked
  - The test fails with a strict mode violation
  - A random one is clicked
answer: c
explanation: "Actions need exactly one element. Narrow the locator down — for example to the product card you mean — or, as a last resort, use .first() or .nth()."
```

```quiz
id: d9-f3-q3
type: single
question: "The page shows `<p>Order confirmed: #1045</p>`. Does `page.getByText('order confirmed')` find it?"
options:
  - Yes — matching ignores case and a part of the text is enough
  - No — the case is different
  - No — the text must match exactly
  - "Only with `{ exact: true }`"
answer: a
explanation: "By default, text matching is case-insensitive and matches a substring. `{ exact: true }` would make it strict."
```

## F4 · Actions — doing what a user does

Once you have a locator, you act on it. Every action is `await`ed, and before acting, Playwright **auto-waits** until the element is ready — found (exactly one), visible, stable, enabled and not covered by something else, depending on the action (Day 2). `fill`, for example, also waits until the field is editable.

| Action | What it does | Example |
|---|---|---|
| `page.goto(url)` | Opens a URL | `await page.goto('https://example.com');` |
| `page.setContent(html)` | Loads HTML directly (our practice pages) | `await page.setContent(signInPage);` |
| `click()` | Clicks | `await page.getByRole('button', { name: 'Sign in' }).click();` |
| `fill(text)` | Clears a field and enters the text (all at once) | `await page.getByLabel('Email').fill('a@b.com');` |
| `press(key)` | Presses a key, like Enter or Tab | `await page.getByLabel('Password').press('Enter');` |
| `check()` / `uncheck()` | Ticks / unticks a checkbox or radio button | `await page.getByLabel('Remember me').check();` |
| `selectOption(…)` | Chooses from a `<select>` list, by visible text or value | `await page.getByLabel('Course').selectOption('API Testing');` |

```quiz
id: d9-f4-q1
type: single
question: "Which line chooses 'Playwright Basics' in the Course drop-down list?"
options:
  - "`await page.getByLabel('Course').fill('Playwright Basics');`"
  - "`await page.getByLabel('Course').selectOption('Playwright Basics');`"
  - "`await page.getByLabel('Course').check('Playwright Basics');`"
  - "`await page.getByText('Playwright Basics').fill();`"
answer: b
explanation: "selectOption chooses from a `<select>` list, by the option's visible text or its value."
```

## F5 · Assertions — checking the expected result

`expect(…)` checks that something is as expected. There are two kinds, and the difference matters.

### Web-first assertions: `await expect(locator or page)…`

These check the **page**, and they **keep retrying** until the condition is true, or until the timeout (5 seconds by default) runs out. That's why they're reliable on pages that change (Day 2). They must be `await`ed.

| Assertion | Passes when… |
|---|---|
| `toBeVisible()` / `toBeHidden()` | The element is shown / not shown **or not on the page at all** |
| `toHaveText(text)` | The element's **whole** text equals this. Case matters; extra spaces are ignored. Unlike locators, a part is **not** enough — use `toContainText` or a regular expression like `/Welcome/` for that |
| `toContainText(text)` | The element's text **contains** this part |
| `toHaveValue(value)` | An input or select has this value |
| `toBeEmpty()` | An input has no value |
| `toBeChecked()` | A checkbox is ticked |
| `toBeEnabled()` / `toBeDisabled()` | The element can / can't be used |
| `toBeEditable()` | A field can be typed into |
| `toHaveCount(n)` | The locator matches exactly `n` elements |
| `toHaveAttribute(name, value)` | An attribute has this value |
| `toHaveTitle(title)` | The **page**'s title matches — `expect(page)` |
| `toHaveURL(url)` | The **page**'s URL matches — `expect(page)` |

Put `.not` in front to check the opposite: `await expect(rememberMe).not.toBeChecked();`

`toHaveText` also accepts an array for a list of elements: `await expect(page.getByRole('listitem')).toHaveText(['Playwright Basics', 'API Testing', 'Performance Testing']);` checks every item, in order.

### Generic assertions: `expect(value)…`

These check an ordinary **value** you already have — a number, text, an array. They check **once**, immediately, and don't need `await`:

| Assertion | Passes when… |
|---|---|
| `toBe(value)` | The same value (like `===`) |
| `toEqual(value)` | Equal in content — for comparing objects and arrays |
| `toContain(item)` | A text contains a part, or an array contains an item |
| `toBeGreaterThan(n)` / `toBeLessThan(n)` | Number comparisons |
| `toBeTruthy()` | The value is truthy (Day 7) |

```ts mode=read
const total = 499 + 1299;
expect(total).toBe(1798);                          // a plain value: no await, no retrying
expect(['chromium', 'firefox']).toContain('firefox');
```

> [!WARNING] Don't read the page into a variable, then check it
> `const text = await locator.textContent(); expect(text).toBe('Saved');` reads the text **once**. If the page updates a moment later, the test fails. Use `await expect(locator).toHaveText('Saved');` — it keeps checking. Rule of thumb: **if it's on the page, use a web-first assertion.**

```quiz
id: d9-f5-q3
type: single
question: "The status shows `Thanks, Asha! You are enrolled in API Testing.` Which assertion passes?"
options:
  - "`await expect(page.getByRole('status')).toHaveText('Thanks, Asha!');`"
  - "`await expect(page.getByRole('status')).toContainText('Thanks, Asha!');`"
  - "`await expect(page.getByRole('status')).toHaveText('thanks, asha! you are enrolled in api testing.');`"
  - "`await expect(page.getByRole('status')).toContainText('thanks, asha');`"
answer: b
explanation: "toHaveText with text needs the whole text, with matching case. toContainText accepts a part — but case still matters. (Locators are the lenient ones: getByText('thanks, asha') would find it.)"
```

```quiz
id: d9-f5-q1
type: single
question: "A success message appears 2 seconds after clicking Save. Which assertion is reliable?"
options:
  - "`expect(await page.getByRole('status').textContent()).toBe('Saved');`"
  - "`await expect(page.getByRole('status')).toHaveText('Saved');`"
  - "`expect(page.getByRole('status')).toBe('Saved');`"
  - "`await page.waitForTimeout(1000); expect(await page.getByRole('status').textContent()).toBe('Saved');`"
answer: b
explanation: "The web-first assertion retries for up to 5 seconds. Reading textContent once checks too early, and a 1-second fixed wait is still too short."
```

```quiz
id: d9-f5-q2
type: multiple
question: Which assertions keep retrying until they pass or time out? (Select all that apply)
options:
  - "`await expect(page).toHaveTitle('Dashboard')`"
  - "`expect(total).toBe(1798)`"
  - "`await expect(locator).toBeChecked()`"
  - "`expect(['a', 'b']).toContain('a')`"
answer: [a, c]
explanation: "Assertions on a page or locator are web-first and retry. Assertions on plain values check once."
```

## F6 · Annotations — controlling which tests run

Real suites contain tests that aren't ready, don't apply to every browser, or document a known bug. **Annotations** mark them:

| Annotation | Effect | When to use it |
|---|---|---|
| `test.skip('title', …)` | The test doesn't run; it's reported as skipped | The feature isn't built yet |
| `test.skip(condition, 'reason')` inside a test | Skips only when the condition is true | "Not supported in WebKit yet" |
| `test.fixme('title', …)` | Doesn't run; marked "to fix" | The test is broken and needs work |
| `test.fail()` inside a test | Runs it and **expects it to fail**. If it unexpectedly passes, Playwright reports it as **failed** | Documenting a known bug until it's fixed |
| `test.slow()` inside a test | Gives it three times the normal time limit | A genuinely long journey |
| `test.only('title', …)` | Runs **only** this test (and any other `only`s) | Focusing while you work on one test |

```ts mode=read
test('date picker works', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Date picker not supported on WebKit yet');
  // …steps run only in Chromium and Firefox
});
```

> [!WARNING] `test.only` is for your own computer
> A `test.only` accidentally left in a file means the whole suite silently runs just that one test. The generated config's `forbidOnly: !!process.env.CI` setting makes CI servers refuse to run when a `test.only` is present (Day 10).

```quiz
id: d9-f6-q1
type: single
question: "Checkout has a known bug (BUG-88). You want a test that documents it, runs every time, and alerts you once the bug is fixed. Which annotation?"
options:
  - "`test.skip`"
  - "`test.fixme`"
  - "`test.fail`"
  - "`test.only`"
answer: c
explanation: "test.fail runs the test and expects it to fail. When BUG-88 is fixed, the test passes unexpectedly and Playwright flags it. skip and fixme don't run the test at all."
```

## F7 · Running and debugging

You met the run commands on Day 3. The ones you'll use most today:

| Goal | Command |
|---|---|
| Run one file in Chromium | `npx playwright test tests/day9/signin.spec.ts --project=chromium` |
| Watch the browser | add `--headed` |
| Only tests whose title contains a phrase | add `-g "TC-203"` |
| Open the HTML report | `npx playwright show-report` |

When a test fails, work through these steps in order:

| Step | How | What you get |
|---|---|---|
| 1. **Read the error** | In the terminal | What was expected, what was received, which line (Day 3 · I7) |
| 2. **Watch it** | `--headed` | See the page as the test runs |
| 3. **Travel back in time** | `--trace on`, then open the trace from the HTML report | A recording of every action, with page snapshots, network and console (Day 2) |

On your own computer, two more tools are worth trying: `--debug` opens the **Playwright Inspector**, where you run one line at a time and see which element each locator finds; `--ui` opens **UI Mode**, with a timeline, watch mode and a locator picker.

```quiz
id: d9-f7-q1
type: single
question: "A test failed on the CI server last night. You can't watch it run there. What's the most useful thing to look at?"
options:
  - Run it headed on the CI server
  - The trace recorded for the failed run, opened from the HTML report (if your config records traces — Day 10)
  - Add page.pause() and re-run on CI
  - The test's title
answer: b
explanation: "A trace records every action with snapshots, so you can inspect exactly what happened after the fact. Headed runs and pauses need someone watching."
```

# Implementation

All test files today go in `tests/day9`. Run commands from the `pw-course` folder.

## I1 · Your first test from scratch

Create a test file and type the test yourself — don't paste it. Typing it builds the muscle memory.

```ts file=tests/day9/first-test.spec.ts mode=editor run="npx playwright test tests/day9/first-test.spec.ts --project=chromium --headed"
import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test('student can sign in', async ({ page }) => {
  // Arrange: open the page
  await page.setContent(signInPage);

  // Act: do what a user would do
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: check the expected result
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page).toHaveTitle('QA Academy - Dashboard');
});
```

```bash terminal
npx playwright test tests/day9/first-test.spec.ts --project=chromium --headed
```

```output terminal
Running 1 test using 1 worker

  ✓  1 [chromium] › tests/day9/first-test.spec.ts:4:5 › student can sign in (1.1s)

  1 passed (1.9s)
```

The dashboard appears 0.8 seconds after the click, yet the test has no waits. `toBeVisible()` simply kept checking until the heading appeared.

**Try it:** change `'Learn@123'` to `'learn@123'` and run again with `--headed`. Watch the window during the 5-second retry — what message does the page show? Then read the error: which assertion failed? Undo the change afterwards.

## I2 · A sign-in suite from test cases

Five manual test cases, five tests. Each one starts from a fresh page:

```ts file=tests/day9/signin.spec.ts mode=editor run="npx playwright test tests/day9/signin.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

// TC-201 · valid credentials open the dashboard
test('TC-201 valid sign-in shows the dashboard', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Signing in…');             // shown straight away
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(); // appears 0.8 s later
  await expect(page.getByText('Welcome back, Student!')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);                      // three courses listed
});

// TC-202 · empty fields
test('TC-202 empty fields show a message', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Please enter your email and password');
  await expect(page).toHaveTitle('QA Academy - Sign in');                       // still on the sign-in page
});

// TC-203 · wrong password
test('TC-203 wrong password is rejected', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page.getByLabel('Email')).toHaveValue('student@qa.academy');   // the email is kept
});

// TC-204 · the Remember me checkbox
test('TC-204 remember me can be ticked and unticked', async ({ page }) => {
  await page.setContent(signInPage);
  const rememberMe = page.getByRole('checkbox', { name: 'Remember me' });

  await expect(rememberMe).not.toBeChecked();
  await rememberMe.check();
  await expect(rememberMe).toBeChecked();
  await rememberMe.uncheck();
  await expect(rememberMe).not.toBeChecked();
});

// TC-205 · sign out
test('TC-205 student can sign out', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByLabel('Password').press('Enter');                            // Enter submits the form too

  await page.getByRole('button', { name: 'Log out' }).click();                 // auto-waits for the dashboard
  await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
});
```

```output terminal
Running 5 tests using 2 workers

  ✓  1 [chromium] › tests/day9/signin.spec.ts:5:5 › TC-201 valid sign-in shows the dashboard (1.1s)
  ✓  2 [chromium] › tests/day9/signin.spec.ts:18:5 › TC-202 empty fields show a message (179ms)
  ✓  3 [chromium] › tests/day9/signin.spec.ts:27:5 › TC-203 wrong password is rejected (178ms)
  ✓  4 [chromium] › tests/day9/signin.spec.ts:38:5 › TC-204 remember me can be ticked and unticked (212ms)
  ✓  5 [chromium] › tests/day9/signin.spec.ts:50:5 › TC-205 student can sign out (1.5s)

  5 passed (3.9s)
```

The number of workers, the order of the lines and the times will differ on your machine: the tests run in parallel.

Four things to notice:

- **TC-201** checks the in-between state *"Signing in…"* and then the dashboard. Web-first assertions handle both without a single wait.
- **TC-204** stores a locator in a `const` and reuses it. Remember: a locator is only a description, so it's searched afresh each time.
- **TC-205** clicks *Log out* straight after pressing Enter. `click()` auto-waits until that button exists — about 0.8 seconds later.
- Every test starts with `setContent`: tests are isolated, so none of them can rely on another having signed in.

**Try it:** run only TC-203 with `-g "TC-203"`.

## I3 · Locators in action

One test per page, exercising every recommended locator and the matching rules from F3:

```ts file=tests/day9/locators.spec.ts mode=editor run="npx playwright test tests/day9/locators.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { signInPage, enrolPage } from './practice-pages';

test('recommended locators on the sign-in page', async ({ page }) => {
  await page.setContent(signInPage);

  // By role (and accessible name): the first choice
  await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();

  // By label: form fields
  await expect(page.getByLabel('Password')).toBeEmpty();

  // By placeholder: fields with hint text
  await expect(page.getByPlaceholder('you@example.com')).toBeEditable();

  // By text: non-interactive text
  await expect(page.getByText('Sign in to QA')).toBeVisible();                 // part of the text is enough

  // By alt text (images) and by title attribute
  await expect(page.getByAltText('QA Academy logo')).toBeVisible();
  await expect(page.getByTitle('Reset your password')).toHaveText('Forgot password?');
});

test('matching rules, strictness and lists on the enrol page', async ({ page }) => {
  await page.setContent(enrolPage);

  // By test id: data-testid="seats"
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');

  // Names match case-insensitively and by substring… unless exact: true
  await expect(page.getByRole('button', { name: 'enrol' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'enrol', exact: true })).toHaveCount(0);

  // Two text boxes match: count them, or narrow down to one
  const textboxes = page.getByRole('textbox');
  await expect(textboxes).toHaveCount(2);
  await expect(textboxes.first()).toHaveAttribute('id', 'name');
  await expect(textboxes.nth(1)).toHaveAttribute('placeholder', 'you@example.com');

  // Options inside the course list; filter by text
  const options = page.getByRole('option');
  await expect(options).toHaveCount(4);
  await expect(options.filter({ hasText: 'API' })).toHaveText('API Testing');
});
```

`toHaveCount(0)` is how you assert that something does **not** exist.

**Try it:** add `await page.getByRole('textbox').fill('Asha');` at the end of the second test and run it. Read the strict mode violation, then replace the locator with one of the two suggestions from the error message.

## I4 · Actions and assertions on the enrol page

```ts file=tests/day9/enrol.spec.ts mode=editor run="npx playwright test tests/day9/enrol.spec.ts --project=chromium --headed"
import { test, expect } from '@playwright/test';
import { enrolPage } from './practice-pages';

test('enrol button is disabled until the terms are accepted', async ({ page }) => {
  await page.setContent(enrolPage);
  const terms = page.getByRole('checkbox', { name: 'I accept the terms' });
  const enrolButton = page.getByRole('button', { name: 'Enrol now' });

  await expect(enrolButton).toBeDisabled();
  await terms.check();
  await expect(enrolButton).toBeEnabled();
  await terms.uncheck();
  await expect(enrolButton).toBeDisabled();
});

test('student can enrol in a course', async ({ page }) => {
  await page.setContent(enrolPage);

  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Course').selectOption('API Testing');                 // choose by visible text
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 11');
  await expect(page.getByLabel('Course')).toHaveValue('api');                   // the option's value
});

test('an email without @ is rejected', async ({ page }) => {
  await page.setContent(enrolPage);

  await page.getByLabel('Full name').fill('Ravi Kumar');
  await page.getByLabel('Email').fill('ravi.example.com');
  await page.getByLabel('Course').selectOption('Playwright Basics');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toContainText('valid email');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');        // no seat was taken
});
```

`selectOption('API Testing')` chose the option by its visible text, but `toHaveValue` checks the option's **value**, `'api'` — the hidden code from the page's HTML (`<option value="api">`).

> [!TESTER]
> The third test checks the **negative** outcome too: the seat count must **not** change. Checking that nothing else happened is as important as checking the message.

## I5 · Annotations

```ts file=tests/day9/annotations.spec.ts mode=editor run="npx playwright test tests/day9/annotations.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { signInPage, enrolPage } from './practice-pages';

test('runs normally', async ({ page }) => {
  await page.setContent(signInPage);
  await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
});

test.skip('social sign-in with Google', async ({ page }) => {
  // Not built yet: this test is skipped and never runs
});

test('the logo is shown', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Logo check not supported on WebKit yet');
  await page.setContent(signInPage);
  await expect(page.getByAltText('QA Academy logo')).toBeVisible();
});

test.fixme('remember me keeps the student signed in', async ({ page }) => {
  // Known to be broken: don't run it until it's fixed
});

test('BUG-42: an email without a dot is accepted', async ({ page }) => {
  test.fail();       // we EXPECT this test to fail until BUG-42 is fixed
  await page.setContent(enrolPage);
  await page.getByLabel('Full name').fill('Meera Iyer');
  await page.getByLabel('Email').fill('meera@example');
  await page.getByLabel('Course').selectOption('API Testing');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();
  await expect(page.getByRole('status')).toHaveText('Enter a valid email', { timeout: 1000 });
});

test('full sign-in journey', async ({ page }) => {
  test.slow();       // give this test 3× the normal time
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

```output terminal
Running 6 tests using 2 workers

  ✓  1 [chromium] › tests/day9/annotations.spec.ts:4:5 › runs normally (188ms)
  -  2 [chromium] › tests/day9/annotations.spec.ts:9:6 › social sign-in with Google
  ✓  3 [chromium] › tests/day9/annotations.spec.ts:13:5 › the logo is shown (126ms)
  -  4 [chromium] › tests/day9/annotations.spec.ts:19:6 › remember me keeps the student signed in
  ✘  5 [chromium] › tests/day9/annotations.spec.ts:23:5 › BUG-42: an email without a dot is accepted (1.3s)
  ✓  6 [chromium] › tests/day9/annotations.spec.ts:34:5 › full sign-in journey (1.5s)

  2 skipped
  4 passed (3.8s)
```

Look closely at test 5: it shows ✘ because it failed — but it's counted among the **4 passed**, because `test.fail()` said it should fail. The page accepted `meera@example`, which is BUG-42. Once the developers fix the bug, this test will pass unexpectedly, be reported as a failure, and remind you to remove `test.fail()`.

`{ timeout: 1000 }` shortens this one assertion's retry time from 5 seconds to 1 second, so the expected failure doesn't slow the run down.

**Try it:** run the file in all three browsers (drop `--project=chromium`). In WebKit, "the logo is shown" is skipped.

## I6 · Debug a failing test

This test fails. Run it:

```ts file=tests/day9/broken.spec.ts mode=editor expect=error run="npx playwright test tests/day9/broken.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test('wrong password shows an error', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('not-my-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
});
```

```output terminal
Running 1 test using 1 worker

  ✘  1 [chromium] › tests/day9/broken.spec.ts:4:5 › wrong password shows an error (5.3s)

  1) [chromium] › tests/day9/broken.spec.ts:4:5 › wrong password shows an error ────────────

    Error: expect(locator).toHaveText(expected) failed

    Locator:  getByRole('alert')
    Expected: "Incorrect email or password"
    Received: "Invalid email or password"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveText" getByRole('alert') with timeout 5000ms
      - waiting for getByRole('alert')
        14 × locator resolved to <p id="message" role="alert">Invalid email or password</p>
           - unexpected value "Invalid email or password"


       8 |   await page.getByRole('button', { name: 'Sign in' }).click();
       9 |
    > 10 |   await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
         |                                         ^
      11 | });
      12 |
        at /home/you/pw-course/tests/day9/broken.spec.ts:10:41

    Error Context: test-results/day9-broken-wrong-password-shows-an-error-chromium/error-context.md

  1 failed
    [chromium] › tests/day9/broken.spec.ts:4:5 › wrong password shows an error ─────────────
```

Work through the debugging steps from F7:

1. **Read the error.** The locator found the alert (`locator resolved to <p … role="alert">`), so the locator is fine. Its text is `Invalid…`, not `Incorrect…`. The assertion retried 14 times over 5 seconds, and the text never changed.
   The **Error Context** file at the end holds a text snapshot of the page at the moment of failure — handy when the error alone doesn't tell you what the page showed.
2. **Decide: app bug or test bug?** The requirements at the top of `practice-pages.ts` say *"Wrong login: Invalid email or password"*. The **test** is wrong.
3. **Record a trace**, to practise the tool you'll use for failures you can't reproduce:

```bash terminal
npx playwright test tests/day9/broken.spec.ts --project=chromium --trace on
npx playwright show-report
```

In the report, open the failed test and click the trace. Click each action in the timeline and look at the page snapshot before and after it. At the `toHaveText` step, the snapshot shows the real message.

4. On your own computer, also try `--debug`: the Inspector opens paused at the first line. Step through with **Step over** and watch each locator light up in the browser.

5. **Fix the test:** change the expected text to `'Invalid email or password'` and run again — green.

## I7 · Read the HTML report

Your config writes an HTML report after every run. It doesn't open by itself (Day 3 · I5), so open it:

```bash terminal
npx playwright show-report
```

| In the report | Use it to… |
|---|---|
| Filters: **Passed**, **Failed**, **Flaky**, **Skipped** | Jump straight to what needs attention |
| Search box | Find tests by title — e.g. `TC-20` |
| A test's page: steps | See every action and assertion with its duration; failed steps are red |
| Errors | The same message as the terminal, with the code line |
| Attachments: screenshots, videos, traces | Evidence — when the config records them |

Press **Ctrl+C** in the terminal to stop the report server when you're done.

# Practice

## Quiz · Day 9 check

```quiz
id: d9-pr-q1
type: single
question: "Why does `practice-pages.ts` not run as a test file?"
options:
  - Because it has no test() calls
  - Because its name doesn't end in .spec.ts
  - Because it's in the tests folder
  - Because it exports strings
answer: b
explanation: "Playwright looks for test files by name — by default, names ending in .spec.ts or .test.ts."
```

```quiz
id: d9-pr-q2
type: single
question: "Which is the best locator for `<label for=\"phone\">Mobile number</label><input id=\"phone\">`?"
options:
  - "`page.locator('#phone')`"
  - "`page.getByLabel('Mobile number')`"
  - "`page.getByText('Mobile number')`"
  - "`page.locator('input').nth(3)`"
answer: b
explanation: "Form fields are best found by their label. getByText would find the label itself, not the input."
```

```quiz
id: d9-pr-q3
type: single
question: "What does `const button = page.getByRole('button', { name: 'Pay' });` do on its own?"
options:
  - Clicks the Pay button
  - Searches the page and stores the element
  - Only creates a description of how to find the button — nothing is searched yet
  - Fails if the button isn't on the page yet
answer: c
explanation: "Locators are lazy: Playwright searches when you act or assert, and searches again each time."
```

```quiz
id: d9-pr-q4
type: single
question: "How do you assert that NO error message is shown?"
options:
  - "`await expect(page.getByRole('alert')).toBeHidden();`"
  - "`expect(page.getByRole('alert')).toBe(null);`"
  - "`expect(await page.getByRole('alert').isVisible()).toBe(false);`"
  - "You can't — Playwright only checks things that exist"
answer: a
explanation: "toBeHidden passes when the element is missing or invisible, and it retries. The isVisible version checks only once. (toHaveCount(0) also works when the element disappears completely — but our sign-in page always contains an empty alert paragraph, so there only toBeHidden works.)"
```

```quiz
id: d9-pr-q5
type: single
question: "Which assertion checks that a drop-down currently has the option with value 'pw' selected?"
options:
  - "`await expect(page.getByLabel('Course')).toHaveValue('pw');`"
  - "`await expect(page.getByLabel('Course')).toHaveText('pw');`"
  - "`await expect(page.getByLabel('Course')).toBeChecked();`"
  - "`expect(page.getByLabel('Course')).toBe('pw');`"
answer: a
explanation: "toHaveValue checks an input's or select's current value."
```

```quiz
id: d9-pr-q6
type: single
question: "A test is marked `test.fixme(…)`. What does Playwright do with it?"
options:
  - Runs it and expects it to fail
  - Doesn't run it, and reports it as skipped
  - Runs it three times
  - Runs it with a longer timeout
answer: b
explanation: "fixme (like skip) doesn't run the test. test.fail is the one that runs and expects a failure."
```

```quiz
id: d9-pr-q7
type: multiple
question: "Before `click()`, what does Playwright automatically wait for? (Select all that apply)"
options:
  - The element is visible
  - The element is enabled
  - The element is not covered by another element
  - The network has been idle for 2 seconds
answer: [a, b, c]
explanation: "Before a click, Playwright waits for the element to be visible, stable, enabled and not covered (receiving events). Network idleness is not part of the checks."
```

```quiz
id: d9-pr-q8
type: single
question: "An assertion failed with `Expected: \"Saved\"` and `Received: \"Saving…\"` after 5000 ms. What's the most likely explanation?"
options:
  - The locator found the wrong element
  - The element was found, but its text never became 'Saved' within 5 seconds
  - Playwright doesn't support the … character
  - The test forgot to await the page.goto
answer: b
explanation: "The locator found the element (it received text), but the text never became 'Saved' while the assertion retried. Investigate the app or the expected text — the trace will show which."
```

## Spot the bug

````exercise
id: d9-pr-bug1
title: Four bugs in one test
level: medium
type: written
prompt: |
  This test was written in a hurry. Find **four** bugs, and say what each one would cause:
  ```ts
  import { test, expect } from '@playwright/test';
  import { enrolPage } from './practice-pages';

  test.only('student can enrol', async (page) => {
    await page.setContent(enrolPage);
    await page.getByLabel('Full name').fill('Asha Verma');
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Course').fill('API Testing');
    await page.getByLabel('I accept the terms').check();
    page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
  });
  ```
modelAnswer: |
  1. **`test.only`** — only this test would run in the whole suite. Remove `.only`.
  2. **`async (page) =>`** — without braces, `page` would be the whole fixtures object, not the page. Playwright refuses to even load the file: *First argument must use the object destructuring pattern*. (VS Code also underlines `setContent`.) Write `async ({ page }) =>`.
  3. **`.fill('API Testing')` on a `<select>`** — you can't type into a drop-down list; the action fails with an error saying the element is not an input. Use `.selectOption('API Testing')`.
  4. **Missing `await` before the click** — the test moves on without waiting for the click. Here the web-first assertion happens to retry until the message appears, so the test may even pass — which is exactly why missing awaits are dangerous. If the click were the **last** line, the test could end while the click was still in progress, and the click would be cut off without anyone noticing. Add `await`.
````

## Exercises

````exercise
id: d9-ex1
title: The sign-in page, at first sight
level: easy
type: code
prompt: |
  Create `tests/day9/signin-page.spec.ts` with **one** test, `TC-206 sign-in page shows everything a new visitor needs`. Without typing or clicking anything, assert that:

  1. The page title is `QA Academy - Sign in`
  2. The heading `Sign in to QA Academy` is visible
  3. The logo (alt text `QA Academy logo`) is visible
  4. The email field (placeholder `you@example.com`) is empty
  5. The *Remember me* checkbox is **not** ticked
  6. The *Forgot password?* link is visible
file: tests/day9/signin-page.spec.ts
run: npx playwright test tests/day9/signin-page.spec.ts --project=chromium
hints:
  - "The page title: `await expect(page).toHaveTitle('…')`."
  - "Use a different locator type for 3, 4 and 5: getByAltText, getByPlaceholder, getByRole('checkbox', …)."
  - "Not ticked: `.not.toBeChecked()`."
solution: |
  import { test, expect } from '@playwright/test';
  import { signInPage } from './practice-pages';

  test('TC-206 sign-in page shows everything a new visitor needs', async ({ page }) => {
    await page.setContent(signInPage);

    await expect(page).toHaveTitle('QA Academy - Sign in');
    await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
    await expect(page.getByAltText('QA Academy logo')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeEmpty();
    await expect(page.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });
````

````exercise
id: d9-ex2
title: Enrolment validation
level: medium
type: code
prompt: |
  Create `tests/day9/enrol-validation.spec.ts` with two tests, from these test cases:

  | ID | Steps | Expected |
  |---|---|---|
  | TC-301 | Leave **Full name** empty; fill a valid email; choose *API Testing*; accept the terms; click *Enrol now* | Status says `Name is required`; seats stay at 12 |
  | TC-302 | Fill name and a valid email; **don't choose a course**; accept the terms; click *Enrol now* | Status says `Please choose a course`; seats stay at 12 |

  Name the tests `TC-301 name is required` and `TC-302 a course must be chosen`.
file: tests/day9/enrol-validation.spec.ts
run: npx playwright test tests/day9/enrol-validation.spec.ts --project=chromium
hints:
  - "Start from the third test in I4 and change the inputs."
  - "The status message is `page.getByRole('status')`; the seats are `page.getByTestId('seats')`."
solution: |
  import { test, expect } from '@playwright/test';
  import { enrolPage } from './practice-pages';

  test('TC-301 name is required', async ({ page }) => {
    await page.setContent(enrolPage);
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Course').selectOption('API Testing');
    await page.getByLabel('I accept the terms').check();
    await page.getByRole('button', { name: 'Enrol now' }).click();

    await expect(page.getByRole('status')).toHaveText('Name is required');
    await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
  });

  test('TC-302 a course must be chosen', async ({ page }) => {
    await page.setContent(enrolPage);
    await page.getByLabel('Full name').fill('Asha Verma');
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('I accept the terms').check();
    await page.getByRole('button', { name: 'Enrol now' }).click();

    await expect(page.getByRole('status')).toHaveText('Please choose a course');
    await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
  });
````

````exercise
id: d9-ex3
title: From test case to test — the dashboard
level: medium
type: code
prompt: |
  Automate this manual test case in `tests/day9/dashboard.spec.ts`:

  > **TC-210 · Dashboard lists the student's courses**
  > 1. Open the sign-in page
  > 2. Enter `student@qa.academy` / `Learn@123`
  > 3. Click *Sign in*
  >
  > **Expected:** the page title is `QA Academy - Dashboard`; the greeting `Welcome back, Student!` is shown; the heading `Your courses` is shown; the list shows exactly *Playwright Basics*, *API Testing*, *Performance Testing*, in that order.

  Use the test title `TC-210 dashboard lists the student's courses` — because the title contains an apostrophe, put it in double quotes: `"…"`.
file: tests/day9/dashboard.spec.ts
run: npx playwright test tests/day9/dashboard.spec.ts --project=chromium
hints:
  - "`Your courses` is an `<h2>` — still the role heading."
  - "Check a whole list, in order: `await expect(page.getByRole('listitem')).toHaveText([ … ]);`"
solution: |
  import { test, expect } from '@playwright/test';
  import { signInPage } from './practice-pages';

  test("TC-210 dashboard lists the student's courses", async ({ page }) => {
    // Steps 1–3: sign in
    await page.setContent(signInPage);
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Expected: the dashboard, with a greeting and three courses in order
    await expect(page).toHaveTitle('QA Academy - Dashboard');
    await expect(page.getByText('Welcome back, Student!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your courses' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveText(['Playwright Basics', 'API Testing', 'Performance Testing']);
  });
````

````exercise
id: d9-ex4
title: Triage with annotations
level: medium
type: code
prompt: |
  Create `tests/day9/triage.spec.ts` with three tests on the enrol page:

  1. `TC-303 the course list has four options` — asserts there are 4 options in the list (3 courses and the "choose" prompt). It must be **skipped in Firefox** with the reason `Course list is being redesigned for Firefox`.
  2. `TC-304 a student can pay by card` — the payment page isn't built yet. Mark it **fixme**, with an empty body.
  3. `BUG-51: an email with nothing after @ is accepted` — enrol with name `Ravi Kumar`, email `ravi@`, course *Playwright Basics*, terms accepted. Assert that the status says `Enter a valid email` (with a 1-second timeout). The app currently accepts `ravi@`, so mark the test as **expected to fail**.

  Run it in Chromium: you should see 2 passed and 1 skipped.
file: tests/day9/triage.spec.ts
run: npx playwright test tests/day9/triage.spec.ts --project=chromium
hints:
  - "Ask for the browserName fixture: `async ({ page, browserName }) => { test.skip(browserName === 'firefox', '…'); … }`."
  - "`test.fixme('title', async ({ page }) => {});`"
  - "`test.fail();` goes on the first line inside the BUG-51 test."
solution: |
  import { test, expect } from '@playwright/test';
  import { enrolPage } from './practice-pages';

  test('TC-303 the course list has four options', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Course list is being redesigned for Firefox');
    await page.setContent(enrolPage);
    await expect(page.getByRole('option')).toHaveCount(4);   // three courses + the "choose" prompt
  });

  test.fixme('TC-304 a student can pay by card', async ({ page }) => {
    // Payment page not built yet
  });

  test('BUG-51: an email with nothing after @ is accepted', async ({ page }) => {
    test.fail();
    await page.setContent(enrolPage);
    await page.getByLabel('Full name').fill('Ravi Kumar');
    await page.getByLabel('Email').fill('ravi@');
    await page.getByLabel('Course').selectOption('Playwright Basics');
    await page.getByLabel('I accept the terms').check();
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Enter a valid email', { timeout: 1000 });
  });
````

````exercise
id: d9-ex5
title: "Optional challenge: data-driven sign-in tests"
level: challenge
type: code
prompt: |
  On Day 7 you looped over test data by hand. Playwright can **create one test per row**: put `test(…)` inside a `for...of` loop. Each row becomes a separate test, with its own title, its own fresh page and its own pass/fail result.

  Create `tests/day9/signin-data.spec.ts`:

  1. A type `SignInCase` with `id`, `email`, `password` and `expectedMessage` (all strings).
  2. An array `cases` with these five rows:

  | id | email | password | expectedMessage |
  |---|---|---|---|
  | TC-221 | *(empty)* | *(empty)* | Please enter your email and password |
  | TC-222 | student@qa.academy | *(empty)* | Please enter your email and password |
  | TC-223 | student@qa.academy | learn@123 | Invalid email or password |
  | TC-224 | someone@qa.academy | Learn@123 | Invalid email or password |
  | TC-225 | student@qa.academy | Learn@123 | Signing in… |

  3. A `for...of` loop that registers one test per row. Give each a **unique** title built from the row, such as `` `${c.id} sign-in with "${c.email}" / "${c.password}"` ``. The test fills both fields, clicks *Sign in*, and asserts the alert's text.

  Run it: you should see 5 separate tests.
file: tests/day9/signin-data.spec.ts
run: npx playwright test tests/day9/signin-data.spec.ts --project=chromium
hints:
  - "The loop goes at the top level of the file, and `test(…)` goes inside it."
  - "Titles must be unique — Playwright refuses two tests with the same title in one file."
  - "`fill('')` on an empty field is fine."
solution: |
  import { test, expect } from '@playwright/test';
  import { signInPage } from './practice-pages';

  type SignInCase = { id: string; email: string; password: string; expectedMessage: string };

  const cases: SignInCase[] = [
    { id: 'TC-221', email: '', password: '', expectedMessage: 'Please enter your email and password' },
    { id: 'TC-222', email: 'student@qa.academy', password: '', expectedMessage: 'Please enter your email and password' },
    { id: 'TC-223', email: 'student@qa.academy', password: 'learn@123', expectedMessage: 'Invalid email or password' },
    { id: 'TC-224', email: 'someone@qa.academy', password: 'Learn@123', expectedMessage: 'Invalid email or password' },
    { id: 'TC-225', email: 'student@qa.academy', password: 'Learn@123', expectedMessage: 'Signing in…' },
  ];

  // One test per row: each gets its own title, its own fresh page, and its own result
  for (const c of cases) {
    test(`${c.id} sign-in with "${c.email}" / "${c.password}"`, async ({ page }) => {
      await page.setContent(signInPage);
      await page.getByLabel('Email').fill(c.email);
      await page.getByLabel('Password').fill(c.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('alert')).toHaveText(c.expectedMessage);
    });
  }
````

## Reflection

1. Map each part of a Playwright test to a part of a manual test case.
2. Why does every test start by opening the page, even if the test before it already did?
3. Why is `getByRole` preferred over a CSS selector like `#submit`?
4. What's the difference between `await expect(locator).toHaveText('x')` and `expect(await locator.textContent()).toBe('x')`?
5. When would you use `test.skip`, `test.fixme` and `test.fail`?
6. A test fails on CI but passes on your machine. Which tool do you reach for first, and why?

> [!TIP] Coming up on Day 10
> From single test files to a **framework**: the config file in depth, grouping with `describe`, shared setup with hooks, tags, test data and helper layers, npm scripts — and a mini-project that brings it all together.
