# Course Content Format — Weeks 1–2 (10 days)

The **Markdown files are the source of truth**. `tools/build_json.py` converts them into JSON that the course webpage loads. Edit the Markdown, then rebuild the JSON:

```bash
python3 tools/build_json.py          # writes json/day1.json … day10.json, week1.json, week2.json, course.json
python3 tools/export_files.py        # writes files/ (lesson files, starters, solutions)
python3 tools/verify_code.py         # runs every runnable code sample and exercise solution
```

## 1. File layout

```
markdown/day1.md … day10.md  ← author here (front matter has `week: 1|2`)
json/day1.json … day10.json  ← generated (one per day)
json/week1.json, week2.json  ← generated (5 days each)
json/course.json             ← generated (everything: { weeks: [{ week, title, days }] })
json/schema.json             ← JSON Schema for one day
files/                       ← generated: lessons/, starters/, solutions/ as real files
tools/build_json.py          ← Markdown → JSON converter + validator
tools/export_files.py        ← JSON → files/
tools/verify_code.py         ← runs code samples (needs Node 22.18+ and Playwright)
```

## 2. Structure of one day file

```markdown
---                       ← YAML front matter: day metadata
day: 1
week: 1
title: Introduction to Playwright & Architecture
subtitle: …
estimatedTime: 3 hours
topics: [...]
objectives: [...]
prerequisitesFromEarlierDays: [...]
workspace: pw-course/tests/day1/
---

# Prerequisites           ← H1 = section (exactly these four, in this order)
## P1 · How the web works ← H2 = lesson (becomes a page/tab in the UI)
### Sub-heading           ← H3+ stays inside the lesson as normal Markdown
...
# Fundamentals
# Implementation
# Practice
```

Section ids in JSON: `prerequisites`, `fundamentals`, `implementation`, `practice`.
Lesson ids are generated as `d{day}-{section}-{n}` (e.g. `d1-fundamentals-2`).

## 3. Special blocks

Everything that is not one of the blocks below is emitted as a `markdown` block.

### Code for the editor

````markdown
```ts file=tests/day9/signin.spec.ts mode=editor run="npx playwright test tests/day9/signin.spec.ts --project=chromium"
// code…
```
````

| Attribute | Meaning |
|---|---|
| `file=` | Path relative to the learner's workspace root (`pw-course/`). The UI can pre-create this file in the editor. |
| `mode=editor` | "Open in editor / Try it" block — runnable. |
| `mode=read` | Display only (snippets, partial code, pseudo-code). Default when `mode` is missing. |
| `run="…"` | Command the UI should run in the terminal for this file. The working directory is `pw-course/`, or `pw-course/ts-basics/` for files under `ts-basics/`. |
| `expect=error` | The sample is *supposed* to fail (type error or failing test) — used for teaching. |
| `network=true` | Needs internet (e.g. opens playwright.dev). |

### Other code fences

Fences with another language (`text`, `json`, `html`, or `bash` without `terminal`) become plain `code` blocks, for display only. Exception: a `json` block with `file=…` and `mode=editor` (such as `ts-basics/tsconfig.json` on Day 4) is a file for the editor.

### Terminal commands

````markdown
```bash terminal
npx playwright test --headed
```
````
→ `{ "type": "terminal", "commands": [...] }`. Lines starting with `#` are kept as comments.

### Expected output

````markdown
```output console
Asha is 25
```
````
`console` = exact program output (verified by `verify_code.py`); `terminal` = illustrative terminal output (timings/paths vary). An output block directly after a code block is also attached to that code block as `expectedOutput`.

### Diagrams

````markdown
```mermaid
flowchart LR
  A --> B
```
````
→ `{ "type": "diagram", "format": "mermaid", ... }` — render with mermaid.js.

### Collapsible reference (big tables the learner doesn't need yet)

````markdown
```reference title="More web-first assertions"
| Assertion | Passes when… |
|---|---|
| … | … |
```
````
→ `{ "type": "reference", "title": "…", "content": "<markdown>" }` — render **collapsed** behind a toggle that shows the title. The lesson text above it lists the few items to learn now.

### Callouts

