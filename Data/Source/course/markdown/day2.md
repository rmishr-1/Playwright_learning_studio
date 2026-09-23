---
day: 2
week: 1
title: How Playwright Works & Why Teams Choose It
subtitle: Architecture, the Browser → Context → Page model, the features that reduce flaky tests, and an honest comparison with Selenium and Cypress
estimatedTime: 2.5 hours
topics:
- Playwright architecture
- Why Playwright (Future of Automation)
objectives:
- Explain Playwright's architecture — test code → Playwright → browser — and which protocol it uses per browser
- Explain the Browser → Context → Page model with an everyday analogy
- List Playwright's key features (auto-waiting, web-first assertions, isolation, parallelism, tooling) and its limitations
- Compare Playwright with Selenium and Cypress and justify when to choose each
- Run demo tests that prove context isolation and cross-browser execution
prerequisitesFromEarlierDays:
- 'Day 1: actions vs assertions, the DOM, headed vs headless, the auto-wait demo'
workspace: Pre-loaded demo workspace
---

# Prerequisites

## P1 · Quick recap from Day 1

Yesterday you ran your first automated tests without writing code. Three quick checks before we go under the hood:

```quiz
id: d2-p1-q1
type: single
question: In the auto-wait demo, what did Playwright wait for before clicking "Pay now"?
options:
  - A fixed 2-second timer written in the test
  - The button to exist on the page and be ready (visible, enabled, not moving)
  - The user to press Enter
  - The browser to finish downloading Chromium
answer: b
explanation: Playwright checks the element is actionable and retries until it is. The test itself contained no timer.
```

```quiz
id: d2-p1-q2
type: single
question: "Which line is an ASSERTION?"
options:
  - "`await page.setContent(checkoutPage);`"
  - "`await page.getByRole('button', { name: 'Pay now' }).click();`"
  - "`await expect(page.locator('#status')).toHaveText('Payment successful');`"
answer: c
explanation: "`expect(…)` checks an expected result. `setContent` and `click` are actions."
```

```quiz
id: d2-p1-q3
type: truefalse
question: Running a test headless means the browser does the same work but without drawing a window.
answer: true
explanation: Headless is the default (fast, good for CI). Add `--headed` to watch.
```

## P2 · Words you'll need today

Today's lessons use a few words from Day 1 constantly. Keep this card open:

| Word | Meaning (from Day 1) |
|---|---|
| **Action** | Something the test *does*: go to a URL, fill, click |
| **Assertion** | Something the test *checks*: `expect(…)` |
| **Locator** | How a test finds an element: "the button named Log in" |
| **DOM** | The live tree of elements the browser builds from HTML |
| **Headless / headed** | Browser without / with a visible window |
| **Flaky test** | Sometimes passes, sometimes fails, no code change |

Today adds three more: **Browser**, **Context** and **Page**. By the end of the day you'll explain them with an incognito-window analogy.

# Fundamentals

## F1 · Architecture — how Playwright talks to the browser

### The big picture

Every Playwright test involves three players:

```mermaid
flowchart LR
  A["Your test code<br/>(TypeScript)"] -- "commands:<br/>click, fill, goto" --> B["Playwright<br/>(server / driver)"]
  B -- "events & results:<br/>page loaded, element found" --> A
  B -- "browser protocol" --> C1[Chromium]
  B -- "browser protocol" --> C2[Firefox]
  B -- "browser protocol" --> C3[WebKit]
```

1. **Your test code** says *what* should happen: "go to the login page, fill the email, click Log in".
2. **Playwright** (often called the *server* or *driver*) translates each command into the language the browser understands and sends it.
3. **The browser** performs the action and reports back: the page loaded, the element exists, the click happened, the text changed.

### The key idea: one open line, not one letter per command

Older tools such as classic **Selenium WebDriver** send each command as a separate HTTP request — like posting a letter for every instruction and waiting for the reply before sending the next one.

Playwright keeps **one persistent, two-way connection** open for the whole session (a pipe when it launches the browser itself, or a WebSocket when it connects to a remote browser). It is like being on a phone call with the browser:

