# Concept coverage

What each built day teaches, by tab, so you can (a) cite the right earlier lesson, (b) never teach something before its day, and (c) avoid repeating a lesson. Verify details in `Data/Source/course/markdown/dayN.md` before citing a part number.

Week 1 builds the mindset, the setup and basic TypeScript; Week 2 finishes the TypeScript a tester needs and turns it into a structured Playwright project.

## Week 1 — Playwright Foundations & TypeScript Basics

### Day 1 · Introduction to Playwright & Architecture
- **Prerequisites:** manual vs automated testing; test levels (unit, API/integration, E2E); what to automate; request and response; HTML/CSS/JS; elements, attributes, labels, the DOM; DevTools Inspect; engines (Chromium, Gecko, WebKit); headed vs headless; glossary (script, library, framework, runner, package, fixture, protocol, action, assertion, locator, flaky, CI).
- **Fundamentals:** Playwright facts; Library vs Test (`playwright` vs `@playwright/test`); client–server architecture; persistent connection vs WebDriver HTTP; CDP; Chrome for Testing and `channel`; Browser → Context → Page; test isolation; the run lifecycle.
- **Implementation:** TC-101 turned into actions and assertions; `setContent`, `getByRole`, `getByLabel`, `getByText`, `fill`, `click`, `toBeVisible`, `toHaveTitle`; `await` and the `page` fixture; `npx playwright test <file> --project --headed`; reading pass and fail output; `DEBUG=pw:api`; `page.on('console')`; `browser.newContext()`, `context.route`/`fulfill`, `localStorage`, contexts vs tabs.

### Day 2 · Why Playwright
- **Prerequisites:** four causes of flakiness (timing, shared state, fragile locators, environment); "loaded is not ready"; sleeps vs explicit waits.
- **Fundamentals:** auto-waiting and the five actionability checks; strictness; retry and timeouts; web-first assertions vs one-time checks; default timeouts (5 s / 30 s); workers, `fullyParallel`, retries and "flaky"; projects, `devices`, mobile emulation; tools (Codegen, UI Mode, `--debug`, Trace Viewer, HTML report, VS Code extension); network mocking; API testing; Playwright vs Selenium vs Cypress and its limits; AI (Playwright MCP, accessibility tree, Test Agents).
- **Implementation:** auto-wait demo; actionability in the debug log; retrying vs one-shot assertions; `browserName` across three browsers; `--workers` and a loop creating tests; `page.route` with `fulfill({ json })` and `abort()`; `toHaveText([...])`; `--trace on`, `show-report`, codegen, `--ui`.

### Day 3 · Installation & Project Setup
- **Prerequisites:** Node.js, npm, npx; packages, `package.json`, `node_modules`, `package-lock.json`, dependencies vs devDependencies; terminal commands (`pwd`, `ls`, `cd`, `mkdir`, `clear`, `Ctrl + C`, Tab, ↑); semver, LTS and `^`.
- **Fundamentals:** system requirements; installing Node, VS Code and the extension; `npm init playwright@latest`; browser cache; project structure; run commands (`--headed`, `--project`, `-g`, `--list`, `show-report`, `--last-failed`, `:line`, `--workers`); the VS Code Testing panel; updating; troubleshooting.
- **Implementation:** versions; creating `pw-course`; reading `example.spec.ts`; first run and the HTML report; the reporter `[['list'], ['html', { open: 'never' }]]`; filters; break a test and read the error; npm scripts (`npm pkg set scripts.*`, `npm test`, `npm run`, options after `--`); running from VS Code.

### Day 4 · JavaScript / TypeScript Fundamentals
- **Prerequisites:** program, statement, order; `console.log`; values; `+` on numbers vs text; `const`; syntax rules (quotes, pairs, case, comments, semicolons, straight quotes); anatomy of an error.
- **Fundamentals:** JS history, ECMAScript, browser vs Node; TS as a superset; `tsc`, the language service; static vs dynamic typing; why tests use TS; **`tsc` checks, while Node and Playwright run without checking**; `string`, `number`, `boolean`; `typeof`; annotation vs inference.
- **Implementation:** the `ts-basics` playground (`npm init -y`, `"type": "module"`, the `check` script, `tsconfig.json`); `node file.ts` vs `npm run check -- file`; compiling to `.js`; the silent `'499'` bug; TS2322, TS2552, TS2551; syntax vs type vs runtime errors; IntelliSense and hover.

### Day 5 · Variables and Operators
- **Prerequisites:** recap checklist; why tests need variables; variable, operator, expression.
- **Fundamentals:** declaration anatomy and its four forms; assignment vs reassignment; `const` by default, `let` when needed, why not `var`; block scope; naming and camelCase; template literals; string `length`, `toUpperCase`, `trim`, `includes`; arithmetic (`%`, `**`, precedence, `0.1 + 0.2`, `toFixed`, `NaN`); `+=`, `++`; `===` vs `==`; `Number()`/`String()` and the `''` → 0 trap; `&&`, `||`, `!`; the ternary (preview of `process.env.CI ? 2 : 0`).
- **Implementation:** test data with chained methods; counters; metrics and a release decision; the string-vs-number trap (TS2367); scope errors (TS2588, TS2448, TS2454, TS2304).

## Week 2 — TypeScript Essentials & the Test Runner