```markdown
> [!TIP] Optional title
> Body text
```
Variants: `TIP`, `NOTE`, `WARNING`, `TESTER` (manual tester's lens — links the idea to manual-testing experience), `DEEPDIVE` (optional, for curious learners), `PLATFORM` (note for the course platform developers; hide from learners).

### Quiz (inline or in Practice)

````markdown
```quiz
id: d1-q1
type: single            # single | multiple | truefalse
question: Which engine powers Safari?
options:
  - Blink
  - WebKit
  - Gecko
answer: b               # letter(s) by option position; list for multiple: [a, c]; true/false for truefalse
explanation: Safari is built on WebKit.   # never refer to option letters here: options are shuffled
```
````

Options are shuffled once, at build time, in a fixed order that depends on the quiz `id`. This spreads the correct answers across all positions. In the JSON, `options` is already in the shuffled order, and `correct` refers to those new positions. Add `shuffle: false` to keep the authored order — for example, when the options are "All of the above"-style.

### Exercise (mostly in Practice)

````markdown
```exercise
id: d3-ex1
title: Build a tester profile
level: easy             # easy | medium | hard | challenge
type: code              # code | terminal | written | predict
                        # predict: add `codeLanguage: text` when the code is not runnable TypeScript
prompt: |
  What the learner must do (Markdown allowed).
file: ts-basics/day5/ex1.ts
run: node day5/ex1.ts   # cwd for ts-basics exercises is pw-course/ts-basics
starter: |
  // starting code shown in the editor
hints:
  - First hint
solution: |
  // model solution
expectedOutput: |
  exact console output of the solution
```
````
In JSON the exercise kind is stored as `exerciseType` (the block `type` is always `exercise`). `written` exercises use `modelAnswer` instead of `solution`. `predict` exercises show `code` and reveal `answer`.

#### Auto-grading: the `check` field

Every exercise in the JSON carries a `check` object so the page can grade it. It is derived automatically (or set explicitly with `check:` in the YAML):

| `check.kind` | When | How the page grades it |
|---|---|---|
| `stdoutEquals` | code exercise with `expectedOutput` (Days 4–8) | run `check.run` in `check.cwd`; stdout, with trailing spaces trimmed from each line, must equal `check.expected` |
| `testsPass` | code exercise on a `*.spec.ts` file | run `check.run` in `check.cwd`; exit code must be 0 (tests marked `test.fail()` count as passing, as in Playwright itself) |
| `typecheckPasses` | other code exercises: `playwright.config.ts`, and Day 10's `pages/`, `fixtures/`, `test-data/` files | type-check `check.file` (see below) |
| `commandsRun` | terminal exercise | each command in `check.commands` must exit 0 |
| `self` | written / predict | show the model answer; the learner self-assesses |

`cwd` is `pw-course` or `pw-course/ts-basics`, relative to the folder that holds the learner workspace.

**Type-checking in the Playwright project.** `pw-course` has no `typescript` package (Playwright doesn't need one to run tests), so the platform supplies the compiler. This is the command `verify_code.py` effectively uses, run from `pw-course/`:

```bash
tsc --noEmit --strict --target esnext --module preserve --moduleResolution bundler \
    --types node --skipLibCheck --ignoreConfig --pretty false <file>
```

**Type-checking in `ts-basics`.** Learners type `npm run check -- dayN/file.ts`. The `check` script, set up on Day 4, is `tsc --noEmit --strict --target esnext --module nodenext --allowImportingTsExtensions --ignoreConfig --pretty false`.
- `--ignoreConfig` makes `tsc` check just the named file even though `ts-basics/tsconfig.json` exists (TypeScript 7 otherwise stops with error TS5112).
- `--pretty false` prints each error on one line, so the output matches the lessons.

## 4. Learner workspace assumed by the content

```
pw-course/                 ← created on Day 3 by `npm init playwright@latest`
├── package.json           ← npm scripts added on Day 3 (test, report…) and Day 10 (test:smoke…)
├── playwright.config.ts   ← reporter changed on Day 3; timeouts, baseURL and screenshots added on Day 10
├── tests/
│   ├── example.spec.ts
│   ├── day1/, day2/       ← demo tests (pre-loaded by the platform — see files/lessons/tests/)
│   ├── day3/              ← learner exercises
│   ├── day9/              ← practice-pages.ts (QA Academy sign-in + enrol pages) and Day 9 specs
│   └── day10/             ← Day 10 specs
├── pages/                 ← Day 10: SignInPage.ts, EnrolPage.ts (page objects)
├── fixtures/              ← Day 10: index.ts (custom fixtures signInPage, enrolPage)
├── test-data/             ← Day 10: users.ts, messages.ts, enrolments.ts
├── utils/                 ← Day 10: practice-site.ts (serves the practice pages at https://qa-academy.test via page.route)
└── ts-basics/             ← created on Day 4: its own package.json ("type": "module"), tsconfig.json, and the check script
    └── day4/ … day8/
```

Days 1–2 and Day 9 load their pages with `page.setContent()`, and Day 2 also uses `page.route` for `https://shop.test`. Day 10 uses `page.goto('/signin')` with `baseURL: 'https://qa-academy.test'` plus `utils/practice-site.ts`. Everything runs offline except blocks marked `network=true`.

## 5. Platform requirements (from the content)

- **Node.js 22.18+, 24 or 26.** Days 4–8 run `.ts` files directly with `node file.ts`, using the built-in type stripping. Two consequences the content already respects:
  - `enum` is not used.
  - Imports of types use `import type`.
- **Playwright browsers:** `npx playwright install`. Chromium at minimum; Firefox and WebKit for the cross-browser lessons (Days 2, 3, 9 · I5, 10 · I6).
- **Days 1–2 run before learners install anything.** Pre-load a workspace with Playwright, `platform/playwright.config.ts`, and the demo tests in `files/lessons/tests/day1/` and `files/lessons/tests/day2/`.
- **Browser pane:** the "custom browser" pane should show the headed browser (or a screencast of it) when commands include `--headed`.
- **HTML report:** `npx playwright show-report` serves the report on `localhost:9323`.
- **`--debug` and `--ui`** open desktop windows, and the lessons label them "on your own computer".
- **Internet** is needed only for blocks marked `network=true` (they open playwright.dev).
