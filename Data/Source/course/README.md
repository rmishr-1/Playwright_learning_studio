# Playwright with TypeScript — Weeks 1–2 Course Content

**Audience:** manual testers with no coding background · **Format:** interactive webpage (theory + code editor + terminal + browser + console, no videos) · **Runtime:** real Node.js · **Versions:** Playwright 1.63, TypeScript 7.0, Node 22.18+

## The 10-day plan

The days follow the topic plan one topic block at a time. Each day is about 3 hours.

| Day | Title | Covers | Lessons | Quizzes | Exercises |
|---|---|---|---|---|---|
| **Week 1 — Playwright Foundations & TypeScript Basics** | | | | | |
| 1 | Introduction to Playwright & Architecture | What Playwright is; client–server architecture; Browser → Context → Page; first demo run | 15 | 31 | 5 |
| 2 | Why Playwright (Future of Automation) | Auto-waiting, web-first assertions, isolation and parallelism, cross-browser runs, tools, mocking; Selenium/Cypress comparison; where AI fits | 18 | 27 | 5 |
| 3 | Installation & Project Setup (Node.js, VS Code) | Node, npm and npx; the terminal; `npm init playwright@latest`; the generated project; running tests; npm scripts | 19 | 23 | 5 |
| 4 | JavaScript / TypeScript Fundamentals | Programs, statements and errors; JS vs TS; static typing; how TS runs; string, number and boolean; the `ts-basics` playground | 15 | 20 | 7 |
| 5 | Variables and Operators | let/const/var, scope, naming, template literals, arithmetic/comparison/logical operators, the ternary, text-versus-number traps | 14 | 24 | 8 |
| **Week 2 — TypeScript Essentials & the Test Runner** | | | | | |
| 6 | Data Types | Primitives, null/undefined, `??` and `?.`, arrays, tuples, objects, type aliases, destructuring, unions, literal types, `any` vs `unknown` | 14 | 20 | 8 |
| 7 | Conditions & Loops | Truthy/falsy, if/else, switch, narrowing, for, for...of, while, break/continue, array methods, a mini data-driven test | 16 | 25 | 9 |
| 8 | Functions, Async & Modules | Functions and parameters, arrow functions and callbacks, Promises, async/await, the missing-await bug, try/catch, import/export, a mini test runner | 15 | 28 | 7 |
| 9 | Playwright Test Runner Basics | Test anatomy, fixtures, locators, actions, web-first vs generic assertions, annotations, debugging, the HTML report | 17 | 22 | 6 |
| 10 | Framework Structure Overview | Framework layers, `playwright.config.ts` in depth, describe/hooks/tags/steps, test-data modules, page objects, custom fixtures, mini-project | 15 | 19 | 6 |

Lesson counts exclude the Practice section. Totals: 158 teaching lessons, 239 quizzes, 66 exercises.

Every day has **Prerequisites → Fundamentals → Implementation → Practice**. Fundamentals and Implementation lessons have short inline quizzes. Practice has a quiz, predict-the-output or spot-the-bug tasks, graded exercises (easy → challenge) and reflection questions.

## How this version was made

- **Topic-wise, from the sources.** Each day was written fresh for its topic from the sources, instead of being split from the earlier 5-day version:
  - playwright.dev (docs and API)
  - the BrowserStack Playwright tutorial
  - the tpointtech TypeScript tutorial
  - freeCodeCamp's *Learn TypeScript – The Ultimate Beginner's Guide*

  A few strong examples, such as the practice pages and the mini test runner, were carried over and reworked.
- **Concepts are explained before they are used.** For example, arrow callbacks get a "just enough" introduction on Day 7 and full coverage on Day 8. Classes are introduced on Day 10 only as far as page objects need them.
- **One running thread.** The tests stay close to the manual test cases they automate:
  - Day 6: a login test-data sheet.
  - Day 7: it gets looped through.
  - Day 8: it becomes a mini test runner.
  - Day 9: it becomes real Playwright tests.
  - Day 10: it is reorganised into a framework (tests → hooks and test data → page object and fixture).