### Day 6 · Data Types
- **Fundamentals:** primitives; `null` vs `undefined`; `??` and `?.`; arrays (index, `length`, `push`, `pop`, `includes`, `indexOf`, `join`, `split`; `const` arrays can change); tuples and array destructuring; objects, type alias vs interface, optional `?`, excess-property typos; object destructuring → `{ page }`; unions, narrowing with `typeof`, literal types; `any` vs `unknown`. (`enum` is avoided on purpose.)
- **Implementation:** a registration record; an array of LoginCase objects (the course's login test-data sheet); a browser matrix with a literal type and tuples; cleaning text (`trim`, `replace`, `replaceAll`, `split`, `Number`); a "type detective" with five errors.

### Day 7 · Conditions & Loops
- **Fundamentals:** truthy and falsy, `||` vs `??`; `if`/`else if`/`else`; narrowing with `!== undefined`; `switch`, `break`, fall-through; choosing `if` vs `switch` vs ternary; `for` with a trace table and off-by-one; `for...of`, `Object.entries`, the `for...in` warning; `while`, `do...while`, `break`, `continue`; reading arrow functions; `forEach`, `map`, `filter`, `find`, `some`, `every`.
- **Implementation:** load-time rating and a status switch; a mini data-driven login runner (loops over the Day 6 sheet); a password checker with nested loops; a retry loop with a limit; a report built with array methods; spot the loop bugs.

### Day 8 · Functions, Async & Modules
- **Fundamentals:** functions, parameters vs arguments, return types, early `return`, `void`, scope; optional, default and rest parameters; options objects; arrow functions, callbacks, function types; the test callback; sync vs async, `setTimeout`, Promise states, `sleep`; `async`/`await`, the missing-`await` bug, `forEach` not waiting; `throw`/`try`/`catch`/`finally`; named vs default exports, `import type`, `@playwright/test`.
- **Implementation:** a helpers toolbox; the password checker as functions; a fake browser test; the missing-await demo; catching errors; a three-module mini test runner.

### Day 9 · Playwright Test Runner Basics
- **Prerequisites:** roles and accessible names; the QA Academy practice pages (`tests/day9/practice-pages.ts`: `signInPage`, `enrolPage`; `student@qa.academy` / `Learn@123`).
- **Fundamentals:** test anatomy and Arrange–Act–Assert; runner rules (`.spec.ts`, isolation); fixtures (`page`, `context`, `browser`, `browserName`, `request`); locator priority, CSS/XPath last, `exact`, strictness, `filter`, `first`, `nth`; actions (`goto`, `setContent`, `click`, `fill`, `press`, `check`, `selectOption`); web-first vs generic assertions, `.not`; annotations (`skip`, `fixme`, `fail`, `slow`, `only`); running and debugging (`--headed`, `-g`, `show-report`, `--trace on`, `--debug`, `--ui`).
- **Implementation:** a first test; a TC-201–205 suite; every locator; the enrol page; annotations; debugging a failure (call log, Error Context); the HTML report.

### Day 10 · Framework Structure Overview
- **Fundamentals:** framework layers and naming; every setting in `playwright.config.ts` (`testDir`, `fullyParallel`, `forbidOnly`, `retries`, `workers`, `timeout`, `expect.timeout`, `reporter`, `use` with `baseURL`, `trace`, `screenshot`, `video`, `actionTimeout`; `projects` and `devices`); `test.describe` and the four hooks; tags with `--grep`/`--grep-invert`; `test.step`; custom `expect` messages; `expect.soft`; test data vs utils; secrets in `process.env`/`.env`; page object classes (`class`, `readonly`, `constructor`, `this`, `new`); custom fixtures with `base.extend`.
- **Implementation:** the config; folders and `utils/practice-site.ts` (`serveQaAcademy(page)` serves the pages at `https://qa-academy.test` with `page.route`); test-data modules; describe, hooks, tags and steps; hook order; `SignInPage` with a fixture; npm scripts with `--list`.
- **Practice:** a five-step mini-project.

## Running threads to reuse

| Thread | Where it lives |
|---|---|
| TC-101 / Asha's login (`asha@example.com`, `Secret@123`) | Day 1 `tests/day1/practice-shop.ts` |
| Shop pages (checkout, order, settings, products at `https://shop.test`) | Day 2 `tests/day2/*-page.ts` |
| Login test-data sheet → loop → mini runner → real tests → framework | Days 6 → 7 → 8 → 9 → 10 |
| QA Academy practice site (sign-in, enrol) | Day 9 `tests/day9/practice-pages.ts`, Day 10 `utils/practice-site.ts` |
| Products with ₹ prices (Monitor ₹8999, Webcam ₹2499, Headset ₹1799) | Days 6–8 |

## Not yet taught — weeks 3–8

From `Data/Source/course-plan.json` (modules and focus) and the gaps above. A new week should build on `pw-course/`, the QA Academy site and the Day 10 framework.

| Week | Module | Focus | Natural topics (not yet in the course) |
|---|---|---|---|
| 3–4 | Core Playwright | Test development & execution | Locators in depth (chaining, `has`, frames), forms and dropdowns, dialogs, file upload and download, multiple tabs and popups, keyboard and mouse, waiting strategies and timeouts in depth, assertions in depth, screenshots, test organisation, data-driven tests with `test.describe` loops |
| 5 | Advanced Automation | Advanced UI & test capabilities | Network interception in depth, HAR, authentication and `storageState`, visual comparisons, mobile emulation, iframes and shadow DOM, clock, accessibility checks |
| 6 | Framework Design | Scalable test architecture | Page object design, fixtures in depth (worker scope, auto fixtures), configuration per environment, reporters, project dependencies (setup projects), parallelism and sharding |
| 7 | Real-World Implementation | Project-based learning | An end-to-end project on a realistic app, test planning from requirements, CI with GitHub Actions, triaging flaky tests |
| 8 | Mastery & Scale | Enterprise readiness & API testing | API testing with `request`, mixing API and UI, test data management, tagging and selective runs at scale, Docker, maintenance and review practices |

Confirm the topic list with the user before writing a new week; the table above is a starting point, not a decision.
