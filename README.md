# Beginner to Advanced: Playwright Fundamentals

A web learning platform for the 8-week Playwright + TypeScript course. Read the day's lesson on
the left, write real Playwright code on the right, press **Run**, and watch a real browser drive
itself against the practice apps.

It is a **learning platform, not an examination platform** — no proctoring, no invigilation, no
grading.

Two commands:

```bash
setup.bat
```
```bash
launcher.bat
```

### Git

The repository is <https://github.com/rmishr-1/Playwright_learning_studio>. Five batch scripts
wrap the usual flows, carried over from the assessment portal and retargeted here:

| Script | What it does |
|---|---|
| `git-pull.bat` | Fetch and fast-forward `main` |
| `git-push.bat` | Stage, commit and push to `main` |
| `git-sync.bat` | Pull then push, in one go |
| `collab-pull.bat` | Sync your own branch, then rebase it onto `main` |
| `collab-push.bat` | Push your branch and open a PR against `main` |

They set the git identity **repo-locally** to `rmishr-1 <rmishra@evoketechnologies.com>`, taken
from the global config on this machine. Change those lines if someone else works in this clone,
or their commits will carry the wrong name.

**Nothing secret is committed.** `.gitignore` covers `Data/Progress/` (the one progress record a
clone keeps for whoever runs it) and `Data/Config/*.json`. Only `studio.config.example.json`
ships. `Data/Content/` **is** committed — 1.3 MB of imported course JSON — so a fresh clone runs
without needing the training repo.

---

## Where the content comes from

The course lives as **147 Jupyter notebooks** in a separate repo
(`Playwright-Typescript-Training`): 8 weeks, 38 days, each day split into up to four parts —
`_1` TypeScript prerequisites, `_2` and `_3` Playwright concepts, `_4` practice problems.

**The notebooks are the master.** `scripts/import-notebooks.ts` converts them into
`Data/Content/`, and everything under that folder is generated — hand-editing it is always wrong,
because the next import overwrites it. Point the importer somewhere else with `TRAINING_REPO`:

```bash
TRAINING_REPO=/path/to/Playwright-Typescript-Training npm run import
```

The one exception is `Data/Content/solutions/`, which holds **authored practice solutions**.
Those do not exist in the notebooks — the course deliberately ships its practice problems without
an answer key — so they live outside the generated tree and are merged in at import time, exactly
as the assessment portal keeps `bank-comments.json` out of `bank.json`.

### Weeks 1 and 2 are open; 3–8 are locked

All 38 days import. Weeks 3–8 are flagged `locked`: they appear in the sidebar greyed with a
"soon" marker, and a link into one lands on an honest locked page rather than a 404. Change the
cut with `AVAILABLE_WEEKS` when the next week is ready.

### The prose is adapted, not rewritten

The notebooks were written for someone sitting in Jupyter. Instructions like *"Kernel must say
**Deno** (top-right)"* are not merely stale on the web — they tell the learner to do something
impossible. `studioise()` in `scripts/notebook-parse.ts` rewrites those environment-specific
callouts, turns `.ipynb` cross-links into in-app navigation (labels as well as hrefs), and
replaces the bare word "notebook" with "lesson". **The teaching itself is untouched.**
`npm run verify` fails the build if any notebook-only wording reaches an available day.

---

## Architecture

One stack: a React SPA and an Express backend over this repo's `Data/` folder. Unlike the
assessment portal there is **no Data Service and no second writer** — the backend is the only
process that touches `Data/`, so a keyed mutex is enough and there is no CAS or lease.

| Path | What it is |
|---|---|
| `scripts/import-notebooks.ts` | The bridge: `.ipynb` → `Data/Content/` |
| `shared/contracts/` | zod schemas mirroring `Data/Formats/`, imported by **both** sides so they cannot drift |
| `backend/` | Express on `127.0.0.1:3010` — content, progress, the code runner, the assistant |
| `frontend/` | Vite + React on `5180`, proxying `/api` to the backend |
| `Data/Formats/` | The wire contracts + [FORMAT-REGISTRY.md](Data/Formats/FORMAT-REGISTRY.md) |
| `Data/Content/` | **Generated.** Imported course content |
| `Data/Progress/` | **Generated.** The one progress record, for whoever runs this clone |

The backend binds loopback only. In dev, Vite proxies to it; a deployment puts a TLS edge in
front. It is never directly reachable.

---

## Running learner code

This is the interesting part, and the part with real risk.

**Live view.** The runner attaches a CDP session, calls `Page.startScreencast`, and forwards each
frame over a WebSocket to a canvas in the overlay — so you watch the browser fill the form rather
than seeing a screenshot afterwards. If screencast will not attach, the run still returns the
`show()` screenshot.

**The harness.** Learner code runs in Node against `playwright`, with `launch`, `show`, `login`,
`USERS` and `BASE_URL` injected as ambient bindings. The course's own
`import { launch, show } from "../_shared/deno-helpers.ts"` line is rewritten on the way in, so an
example copied straight out of the lesson runs unchanged.

### It executes arbitrary user-supplied code

That is the feature, not an oversight. The guards are load-bearing:

