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
title: Why Playwright & How It Works
...
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
```ts file=tests/day5/login.spec.ts mode=editor run="npx playwright test tests/day5/login.spec.ts --headed"
// code…
```
````

| Attribute | Meaning |
|---|---|
| `file=` | Path relative to the learner's workspace root (`pw-course/`). The UI can pre-create this file in the editor. |
| `mode=editor` | "Open in editor / Try it" block — runnable. |
| `mode=read` | Display only (snippets, partial code, pseudo-code). Default when `mode` is missing. |
| `run="…"` | Command the UI should run in the terminal for this file (cwd = `pw-course/`). |
| `expect=error` | The sample is *supposed* to fail (type error or failing test) — used for teaching. |
| `network=true` | Needs internet (e.g. opens playwright.dev). |

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
explanation: Safari is built on WebKit.
```
````

### Exercise (mostly in Practice)

````markdown
```exercise
id: d3-ex1
title: Build a tester profile
level: easy             # easy | medium | hard | challenge
type: code              # code | terminal | written | predict
prompt: |
  What the learner must do (Markdown allowed).
file: ts-basics/day3/ex1.ts
run: node day3/ex1.ts   # cwd for ts-basics exercises is pw-course/ts-basics
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
| `stdoutEquals` | code exercise with `expectedOutput` | run `check.run` in `check.cwd`; trimmed stdout must equal `check.expected` |
| `testsPass` | code exercise on a `*.spec.ts` file | run `check.run` in `check.cwd`; exit code must be 0 |
| `typecheckPasses` | other code exercise (e.g. editing `playwright.config.ts`) | `npx tsc --noEmit` on `check.file` must pass |
| `commandsRun` | terminal exercise | each command in `check.commands` must exit 0 |
| `self` | written / predict | show the model answer, learner self-assesses |

`cwd` is `pw-course` or `pw-course/ts-basics`, relative to the folder that holds the learner workspace.

## 4. Learner workspace assumed by the content

```
pw-course/                 ← created on Day 3 by `npm init playwright@latest`
├── package.json
├── playwright.config.ts
├── tests/
│   ├── example.spec.ts
│   ├── day1/, day2/       ← demo tests (pre-loaded by the platform — see files/lessons/tests/)
│   ├── day3/, day4/       ← learner exercises
│   ├── day9/              ← practice-pages.ts + Day 9 specs
│   └── day10/             ← Day 10 specs (import ../day9/practice-pages)
└── ts-basics/             ← created on Day 5 (own package.json with "type": "module")
    ├── package.json
    └── day5/ … day8/
```

## 5. Platform requirements (from the content)

- Node.js 22.18+ (or 24.x / 26.x) in the runtime — Days 5–8 run `.ts` files directly with `node file.ts` (built-in type stripping).
- Playwright browsers installed (`npx playwright install`) — Chromium at minimum; Firefox + WebKit for the cross-browser lessons.
- **Days 1–2 run before learners install anything** → pre-load a workspace with Playwright, `platform/playwright.config.ts` and the demo tests in `files/lessons/tests/day1/` and `tests/day2/`.
- The "custom browser" pane should show the headed browser (or a screencast of it) when commands include `--headed`.
- Internet access is needed only for blocks marked `network=true` (they open playwright.dev). Everything else uses `page.setContent()` and runs offline.
