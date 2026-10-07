# Day structure and teaching flow

A day is one file, `Data/Source/course/markdown/dayN.md`, about **3 hours** of work. It has YAML front matter and exactly four tabs (H1), in this order:

```
# Prerequisites
# Fundamentals
# Implementation
# Practice
```

Lessons are H2, numbered per tab with a middle dot: `## P1 · …`, `## F3 · …`, `## I5 · …`. H3 splits a long part (`### Step 1 — Node.js (npm comes with it)`). Code in headings is fine: `## F2 · \`null\` and \`undefined\` — the empty values`. An em-dash subtitle is common: `## F3 · Arrays — ordered lists`.

## What each tab is for

| Tab | Purpose | Size |
|---|---|---|
| **Prerequisites** (P#) | What a beginner lacks before today: a recap, terms, background, and *why today matters*. | 2–5 parts |
| **Fundamentals** (F#) | The concepts: definitions, comparison tables, mermaid diagrams, `mode=read` snippets, doc quotes, inline quizzes. No running code. | 5–8 parts |
| **Implementation** (I#) | Hands-on: runnable editor files, terminal commands, real output, explanation tables, Try-it variations, a deliberate failure. | 5–9 parts |
| **Practice** | Review and apply: the day quiz, predict or spot-the-bug items, 5 exercises, reflection, the next-day teaser. | fixed headings |

### Prerequisites

- **P1** is either background ("From manual testing to automated testing") or, from Day 5 on, a recap checklist:
  ```markdown
  ## P1 · Quick recap from Day 5
  - [ ] Declare a value with `const`, and with `let` when it changes (Day 5 · F2)
  - [ ] Build text with a template literal (Day 5 · F5)
  ```
  It ends with 1–2 recap quizzes.
- **P2** motivates the day from manual testing: a manual-to-code table, often a mermaid diagram, a `[!TESTER]` callout and one scenario quiz.
- Extra P parts set up what the day needs, for example Day 9 · P3 creates the practice pages.

### Fundamentals: order inside a part

1. A one-line hook, tied to manual testing or to an earlier day.
2. The bold definition.
3. The smallest `ts mode=read` snippet, with `// result` comments on the same line.
4. A table of parts, methods or variants.
5. The trap, as an H3 or a `[!WARNING]`.
6. The tie to Playwright: how this shows up in a test.
7. A callout, if it adds something new.
8. 1–3 quizzes, always the **last** thing in the part.

### Implementation: order inside a part

1. A context sentence, naming the file.
2. Any page fixture file (`mode=editor`, no run), then the runnable file (`mode=editor run="…"`).
3. The real output (`output console` for `node`, `output terminal` for the test runner or `tsc`).
4. A dissection table: "What to notice", "Read the output like a tester", or `Part | Meaning`.
5. **Try it:** one concrete change to make, and what will happen.
6. Optionally a quiz.

The Implementation tab opens with one line saying where today's files go and how to run them:

> All files today go in `ts-basics/day6`. Run with `node day6/<file>.ts`, check with `npm run check -- day6/<file>.ts`.

Every day has a **deliberate-failure part**: "I7 · Break it on purpose — and read the error", "I5 · Fix three variable mistakes", a "type detective" with five errors, "spot the loop bugs", or "debug a failure" with the call log.

### Practice: fixed headings, in this order

```markdown
## Quiz · Day N check          ← about 8 quizzes (10 on Days 1–2)
## Predict the output          ← TypeScript days; or "## Spot the bug" (Day 9), "## Where does it belong?" (Day 10)
## Exercises                   ← 5 exercises; Day 10 uses "## Mini-project · …"
## Reflection                  ← 4–6 numbered questions
> [!TIP] Coming up on Day N+1  ← one or two sentences; Day 10: "> [!TIP] Two weeks done"
```

Reflection example: "Before moving on, make sure you can answer these out loud:" then a numbered list of short questions.

## How concepts are explained

The pattern, step by step:

1. Start from a testing need or from yesterday.
2. Give a one-sentence bold definition.
3. Compare in a table: old way vs new way, A vs B.
4. Draw a diagram for anything with flow or structure (mermaid).
5. Show a minimal snippet, commented line by line (`// Step 1: open the login page`).
6. Say why it matters to a tester.
7. Check with a quiz.
8. In Implementation, prove it live, usually by breaking it on purpose.

Common table shapes (reuse their column names):

- `Term | Plain-English meaning`
- `You want… | Write | Result`
- `Part | Here | Meaning`
- `Method | What it does | Example | Result`
- `Operator | Meaning | Example | Result`
- `Cause | What happens | Manual-testing equivalent`
- `Error | Line | What it means | Fix`
- `Message | Likely cause | Fix` (troubleshooting)
- `Symptom | Bug | Fix`
- `Rule | Right | Wrong`
- `Log line | What Playwright is thinking`
- `Your mini runner | Playwright Test` (comparing what you built with the real thing)

Tables with no label for the first column start with an empty header cell: `| | Manual testing | Automated testing |`.

## Expected output

- Every runnable editor block is followed directly by its real output.
- Shorten long runner output with `  …` lines, and say so: "Here is the output, shortened".
- Show failures in full: Expected / Received / the `>` line and `^` marker. Then read it: where, what, why.
- Add a caveat for what varies: "The number of workers, the order of the lines, and the times will differ on your machine."

## Cross-references

- Same day: "(F6)", "as in I6", "the 'timing' row from P1".
- Earlier day: "(Day 6 · F5)", "Day 4 · I1–I2", "(Day 3 · I8)".
- Forward: "(Day 9 covers assertions in depth.)", "Day 8 shows why."
- Decode earlier "magic" explicitly when its day comes: "Decoding the waiting line from Day 2".

## How the weeks differ

- **Week 1** (Days 1–5): demonstrate and watch it run; more diagrams and `[!TESTER]`; `truefalse` quizzes allowed; `reference` blocks for "for later" detail; pre-loaded demo workspace on Days 1–2.
- **Week 2** (Days 6–10): more syntax depth (16–26 `mode=read` snippets a day), every TypeScript feature tied back to Playwright, 3–4 predict-the-output items a day, the deliberate-bug part every day, and a growing project: the login data sheet (Day 6) is looped (Day 7), becomes a mini runner (Day 8), real tests (Day 9) and a framework (Day 10).
- New weeks (3–8) should keep the Week 2 depth and build on `pw-course/` and the QA Academy practice site.