- Playwright can send commands quickly, one after another
- The browser can **push events back at any moment** — "a new page opened", "the network request finished", "a dialog appeared"

Because every message over this open line is fast, Playwright can check "is the element ready yet?" many times per second before acting, and it also hears about navigations, dialogs and network activity as they happen. That's the foundation for **auto-waiting** (see F3).

```mermaid
sequenceDiagram
  participant T as Your test
  participant P as Playwright
  participant B as Browser
  T->>P: click "Log in"
  P->>B: is the button attached, visible, stable, enabled?
  B-->>P: not yet (page still loading)
  Note over P,B: Playwright re-checks every few milliseconds
  P->>B: check again
  B-->>P: ready ✓
  P->>B: click at the button's position
  B-->>P: click done
  P-->>T: ✓ next step
```

### Which "language" does Playwright speak to each browser?

| Browser | How Playwright talks to it |
|---|---|
| Chromium (Chrome, Edge) | **Chrome DevTools Protocol (CDP)** — the same low-level protocol Chrome's own DevTools uses |
| Firefox | A Playwright-patched Firefox build with its own automation protocol |
| WebKit | A Playwright-patched WebKit build with its own automation protocol |

This is why Playwright **downloads its own browser builds** during installation (`npx playwright install`). Each Playwright version is tested against specific browser versions, so everything matches.

> [!DEEPDIVE] A little more precisely
> In Python, Java and .NET, your test talks to a separate Playwright driver process (written in Node.js). In Node.js/TypeScript the Playwright client and server run together in your test's process, and the server talks to the browser directly — for a locally launched Chromium over a pipe (`--remote-debugging-pipe`), for a remote browser over a WebSocket. Either way the idea is the same: a persistent, message-based connection — not one HTTP request per command. Low-level protocols like CDP are also what make features such as network interception, console-log capture and trace recording possible without extra plugins.

```quiz
id: d2-f2-q1
type: single
question: How does Playwright wait for elements without fixed sleeps?
options:
  - It adds a fixed 5-second sleep before every action
  - Before each action it checks the element is ready (attached, visible, stable, enabled…) and quickly re-checks until it is — cheap to do over its fast, persistent connection
  - It runs the test code inside the web page itself
  - It takes a screenshot and compares pixels before every click
answer: b
explanation: "Playwright runs readiness (actionability) checks and retries them rapidly, acting the moment the element is ready. The persistent connection makes those repeated checks fast, and also lets Playwright hear about navigations, dialogs and network events as they happen."
```

```quiz
id: d2-f2-q2
type: truefalse
question: Playwright uses the Chrome DevTools Protocol (CDP) to control Chromium-based browsers.
answer: true
explanation: For Chromium, Playwright speaks CDP. For Firefox and WebKit it uses Playwright-patched browser builds with their own automation protocols.
```

## F2 · Browser → Context → Page

Inside the browser, Playwright organises everything in three layers. You will use these words every single day.

```mermaid
flowchart TD
  B["🌐 Browser<br/>(one running Chromium / Firefox / WebKit)"]
  B --> C1["🔒 Context A<br/>like an incognito window:<br/>own cookies, storage, login"]
  B --> C2["🔒 Context B<br/>completely separate<br/>from Context A"]
  C1 --> P1["📄 Page<br/>(a tab)"]
  C1 --> P2["📄 Page<br/>(another tab)"]
  C2 --> P3["📄 Page<br/>(a tab)"]
```

| Layer | Real-life analogy | What it holds |
|---|---|---|
| **Browser** | The Chrome application running on your laptop | The browser process itself |
| **Context** | A brand-new **incognito window** | Its own cookies, local storage, session, permissions — shares **nothing** with other contexts |
| **Page** | A **tab** inside that window | One web page you interact with: URL, elements, clicks |

### Why contexts matter so much

Starting a whole new browser is slow (about a second). Creating a new **context** takes only milliseconds, yet it is just as clean — no leftover cookies, no logged-in user from the previous test.

So Playwright Test gives **every test its own fresh context and page**:

