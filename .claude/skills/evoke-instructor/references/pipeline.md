# Build, verify and commit

```
markdown/dayN.md                      ← you write here (source of truth)
  │  python3 tools/lint_blocks.py markdown/*.md     YAML of every quiz and exercise
  │  python3 tools/build_json.py                    → json/dayN.json, weekN.json, course.json (+ validation)
  │  python3 tools/export_files.py                  → files/lessons, files/starters, files/solutions
  ▼                                    (run these three from Data/Source/course)
npm run build:content                 → Data/Content/… (what the app loads)
npm run verify:content -- dayN        runs every sample and solution through the studio's Terminal
```

## Steps

1. From `Data/Source/course`, run `python3 tools/lint_blocks.py markdown/*.md`. Fix every YAML error first; the usual cause is a value starting with a backtick that is not quoted.
2. **Before** running `build_json.py` on an existing day, rebuild in a scratch copy and diff `json/` against the committed files. Some fixes were made in the JSON only (the committed JSON for Days 1–3, 7 and 8 is ahead of the Markdown in a few places). Port any such difference into the Markdown first, or `build_json.py` will undo it.
3. Run `build_json.py` and `export_files.py`, then `npm run build:content` from the repository root.
4. `npm run build:content` regenerates `Data/Content/`. If it rewrites files you did not touch (often only line endings: CRLF vs LF), restore them with `git checkout` and keep only your day's changes.
5. Run `npm run verify:content -- dayN`. Every `node` sample must print exactly its `output console` block; every `expect=error` sample must fail; every test must pass. Known environment failures (no Firefox or WebKit, no internet for `network=true`) are not content errors; say so in the report.
6. If the build stops on an exercise id ("title and file both changed"), decide: `--same d9-ex1` (the same exercise, edited) or `--new-identity d9-ex1` (a new exercise).
7. Commit together: `markdown/`, `json/`, `files/`, `Data/Source/published-ids.json`, `Data/Content/`. For a new day, also update the table in `Data/Source/course/README.md`; for a new week, add its title to `WEEK_TITLES` in `tools/build_json.py`.

## Checking in the app

Run `npm run dev:backend` and `npm run dev:frontend`, then open `http://127.0.0.1:5185/learn/w{week}/d{dayInWeek}/p{tab}` (tabs: p1 Prerequisites, p2 Fundamentals, p3 Implementation, p4 Practice). Day 11 is `/learn/w3/d1`. Look at every new part once: tables, diagrams, code blocks and quizzes render, and nothing wraps badly.

## Limits the build enforces

- A week has 1–5 days; weeks 1–8.
- At most 20 problems a day; quizzes have 2–8 options.
- Ids match `^[A-Za-z0-9][\w.~-]{0,63}$`; quiz and exercise ids are unique within the day; exercise ids are permanent across the course.
- Exactly four tabs, in order; an exercise cannot sit in a tab's intro.
