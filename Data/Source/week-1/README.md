# Playwright with TypeScript — Week 1 Course Content

**Audience:** manual testers with no coding background · **Format:** interactive webpage (theory + code editor + terminal + browser + console) · **Runtime:** real Node.js

| Day | Title | Covers (from the syllabus) | Lessons | Quizzes | Exercises |
|---|---|---|---|---|---|
| 1 | Why Playwright & How It Works | Introduction & Architecture · Why Playwright (Future of Automation) | 17 | 25 | 5 |
| 2 | Setup & Your First Test Run | Installation & Project Setup (Node.js, VS Code) · Framework Structure Overview | 23 | 19 | 5 |
| 3 | TypeScript Foundations I | JS/TS Fundamentals · Variables · Operators · Data Types | 16 | 22 | 8 |
| 4 | TypeScript Foundations II | Conditions · Loops · Functions · **+ async/await, destructuring, modules** | 17 | 21 | 8 |
| 5 | Playwright Test Runner Basics | Test Runner Basics · framework structure applied · Week 1 mini-project | 21 | 19 | 5 |

Every day has the four sections **Prerequisites → Fundamentals → Implementation → Practice**, with short quizzes inside Fundamentals and Implementation and a full quiz + exercises in Practice.

## Changes from the original syllabus

- **Order:** Playwright intro & setup (Days 1–2) → TypeScript (Days 3–4) → Test Runner (Day 5). The test runner needs arrow functions and `async`/`await`, so TypeScript comes first.
- **Added to Day 4:** `async`/`await` & Promises, object destructuring (`{ page }`), spread (`...devices[…]`), `import`/`export`. Every Playwright line depends on these.
- **Added to Day 1:** HTML/DOM basics as a prerequisite.
- **Day 4 ends with a home-made mini test runner.** Day 5's real runner then feels familiar.
- **Day 5 practice pages** are loaded with `page.setContent()`, so all Day 5 tests run offline and give the same result every time.

## What's in this package

```
markdown/            ← SOURCE OF TRUTH: day1.md … day5.md (edit these)
json/                ← generated: day1.json … day5.json, week1.json, schema.json
files/               ← generated: every lesson file, exercise starter and solution as real files
platform/            ← playwright.config.ts for the pre-loaded Day 1 workspace
tools/
  build_json.py      ← Markdown → JSON (+ validation of quizzes, ids, sections)
  export_files.py    ← JSON → files/
  verify_code.py     ← runs every sample and solution and compares the output
FORMAT.md            ← authoring format + JSON block types (hand this to the platform developers)
```

Workflow after editing: `python3 tools/build_json.py && python3 tools/export_files.py`.

## Verification (done)

`tools/verify_code.py` passes **56/56 checks** on Node 22.22, Playwright 1.63 and TypeScript 7.0:

- All 35 TypeScript samples and solutions type-check in strict mode. Their `node` output matches the lesson text character for character.
- The 2 intentional type-error samples produce exactly the errors shown.
- All 6 "predict the output" answers match real output.
- 32 Playwright tests run: they pass, skip or fail (the 2 debugging demos) exactly as the lessons say. Every test file also type-checks.
- The prose was fact-checked against playwright.dev by a separate reviewer, and its corrections were applied.

Not run here: the 2 blocks marked `network=true` open playwright.dev, and this sandbox has no internet. They are the official scaffold example and were type-checked only.

## Platform requirements

- **Node 22.18+ / 24 / 26.** Days 3–4 run `node file.ts` directly.
- **Browsers:** Chromium, Firefox and WebKit via `npx playwright install`.
- **Day 1 runs before learners install anything.** Pre-load a workspace with `npm init playwright@latest`, `platform/playwright.config.ts` and `files/lessons/tests/day1/*.spec.ts`.
- **Browser pane:** it should show the browser for commands with `--headed`. `npx playwright show-report` serves on `localhost:9323`.
- **Callouts:** hide callouts with `variant: "platform"` from learners. Render `diagram` blocks with mermaid.js.