1. Start the browser (once, reused)
2. Test 1 → new context → new page → run → context thrown away
3. Test 2 → new context → new page → run → context thrown away

Result: tests **cannot affect each other**, and they can safely run **in parallel**.

> [!TESTER] Why this matters to a manual tester
> You have probably seen "it worked when I tested it, but failed when you tested it" because of a leftover login session or cached data. Contexts give every automated test a perfectly clean browser, every time — like testing each case in a new incognito window.

You will see code like this later in the course (read-only for now — just spot the three layers):

```ts mode=read
import { chromium } from 'playwright';

const browser = await chromium.launch();        // 1. Browser: start Chromium
const context = await browser.newContext();     // 2. Context: a fresh "incognito window"
const page = await context.newPage();           // 3. Page: a tab inside it

await page.goto('https://playwright.dev');      // use the tab
await browser.close();                          // close everything
```

> [!NOTE]
> In Playwright **Test** you almost never write those first three lines yourself. The runner creates the browser, context and page for you and hands the page to your test. You will see this on Day 9 as `async ({ page }) => { … }`.

```quiz
id: d2-f3-q1
type: single
question: Two tests run at the same time. Test A logs in as "admin". Why does Test B NOT see the admin session?
options:
  - Because Playwright deletes all cookies from your computer before each test
  - Because each test gets its own browser context, which has separate cookies and storage
  - Because Test B uses a different browser engine
  - Because Playwright runs only one test at a time
answer: b
explanation: Each test gets a fresh context — like a new incognito window. Cookies, storage and sessions are never shared between contexts.
```

```quiz
id: d2-f3-q2
type: single
question: Which layer represents a single browser TAB?
options:
  - Browser
  - Context
  - Page
answer: c
explanation: A Page is one tab. A Context can hold several pages (useful for tests that open a link in a new tab).
```

## F3 · The features that make Playwright stand out

### 1. Auto-waiting

Before every action Playwright automatically checks that the element is **ready**: it is attached to the page, visible, not moving (animation finished), enabled, and not covered by another element. Only then does it click or type. If the element never becomes ready, the step fails after a timeout with a clear message.

No more `sleep(5000)` "just in case" waits — the #1 cause of slow and flaky tests.

### 2. Web-first assertions

Checks such as "the heading should say *Welcome*" **retry automatically** until they pass or a timeout is reached (5 seconds by default). If the text appears after 1.2 seconds, the check passes at 1.2 seconds.

### 3. Cross-browser with one code base

The *same* test runs on Chromium, Firefox and WebKit. You choose browsers in one configuration file — the tests don't change.

### 4. Isolation and parallel execution

Fresh context per test (F2) + multiple **workers** running test files at the same time = fast, independent tests. No extra "grid" server is needed to run in parallel on one machine.

### 5. Built-in tooling

| Tool | What it helps with |
|---|---|
| **Codegen** (`npx playwright codegen`) | Records your clicks in a browser and writes the test code for you |
| **UI Mode** (`--ui`) | A visual window to run, watch and time-travel through tests |
| **Inspector / debug mode** (`--debug`) | Step through a test one action at a time |
| **Trace Viewer** | A full recording of a test run: every action, DOM snapshots, network calls, console logs |
| **HTML report** | A web page with results, errors and attachments after every run |

### 6. Beyond clicking

Network interception and API mocking, API testing without a browser (`request`), mobile device emulation, geolocation and permissions, multiple tabs and users in one test, file uploads/downloads, screenshots and videos.

```quiz
id: d2-f4-q1
type: single
question: A "Success" message appears 3 seconds after clicking Save. With Playwright's default settings, what happens when you assert the message is visible?
options:
  - The assertion fails immediately because the message is not there yet
  - The assertion keeps retrying and passes as soon as the message appears (within the 5-second default)
  - You must add `sleep(3000)` before the assertion
  - Playwright refreshes the page until the message appears
answer: b
explanation: Web-first assertions retry until the condition is true or the timeout (5 s by default) runs out. The message appears at ~3 s, so the assertion passes then.
```