- a separate child process per run, `SIGKILL`ed at the timeout (30 s default)
- a **navigation allowlist**, fail-closed — an empty list blocks everything. It gates top-level
  document navigation, so an allowed app's own fonts and scripts still load
- a concurrency cap, so one learner cannot exhaust the box
- a per-run scratch directory, removed afterwards
- the child's environment is stripped of anything matching `ANTHROPIC|API_KEY|TOKEN|SECRET|PASSWORD`

**This is sized for an internal training tool on a trusted network.** Do not put it on the public
internet without a container per run: process isolation alone does not contain code running as
your own user.

---

## No accounts

There is no login, no roles, no admin panel and no dashboard. Each clone of this repo is run by
one person, so there is nothing to sign into and no one else's progress to see — the backend
keeps exactly one progress record, at `Data/Progress/progress.json`, for whoever is running it.
`GET /api/progress` reads it and `POST /api/progress` updates it; neither takes an id, because
there is nothing to identify.

The app opens straight onto the course and resumes wherever that record last left off, falling
back to Week 1 Day 1 for a clone that has not been opened yet.

This used to be an RBAC system — real accounts, a login screen, three roles, a cohort dashboard,
an admin People screen, a certificate, forgotten-password email. All of it is gone, on purpose;
see the format registry's invariant 5 for why re-adding any of it needs a deliberate decision,
not a quiet regression.

### The week list collapses

Each week is a disclosure, and an **All weeks** row above them collapses the lot — the sidebar
disappears entirely and the lesson takes the width. A `☰` in the tab bar brings it back, and the
locked screens carry their own *Show weeks* button so hiding the list can never strand you on a
page with no tab bar. The choice is remembered per viewer.

### Any written week is open

The course is written to be taken in order — each week assumes the one before it — but nothing
enforces that. Every authored week is open from the start, so you can go straight to the day you
need, or back to one you already did, without the app deciding you have not earned it.

The one lock left is about whether a week **exists** yet, not whether you have earned it:

| Pill | Meaning | Error code |
|---|---|---|
| `soon` | Not written yet (weeks 3–8) | `DAY_LOCKED` |

Progress is still recorded — the sidebar ticks days off and counts them per week — it just never
stands between you and a lesson.

---

## The learning assistant

A floating bubble on each day, backed by `claude-opus-5` through `@anthropic-ai/sdk`. It is
**explain-only**: it cannot write the editor, run code, or see run output, and it says so rather
than pretending otherwise.

It is given the day's four parts and the learner's progress. It is **never** given
`problems[].solution` — that is invariant 4 in the format registry, and `buildContext()` in
`backend/src/assistant.ts` is what enforces it. On practice problems it gives hints and points at
the API; the Reveal solution button stays the only route to an answer.

Needs `ANTHROPIC_API_KEY` in the environment — never in a config file, never sent to the browser.
Without it the rest of the studio works and the assistant reports itself unavailable.

---

## Verifying

```bash
npm run import     # .ipynb -> Data/Content/
npm run verify              # structural checks over the imported content
npm run verify:runnable     # every "Load into editor" button actually runs clean
npm run typecheck  # both workspaces, against shared/contracts/
```

`npm run verify` asserts what the importer got wrong at least once during the build:

- 38 days, 8 weeks, 10 available
- **Week 1 Day 1 has three parts** — there is no `day1_3.ipynb`; every other day has four
- Week 1 days 1–4 carry a generated TypeScript placeholder; day 5 has a real one
- every available day has exactly three practice problems
- no `.ipynb` link survives, in an href *or* a label
- no notebook-only wording reaches an available day
- the concepts index carries no authoring-only sections

Also worth walking by hand before a cohort uses it:

- `grep -r "fetch(" frontend/src` should match only `api/client.ts`
- Week 2 Day 1 → Load into editor → Run: the overlay should paint live frames and finish `ok`
- Week 1 Day 1 part 2 (zero code cells) should show the editor's empty state, not a broken pane
- a link into Week 3 should land on the locked page, not a 404
- `page.goto('https://example.com')` should come back `blocked`
- at 375 px the panes should stack and stay readable
- a fresh learner should see Week 2 as `locked`; typing `/learn/w2/d1/p1` should land on
  "Week 2 is not open yet", and completing all five Week 1 days should open it

---

## Known gaps

- **Practice solutions are not written yet for every day.** Where `solution` is `null` the reveal
  button is *absent* rather than disappointing, and the page says so.
- **Weeks 5–7 practice has a different shape** — 7–8 numbered exercises per day with no difficulty
  label, instead of three labelled problems. It imports correctly; the UI has not been tuned for it.
  Those weeks are locked, so it is not yet visible.
- **The language switcher lists TypeScript, JavaScript, Python and Java, but only TypeScript is
  wired.** The other three are visibly disabled rather than silently broken.
- **A run takes 10–15 seconds**, almost all of it Chromium start-up. A warm browser pool would fix
  it and has not been built.
- Global search and the concepts reference page are imported (`Data/Content/concepts.json`, 306
  entries) but not yet surfaced in the UI.
