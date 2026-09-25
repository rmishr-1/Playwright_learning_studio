# Course content format (Playwright Learning Studio)

The JSON the app reads for the course. `Data/Content/` is **generated**: `npm run build:content`
writes it from `Data/Source/`, so a hand edit is overwritten on the next build.

The authoritative definitions are `shared/contracts/course_index.ts` and
`shared/contracts/course_day.ts`, mirrored in `Data/Formats/*_format.json`; see
`Data/Formats/FORMAT-REGISTRY.md` before changing any format.

## Folder structure

```text
Data/Content/
├── course-index.json          the course outline (weeks and days that are built)
├── course-plan.json           every planned week: module, colour, focus
├── workspaces.json            starting files for the Terminal workspaces
└── weeks/
    ├── week-1/
    │   ├── day-1.json         one file per day: weeks/week-N/day-N.json
    │   ├── ...
    │   └── day-5.json
    └── week-2/
        ├── day-1.json
        ├── ...
        └── day-5.json
```

Limits: weeks 1–8, days 1–5 per week, 1–4 parts per day, practice problems 1–20.

## course-index.json

```jsonc
{
  "schema": "course-index/v1",
  "title": "Playwright with TypeScript",
  "totals": { "weeks": 2, "days": 10, "parts": 40, "practice_problems": 55, "available_days": 10 },
  "weeks": [
    {
      "week": 1,
      "theme": "Fundamentals, Setup & Programming",
      "locked": false,
      "days": [
        { "day": 1, "number": 1, "title": "From Manual Testing to Automation", "locked": false }
        // "day" = position in the week (1-5, used in URLs)
        // "number" = day number across the course (Week 2 Day 1 = 6)
      ]
    }
  ]
}
```

## course-plan.json

Lists every planned week, built or not; a planned week with no days yet shows as "Opens soon".

```jsonc
{
  "description": "optional course description",
  "modules": {
    "foundation": { "name": "Foundation", "color": "#1f4e9c" }
  },
  "weeks": [
    { "week": 1, "module": "foundation", "focus": "Fundamentals, Setup & Programming" }
  ]
}
```

## weeks/week-N/day-N.json

```jsonc
{
  "schema": "course-day/v2",
  "week": 1,
  "day": 3,
  "number": 3,
  "title": "Setting Up Your Tools & Project",
  "locked": false,
  "workspace": "demo",            // "demo" | "project"
  "parts": [                      // 1-4, in order; never assume four
    {
      "part": 1,                  // 1 | 2 | 3 | 4
      "kind": "prerequisite",     // "prerequisite" | "concept" | "practice"
      "title": "Node.js, npm and npx in plain words",
      "tab_label": "Prerequisites",
      "has_runnable_code": true,
      "blocks": [ /* ContentBlock, below */ ],
      "problems": [ /* PracticeProblem, below */ ]
    }
  ]
}
```

- `workspace`: `demo` is ready-made with the day's own files, for days before the learner has a
  project; `project` is the learner's own project, as `npm init playwright@latest` leaves it.

## ContentBlock

Every block has every field; the ones its type does not use are `null`.

```jsonc
{
  "type": "markdown",
  // "markdown" | "code" | "terminal" | "callout" | "diagram" | "reference" | "example" |
  // "your-turn" | "problem-ref" | "at-a-glance" | "checkpoint" | "recap"
  "text": "...",
  // markdown for markdown/callout/at-a-glance/recap; source for code/example/your-turn;
  // commands (one per line) for terminal; mermaid for diagram; the question for checkpoint;
  // the exercise number as a string for problem-ref
  "starter": null,                            // your-turn only: runnable starting code
  "variation": null,                          // your-turn only: { "prompt": "..." }
  "checkpoint": null,                         // checkpoint only:
  //   { "options": ["..", ".."],             // 2-8 options
  //     "answers": [1],                      // indexes into options
  //     "kind": "single",                    // "single" | "multiple" | "truefalse"
  //     "explanation": "..." }
  "code": null,                               // code only:
  //   { "language": "ts", "file": "tests/example.spec.ts" /* or null */,
  //     "run": "npx playwright test" /* or null */, "mode": "editor" /* | "read" */,
  //     "expect_error": false, "network": false }
  "callout": null,                            // callout only:
  //   { "variant": "tip" /* | "note" | "warning" | "tester" | "deepdive" */, "title": null }
  "title": null                               // reference only: title shown while collapsed
}
```

Block types:

| Type | What it is |
|---|---|
| `markdown` | Prose. Output samples are markdown too, as ```` ```output ```` fences. |
| `code` | A code sample, with the file it belongs to and the command that runs it. |
| `terminal` | Commands to type in a terminal, one per line. |
| `callout` | A boxed note: a tip, a warning, the manual tester's view, and so on. |
| `diagram` | A mermaid diagram. |
| `reference` | A full reference table or list, collapsed behind its title. |
| `example`, `your-turn` | Editor code without a file of its own. |
| `problem-ref` | Where a practice exercise sits; its text is the exercise's number. |
| `at-a-glance`, `recap` | Open a day and close a lesson; both render as cards. |
| `checkpoint` | A quiz question: formative, never scored or recorded. |

## PracticeProblem

```jsonc
{
  "number": 1,
  "difficulty": "Easy",          // "Easy" | "Medium" | "Hard" | "Challenge" | null
  "title": null,
  "kind": "code",                // "code" | "terminal" | "written" | "predict"
  "statement": "markdown: what to do",
  "stub": "code the editor starts with",   // null = no "Start in editor" button
  "hints": ["revealed one at a time"],
  "file": "tests/day9/logout.spec.ts",     // or null
  "run": "npx playwright test tests/day9/logout.spec.ts",   // or null
  "check": null,
  // or { "kind": "stdoutEquals", "run": "node day5/cart.ts", "expected": "exact output" }
  // or { "kind": "testsPass", "run": "npx playwright test tests/day9/logout.spec.ts" }
  "solution": "markdown (code answers in a fence)"   // null = no reveal button
}
```

- `stdoutEquals`: the program's output, trimmed, must equal `expected`.
- `testsPass`: the command must succeed; for `npx playwright test` that means every test passed.

## workspaces.json

```jsonc
{
  "schema": "workspace-seeds/v1",
  "workspaces": {
    "demo":    { "files": { "tests/day1/auto-wait.spec.ts": "file contents...", "ts-basics/package.json": "..." } },
    "project": { "files": { "tests/day9/practice-pages.ts": "...", "ts-basics/day8/helpers.ts": "..." } }
  }
  // paths are relative to the workspace, and must sit under tests/ or ts-basics/
  // a day's files use its course-wide number in the path (tests/day9/...)
}
```

## Rules the app relies on

1. Never assume four parts or three problems; check `blocks.length` and `has_runnable_code`.
2. `solution: null` means the reveal button is absent, not broken.
3. A locked day still loads and shows as locked; links into it never 404.
4. `number` (the course-wide day) is what lessons and file paths use; `day` (1–5 within the week)
   is what URLs use, as in `/learn/w2/d1/p1`.