```quiz
id: d2-f4-q2
type: single
question: Which Playwright tool records your manual clicks and writes the test code for you?
options:
  - Trace Viewer
  - Codegen
  - HTML reporter
  - Workers
answer: b
explanation: "`npx playwright codegen <url>` opens a browser, records what you do and generates the matching code. It's a great learning aid (and you'll still need to review and tidy the generated code)."
```

## F4 · Why Playwright? Comparing the main tools

### Playwright vs Selenium vs Cypress

The five differences that matter most when choosing:

| | **Playwright** | **Selenium WebDriver** | **Cypress** |
|---|---|---|---|
| Waiting | Automatic for actions and assertions | Mostly manual (explicit waits) | Automatic retries |
| Browsers | Chromium, Firefox, WebKit | Chrome, Edge, Firefox, Safari (real branded browsers) | Chrome-family, Firefox, Electron; WebKit experimental |
| Languages | JS/TS, Python, Java, .NET | Java, Python, C#, JS, Ruby and more | JS/TS only |
| Built-in test runner & parallelism | Yes — workers included | No — pair with TestNG, JUnit, pytest…; Grid for many machines | Yes; parallel via paid cloud or third-party tools |
| Multiple tabs / users in one test | Yes (pages and contexts) | Yes (window handles) | Very limited |

```reference title="More comparison points"
| | **Playwright** | **Selenium WebDriver** | **Cypress** |
|---|---|---|---|
| First released | 2020 (Microsoft) | 2004 (started at ThoughtWorks, now an open-source project) | 2017 (Cypress.io) |
| How it controls the browser | Persistent connection (CDP / patched browser protocols) | W3C WebDriver over HTTP via a browser driver (plus newer WebDriver BiDi) | Runs *inside* the browser alongside your app |
| Parallel runs | Built in (workers) + sharding across machines, free | Via the test runner (TestNG, JUnit 5, pytest-xdist…); Selenium Grid to spread across many machines | Via paid cloud service or third-party tools |
| Community & age | Younger, growing very fast | Largest, most mature | Large JS community |
```

### When would you still choose something else?

Playwright is not the best answer to everything. Be honest about its limits:

- **Native mobile apps** (Android/iOS apps from the app store) — Playwright tests *web* apps only. Use Appium or similar.
- **Very old browsers** such as Internet Explorer — not supported.
- **Real branded Safari** — Playwright's WebKit is very close to Safari but is not the exact Safari app. (Real branded **Chrome** and **Edge** *can* be used via the `channel` option.)
- **An existing large Selenium suite** in Java with a skilled team — migrating everything may not be worth it. Many companies run both.
- **Desktop applications** (Windows/Mac apps) — out of scope.

> [!TESTER] Interview tip
> A strong answer to *"Why Playwright over Selenium?"* names concrete things: auto-waiting (fewer flaky tests), browser contexts (fast isolation), built-in parallelism and reporting, one API for three engines, and tools like Codegen and Trace Viewer. Then add one honest limitation — interviewers like balance.

```quiz
id: d2-f5-q1
type: single
question: Your company needs to automate its Android banking APP downloaded from the Play Store. Is Playwright the right tool?
options:
  - Yes — Playwright's mobile emulation covers native apps
  - No — Playwright automates web applications; a native-app tool such as Appium fits better
  - Yes, but only with the webkit browser
answer: b
explanation: Mobile *emulation* in Playwright means making a desktop browser behave like a phone browser (screen size, touch, user agent). It cannot drive native Android/iOS apps.
```

```quiz
id: d2-f5-q2
type: multiple
question: Which statements about Selenium and Playwright are correct? (Select all that apply)
options:
  - Selenium supports more programming languages than Playwright
  - Playwright includes its own test runner and HTML reporter
  - Selenium automatically waits for every element before every action, exactly like Playwright
  - Playwright can run tests in parallel on one machine without an extra grid server
answer: [a, b, d]
explanation: "Selenium supports more languages and is older and very mature. Playwright bundles its own runner and reporters and runs tests in parallel with workers (Selenium can also run in parallel on one machine, but through a separate test runner). Selenium mostly relies on explicit waits that you write yourself, so option C is false."
```