- **Independent review.** A separate reviewer checked each day for facts, pedagogy and flow, and every finding was fixed. For Days 7–10, the ratings before fixes were 7.5–9/10 across accuracy, flow, language and fit for the format.

## What's in this package

```
markdown/            ← SOURCE OF TRUTH: day1.md … day10.md
json/                ← generated: day1…10.json, week1.json, week2.json, course.json, schema.json
files/               ← generated: every lesson file, exercise starter and solution as real files
  lessons/           ←   tests/dayN/…, ts-basics/…, and Day 10's pages/, fixtures/, test-data/, utils/, playwright.config.ts
  starters/          ←   exercise starter code
  solutions/         ←   model solutions
platform/            ← playwright.config.ts for the pre-loaded Days 1–2 workspace
tools/
  build_json.py      ← Markdown → JSON (+ validation of quizzes, ids, sections, auto-grading checks)
  lint_blocks.py     ← checks the YAML of every quiz and exercise block
  export_files.py    ← JSON → files/
  verify_code.py     ← runs every sample and solution and compares the output
FORMAT.md            ← authoring format + JSON block types (hand this to the platform developers)
```

After editing the Markdown, rebuild with:

```bash
python3 tools/lint_blocks.py markdown/*.md && python3 tools/build_json.py && python3 tools/export_files.py
```

## Verification

`tools/verify_code.py` passes **101/101 checks** on Node 22.22, Playwright 1.63 (Chromium) and TypeScript 7.0.2:

- **57 TypeScript samples and solutions** (Days 4–8). All type-check in strict mode, and their `node` output matches the lesson text character for character. The 5 intentional type-error samples produce exactly the errors shown.
- **15 predict-the-output answers** match the real output.
- **29 Playwright spec files, 61 tests** (Days 1, 2, 9 and 10, plus the Day 10 framework modules). They pass, skip, or fail exactly as the lessons say: 56 as expected, including `test.fail()` tests; 3 skipped; 2 debugging demos that fail on purpose. Every test file, page object, fixture and the Day 10 config type-check.
- **The JSON validates** against `json/schema.json`.

Not run automatically:

- The 2 blocks marked `network=true` need playwright.dev, and were type-checked only.
- Firefox and WebKit runs were not repeated, because only Chromium is installed in the build sandbox.
- Terminal-style outputs, such as timings and worker counts, are illustrative. They were captured from real runs, but will differ on other machines.

## Platform requirements

- **Node 22.18+ / 24 / 26.** Days 4–8 run `.ts` files directly with `node file.ts`, using Node's built-in type stripping. This is why the course uses literal types instead of `enum`, and teaches `import type`.
- **Browsers:** Chromium, Firefox and WebKit via `npx playwright install`.
- **Days 1–2 run before learners install anything.** Pre-load a workspace with `npm init playwright@latest`, `platform/playwright.config.ts` and `files/lessons/tests/day1/`, `tests/day2/`.
- **Workspace (from Day 3):** `pw-course/` with `ts-basics/` inside it (created on Day 4). On Day 10, learners add `baseURL: 'https://qa-academy.test'` to their config. Day 10 tests use that address together with `utils/practice-site.ts`, which serves the practice pages through `page.route`, so no internet is needed.
- **Browser pane:** show the browser for commands with `--headed`. `npx playwright show-report` serves on `localhost:9323`. `--debug` and `--ui` are marked "own computer".
- **Blocks to render specially:**
  - `reference`: a collapsed toggle.
  - `diagram`: render with mermaid.js.
  - Callouts with `variant: "platform"`: hide these from learners.
- **Exercise `check` objects** are described in `FORMAT.md`. `typecheckPasses` needs a TypeScript compiler supplied by the platform, because the Playwright project doesn't install one.
