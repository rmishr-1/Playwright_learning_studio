# Playwright with TypeScript — Weeks 1–2 Course Content

**Audience:** manual testers with no coding background · **Format:** interactive webpage (theory + code editor + terminal + browser + console) · **Runtime:** real Node.js

## The 10-day plan

| Day | Title | Covers | Lessons | Quizzes | Exercises |
|---|---|---|---|---|---|
| **Week 1 — Playwright Foundations & Setup** | | | | | |
| 1 | From Manual Testing to Automation | Manual vs automation, HTML/DOM, browsers, what Playwright is, **first demo run** | 8 | 11 | 2 |
| 2 | How Playwright Works & Why Teams Choose It | Architecture, Browser → Context → Page, features, Selenium/Cypress comparison | 9 | 18 | 3 |
| 3 | Setting Up Your Tools & Project | Node/npm/npx, terminal, VS Code, `npm init playwright@latest`, generated files, first run | 11 | 11 | 2 |
| 4 | Configuring & Running Tests | `playwright.config.ts`, CLI cheat sheet, reading failures, npm scripts, framework structure | 10 | 10 | 3 |
| 5 | TypeScript I: First Program, Variables & Operators | Running/checking TS, JS vs TS, let/const, primitives, operators | 9 | 16 | 4 |
| **Week 2 — TypeScript & the Test Runner** | | | | | |
| 6 | TypeScript I: Arrays, Objects & Types for Test Data | Arrays, tuples, objects, type aliases, union/literal types, `any` | 7 | 9 | 4 |
| 7 | TypeScript II: Conditions, Loops & Functions | if/switch, loops, array methods, functions, arrow functions, callbacks | 8 | 12 | 5 |
| 8 | TypeScript II: Async, Modules & Your Own Test Runner | Interfaces, destructuring, spread, Promises, async/await, try/catch, modules, mini runner | 7 | 12 | 3 |
| 9 | Playwright Test Runner I: Your First Real Tests | Test anatomy, fixtures, locators, actions, assertions, describe, hooks, sign-in suite | 10 | 13 | 2 |
| 10 | Playwright Test Runner II: Control, Debug & Ship | Annotations, tags, runner internals, CLI filtering, debugging, HTML report, **mini-project** | 7 | 9 | 3 |

(Lesson counts exclude the Practice section. Total: 86 teaching lessons, 121 quizzes, 31 exercises.)

Every day has **Prerequisites → Fundamentals → Implementation → Practice**, short quizzes inside Fundamentals and Implementation, and a quiz + exercises + reflection in Practice. Days 2, 4, 6, 8 and 10 open with a recap quiz or checklist of the previous day.

## What changed in this version

1. **Two weeks instead of one.** Each original day became two: theory-heavy days are shorter (2–2.5 h), and every day now has at most 4–5 new concepts.
2. **Demo before theory.** Day 1's second Fundamentals lesson is the auto-wait demo, so learners run a real test in the first hour. Day 1 also gains a "tour of the DOM" test that connects the HTML lesson to the browser pane.
3. **Reference tables collapsed.** The config-settings, assertions and tool-comparison tables now show "learn these now" (4–5 items) with the full table behind a toggle (`reference` block).
4. **Auto-grading.** Every exercise in the JSON carries a `check` object (`stdoutEquals`, `testsPass`, `typecheckPasses`, `commandsRun`, `self`) — see `FORMAT.md`.
5. **Two new implementation samples** (Day 5 strings, Day 7 checklist) so the split days keep a hands-on step each; Day 7 uses `type` instead of `interface` (taught Day 8).
6. **Week 2 practice pages** live in `tests/day9/practice-pages.ts`; Day 10 tests import them from there.

## What's in this package

```
markdown/            ← SOURCE OF TRUTH: day1.md … day10.md
json/                ← generated: day1…10.json, week1.json, week2.json, course.json, schema.json
files/               ← generated: every lesson file, exercise starter and solution as real files
platform/            ← playwright.config.ts for the pre-loaded Days 1–2 workspace
tools/
  build_json.py      ← Markdown → JSON (+ validation of quizzes, ids, sections, checks)
  export_files.py    ← JSON → files/
  verify_code.py     ← runs every sample and solution and compares the output
FORMAT.md            ← authoring format + JSON block types (hand this to the platform developers)
```

Workflow after editing Markdown: `python3 tools/build_json.py && python3 tools/export_files.py`.

## Verification (done)

`tools/verify_code.py` passes **59/59 checks** on Node 22.22, Playwright 1.63 and TypeScript 7.0:

- All TypeScript samples and solutions type-check in strict mode, and their `node` output matches the lesson text character for character.
- The 2 intentional type-error samples produce exactly the errors shown.
- All 6 "predict the output" answers match real output.
- 33 Playwright tests run: they pass, skip or fail (the 2 debugging demos) exactly as the lessons say. Every test file type-checks.
- JSON validates against `json/schema.json`.
- Prose was fact-checked against playwright.dev by a separate reviewer (previous version); the restructure moved text without changing facts.

Not run: the 2 blocks marked `network=true` open playwright.dev (no internet in the sandbox) — type-checked only.

## Platform requirements

- **Node 22.18+ / 24 / 26.** Days 5–8 run `node file.ts` directly.
- **Browsers:** Chromium, Firefox and WebKit via `npx playwright install`.
- **Days 1–2 run before learners install anything.** Pre-load a workspace with `npm init playwright@latest`, `platform/playwright.config.ts` and `files/lessons/tests/day1/`, `files/lessons/tests/day2/`.
- **Browser pane:** show the browser for commands with `--headed`. `npx playwright show-report` serves on `localhost:9323`.
- **Blocks to render specially:** `reference` (collapsed toggle), `diagram` (mermaid.js), callouts with `variant: "platform"` (hide from learners).

> In the Learning Studio, `markdown_v1/` (the previous 5-day version) and the one-off
> `restructure*.py` scripts that turned it into this 10-day split are left out: this version replaces it.