## F5 · Why Playwright is called "the future of automation"

Playwright has become one of the most popular end-to-end testing tools in only a few years. The reasons are practical:

1. **Built for modern web apps.** Today's apps (React, Angular, Vue…) change the page constantly without full reloads. Auto-waiting and web-first assertions were designed for exactly this.
2. **Fewer flaky tests.** Flaky tests destroy trust in automation. Removing manual sleeps and giving every test a clean context attacks the two biggest causes: timing and shared state.
3. **Speed.** Parallel workers and lightweight contexts make large suites finish much faster, which matters when tests run on every code change in CI.
4. **One tool, many kinds of testing.** UI tests, API tests, mobile-viewport tests, visual comparisons and network mocking — all with the same API and report.
5. **AI-ready.** Playwright now ships an **MCP server** and **test agents** that let AI assistants open browsers, explore apps, and help plan, generate and repair tests. The AI still needs a tester who knows what "correct" looks like — that is you.
6. **Active development.** Microsoft releases a new version roughly every month or two with new features and updated browsers. (At the time of writing the current line is 1.6x — always check the release notes.)

> [!NOTE]
> "Future of automation" does not mean the other tools disappear. It means the skills you learn here — thinking in actions and assertions, reliable locators, isolated tests, reading reports — are in high demand and transfer to any modern tool.

```quiz
id: d2-f6-q1
type: single
question: Which problem do auto-waiting AND fresh browser contexts both help reduce?
options:
  - Licence costs
  - Flaky tests
  - The number of test cases you need to write
  - Browser download size
answer: b
explanation: Auto-waiting removes timing problems; fresh contexts remove shared-state problems. Timing and shared state are the two biggest causes of flaky tests.
```

# Implementation

## I1 · See contexts keep users apart

This demo creates **two contexts** from the same browser — imagine two different customers on two different devices — and proves they don't share anything.

```ts file=tests/day2/contexts.spec.ts mode=editor run="npx playwright test tests/day2/contexts.spec.ts --project=chromium"
import { test, expect } from '@playwright/test';

// A page that prints the browser language and window width
const whoAmIPage = `
  <h1 id="info"></h1>
  <script>
    document.getElementById('info').textContent =
      navigator.language + ' | ' + window.innerWidth + 'px wide';
  </script>
`;

test('two contexts behave like two different devices', async ({ browser }) => {
  // Context 1: a laptop user in India
  const laptopUser = await browser.newContext({ locale: 'en-IN', viewport: { width: 1280, height: 720 } });
  // Context 2: a phone-sized user in France
  const phoneUser = await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });

  // One tab (page) in each context
  const laptopPage = await laptopUser.newPage();
  const phonePage = await phoneUser.newPage();
  await laptopPage.setContent(whoAmIPage);
  await phonePage.setContent(whoAmIPage);

  // Each context has its own settings
  await expect(laptopPage.locator('#info')).toHaveText('en-IN | 1280px wide');
  await expect(phonePage.locator('#info')).toHaveText('fr-FR | 390px wide');

  await laptopUser.close();
  await phoneUser.close();
});

test('cookies in one context are invisible to another', async ({ browser }) => {
  const customerA = await browser.newContext();
  const customerB = await browser.newContext();

  // Customer A "logs in" — we store a login cookie in context A only
  await customerA.addCookies([{ name: 'session', value: 'asha-logged-in', url: 'https://shop.example.com' }]);

  const cookiesA = await customerA.cookies();
  const cookiesB = await customerB.cookies();
  console.log('Customer A has', cookiesA.length, 'cookie(s)');
  console.log('Customer B has', cookiesB.length, 'cookie(s)');

  expect(cookiesA).toHaveLength(1); // A is logged in
  expect(cookiesB).toHaveLength(0); // B is NOT — contexts share nothing

  await customerA.close();
  await customerB.close();
});
```

```bash terminal
npx playwright test tests/day2/contexts.spec.ts --project=chromium
```

```output terminal
Running 2 tests using 2 workers

[chromium] › tests/day2/contexts.spec.ts:32:5 › cookies in one context are invisible to another
Customer A has 1 cookie(s)
Customer B has 0 cookie(s)

  ✓  1 [chromium] › tests/day2/contexts.spec.ts:12:5 › two contexts behave like two different devices (410ms)
  ✓  2 [chromium] › tests/day2/contexts.spec.ts:32:5 › cookies in one context are invisible to another (95ms)

  2 passed (1.4s)
```

> [!NOTE]
> Here the test receives `browser` (not `page`) and builds its own contexts — useful for multi-user scenarios such as "an admin approves a request that a customer submitted". In most tests you'll simply use the ready-made `page`.

## I2 · One test, three browsers

The last demo is a single test. You'll run it once — and Playwright will run it on **all three engines**, because the project configuration lists Chromium, Firefox and WebKit.

```ts file=tests/day2/browsers.spec.ts mode=editor run="npx playwright test tests/day2/browsers.spec.ts"
import { test, expect } from '@playwright/test';

test('same test, any browser', async ({ page, browserName }) => {
  // browserName is "chromium", "firefox" or "webkit"
  await page.setContent('<h1>Hello from an automated test!</h1>');
  console.log(`Running in: ${browserName}`);

  await expect(page.getByRole('heading')).toHaveText('Hello from an automated test!');
});
```

```bash terminal
npx playwright test tests/day2/browsers.spec.ts
```

```output terminal
Running 3 tests using 3 workers

Running in: chromium
Running in: firefox
Running in: webkit
  ✓  1 [chromium] › tests/day2/browsers.spec.ts:3:5 › same test, any browser (180ms)
  ✓  2 [firefox] › tests/day2/browsers.spec.ts:3:5 › same test, any browser (420ms)
  ✓  3 [webkit] › tests/day2/browsers.spec.ts:3:5 › same test, any browser (390ms)

  3 passed (2.6s)
```

**Read the output like a pro**

- `Running 3 tests using 3 workers` — 1 test × 3 browsers = 3 test runs, done in parallel by 3 workers
- `[chromium]`, `[firefox]`, `[webkit]` — the **project** (browser) each run used
- `tests/day2/browsers.spec.ts:3:5` — file, line 3, column 5, where the test is defined
- `(180ms)` — how long that run took
- The order of lines may differ on your machine, because the runs happen in parallel

Now run it on **one** browser only:

```bash terminal
npx playwright test tests/day2/browsers.spec.ts --project=webkit
```

```quiz
id: d2-i4-q1
type: single
question: A file has 4 tests and the configuration has 3 browser projects (chromium, firefox, webkit). How many test runs does `npx playwright test` report?
options:
  - "4"
  - "3"
  - "7"
  - "12"
answer: d
explanation: Every test runs once per project — 4 tests × 3 projects = 12 runs. Use `--project=chromium` to run just one browser while you're developing.
```

# Practice

## Quiz · Day 2 check

```quiz
id: d2-pr-q2
type: single
question: Put the Playwright layers in order from LARGEST to SMALLEST.
options:
  - Page → Context → Browser
  - Browser → Page → Context
  - Browser → Context → Page
  - Context → Browser → Page
answer: c
explanation: A Browser holds Contexts (isolated "incognito windows"), and each Context holds Pages (tabs).
```

```quiz
id: d2-pr-q4
type: multiple
question: Which of these come built into Playwright Test? (Select all that apply)
options:
  - An HTML report
  - A test runner with parallel workers
  - A code recorder (Codegen)
  - A native Android app driver
answer: [a, b, c]
explanation: Playwright Test ships a runner, assertions, reporters and tools such as Codegen, UI Mode and Trace Viewer. It does not automate native mobile apps.
```

```quiz
id: d2-pr-q5
type: single
question: Why does Playwright download its own browser builds during installation?
options:
  - Because it cannot work with any browser installed on your computer
  - Each Playwright version is tested with matching browser builds (and Firefox/WebKit builds are patched for automation)
  - To track your browsing history
  - Because Chrome is not free
answer: b
explanation: Playwright pins browser versions that it is tested against, and uses patched Firefox and WebKit builds. Branded Chrome/Edge can still be used via the `channel` option.
```

```quiz
id: d2-pr-q7
type: single
question: Which protocol does Playwright use to control Chromium?
options:
  - HTTP WebDriver (one request per command)
  - Chrome DevTools Protocol (CDP)
  - FTP
  - SMTP
answer: b
explanation: Playwright speaks the Chrome DevTools Protocol to Chromium over a persistent connection.
```

```quiz
id: d2-pr-q8
type: single
question: A test fails only when it runs right after another test that changed the user's language setting. Which Playwright feature is designed to prevent this?
options:
  - Codegen
  - A fresh browser context for every test
  - The HTML reporter
  - Headed mode
answer: b
explanation: This is a shared-state problem. Playwright Test gives each test its own context, so settings, cookies and storage from one test never leak into the next.
```

## Exercises

````exercise
id: d2-ex2
title: Choose the right tool
level: medium
type: written
prompt: |
  For each scenario, say whether Playwright is a good fit and **why** (one or two sentences each).

  1. A travel website must work on Chrome, Firefox and Safari. The team writes TypeScript.
  2. A bank wants to automate its native iOS app from the App Store.
  3. A company has 3,000 stable Selenium + Java tests and a team of Java experts. The tests work well.
  4. An e-commerce site's checkout tests keep failing randomly because pages load at different speeds.
  5. A test must check that when an admin approves a leave request, the employee (in another session) sees "Approved".
modelAnswer: |
  1. **Good fit** — one TypeScript test suite runs on Chromium, Firefox and WebKit (Safari's engine).
  2. **Not a fit** — Playwright automates web apps, not native mobile apps. Use a native tool such as Appium.
  3. **Probably keep Selenium** for the existing suite — it works and the team is skilled. Playwright could be piloted for *new* projects; a full migration may not be worth the cost.
  4. **Good fit** — auto-waiting and web-first assertions remove timing-based flakiness without fixed sleeps.
  5. **Good fit** — two browser contexts in one test act as two separate users (admin and employee) with separate sessions.
````

````exercise
id: d2-ex3
title: Explain Playwright to your manager
level: medium
type: written
prompt: |
  Your manager has never heard of Playwright. Write **4–6 sentences** explaining:
  - what it is,
  - how it controls browsers (in simple words),
  - two benefits for the team,
  - one limitation.
modelAnswer: |
  Playwright is a free, open-source tool from Microsoft that runs our web test cases automatically in real browsers — Chrome/Edge (Chromium), Firefox and Safari's engine (WebKit). Our test script sends instructions such as "click Log in" to Playwright, which keeps a live connection open to the browser, so it knows exactly when the page is ready before acting. That automatic waiting means far fewer random "flaky" failures than tools that rely on fixed waits. Every test also runs in a fresh, isolated browser session, so tests can run in parallel and finish much faster. It also produces an HTML report with errors and recordings for every run. One limitation: it only tests web applications — it can't automate our native mobile apps.
````

````exercise
id: d2-ex4
title: Predict the test count
level: easy
type: predict
codeLanguage: text
prompt: |
  The configuration has the projects **chromium** and **firefox** only. The folder `tests/` contains:
  - `login.spec.ts` with 3 tests
  - `search.spec.ts` with 2 tests

  How many test runs will `npx playwright test` report? And how many with `npx playwright test --project=firefox`?
code: |
  projects: chromium, firefox
  login.spec.ts  → 3 tests
  search.spec.ts → 2 tests
answer: |
  `npx playwright test` → (3 + 2) × 2 projects = **10** runs.
  `npx playwright test --project=firefox` → 5 tests × 1 project = **5** runs.
````

## Reflection

1. Explain **Browser → Context → Page** to a colleague using the incognito-window analogy.
2. Why is a persistent connection better than one HTTP request per command?
3. Name three Playwright features that reduce flaky tests.
4. Name two situations where Playwright is *not* the right tool.

> [!TIP] Coming up on Day 3
> You'll install Node.js and VS Code, create your own Playwright project with one command, explore every generated file, and run the sample tests.
