# Playwright Learning Studio

A web learning platform for a Playwright + TypeScript course. Read the day's lesson on the left,
write real Playwright code on the right, press **Run**, and watch a real browser drive itself
against a practice website.

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

The repository is <https://github.com/rmishr-1/Playwright_learning_studio>. Three batch scripts
wrap the usual flows, carried over from the assessment portal and retargeted here:

| Script | What it does |
|---|---|
| `git-sync.bat` | For the owner: shows what changed and asks, then commits, pulls and pushes. It refuses keys, licences and other secrets |
| `collab-pull.bat` | Sync your own branch, then rebase it onto `main` |
| `collab-push.bat` | Push your branch, and get the link for a pull request into `main`; it never pushes to `main` itself |

They set the git identity **repo-locally** to `rmishr-1 <rmishra@evoketechnologies.com>`, taken
from the global config on this machine. Change those lines if someone else works in this clone,
or their commits will carry the wrong name.

**Nothing secret is committed.** `.gitignore` covers `Data/Progress/` (the one progress record a
clone keeps for whoever runs it) and `Data/Config/*.json`. Only `studio.config.example.json`
ships. `Data/Content/` **is** committed, so a fresh clone has the whole course.

---

## Where the content lives

The course is a package in `Data/Source/course/`, written by the course authors. It holds both
weeks, ten days in all:

| Folder | What it holds |
|---|---|
| `markdown/` | The source the authors edit, one file per day (`day1.md` to `day10.md`) |
| `json/` | The same days as JSON, with a file per week, made by the package's own `tools/build_json.py` |
| `files/` | Every lesson file, exercise starter and solution, as real files |
| `FORMAT.md` | How the Markdown is written |

`npm run build:content` turns the package's JSON into what the app serves, in `Data/Content/`:
`course-index.json`, one `weeks/week-N/day-N.json` per day, and `workspaces.json` (below). A day's
four sections, Prerequisites, Fundamentals, Implementation and Practice, become its four tabs.
The course numbers its days across both weeks (Week 2 starts on Day 6), and the app shows those
numbers, as the lessons and their file names use them; a day's address counts within its week, so
Day 6 is `/learn/w2/d1`. Every
day is validated against the contract before anything is written. The formats are in
[Data/Formats/](Data/Formats/FORMAT-REGISTRY.md).

To change a lesson, edit the Markdown, then rebuild both steps:

```bash
python Data/Source/course/tools/build_json.py
```
```bash
npm run build:content
```

The first needs Python with PyYAML (`pip install pyyaml`). The backend picks up the new files on the
next page load, without a restart.

A day or a week marked `locked` appears greyed with a "soon" marker, and a link into it lands on a
locked page rather than a 404.

---

## Architecture

One stack: a React SPA and an Express backend over this repo's `Data/` folder. Unlike the
assessment portal there is **no Data Service and no second writer** — the backend is the only
process that touches `Data/`, so a keyed mutex is enough and there is no CAS or lease.

| Path | What it is |
|---|---|
| `shared/contracts/` | zod schemas mirroring `Data/Formats/`, imported by **both** sides so they cannot drift |
| `backend/` | Express on `127.0.0.1:3010` — content, progress, the code runner, the Terminal |
| `frontend-c/` | The studio's page (design Option C): Vite + React on `5185`, proxying `/api` to the backend |
| `Data/Formats/` | The wire contracts + [FORMAT-REGISTRY.md](Data/Formats/FORMAT-REGISTRY.md) |
| `Data/Content/` | The course content, written by hand |
| `Data/Progress/` | **Generated.** The one progress record, for whoever runs this clone |
| `desktop/` | The Option C studio as an offline Windows app, with licences - see [desktop/README.md](desktop/README.md) |

The backend binds loopback only. In dev, Vite proxies to it; a deployment puts a TLS edge in
front. It is never directly reachable. The desktop app starts the same backend inside itself, with
its own folders, Node and browsers, and a token only its window holds (`backend/src/config.ts`,
`backend/src/server.ts`).

---

## Running learner code

This is the interesting part, and the part with real risk.

**Live view.** The runner attaches a CDP session, calls `Page.startScreencast`, and forwards each
frame over a WebSocket to a canvas in the overlay — so you watch the browser fill the form rather
than seeing a screenshot afterwards. If screencast will not attach, the run still returns the
`show()` screenshot.

**The harness.** Code that belongs to no lesson file runs in Node against `playwright`, with
`launch` and `show` injected as ambient bindings, so it needs no `import` line. A lesson's own files
run in the Terminal instead (below).

### The run panels

The overlay over the editor has three panels: **Browser**, **Console**, and **Terminal**. Each
has a toggle in the overlay's header, so any of them can show at the same time, side by side, with
draggable dividers between them. The **⇱** button on a panel pops it out into a window of its own,
which stays live and, for the Terminal, typeable; **Back to the studio**, or closing the window,
puts it back. The panel is a React portal into that window (`frontend-c/src/components/PopOut.tsx`),
so no state is copied between windows. Which panels show, their widths, and the overlay's height
are remembered in the browser's local storage. Popped-out windows are not reopened on the next
visit, because a browser opens a window only when the learner clicks something.

### The Terminal

The **Terminal** panel (also opened by **>_ Terminal** in the editor toolbar) runs the course's
commands: `npx playwright test` with its common options (`--list`, `--headed`, `--project`, `-g`,
`--workers`, `--retries`, `--trace`, `--reporter`, `--last-failed`), `npx playwright show-report`,
`node day3/hello.ts` and `npm run check -- day3/hello.ts` for the TypeScript lessons, and the
version commands. Type `help` for the list. Setup commands such as `npm init` get a message saying
the studio is already set up, and a line is never handed to a shell:
`backend/src/terminal/commands.ts` splits it into words and checks every option and path.

**The editor holds a lesson file.** **Open in editor** on a lesson's code, or **▶ Run** on it,
loads it as its file, such as `tests/day1/auto-wait.spec.ts`, and the editor's toolbar shows the
name. Every command saves the editor there first, and the editor's **▶ Run** runs the lesson's own
command. **Run** beside a command in a lesson types that command into the Terminal.

- **Two workspaces.** Commands run in `Data/Workspace/demo/` or `Data/Workspace/project/` (ignored by
  Git), each laid out like the learner's project: `playwright.config.ts` with Chromium, Firefox and
  WebKit, `tests/`, and `ts-basics/` for the TypeScript lessons. A day that comes before the
  learner has a project (Days 1 and 2) uses `demo`, which starts with that day's files. Every other
  day uses `project`, which starts as `npm init playwright@latest` leaves a project, plus the files
  other lesson files import. What they start with is `Data/Content/workspaces.json`, written by the
  build; a starting file is written only when it is missing, so what the learner saves is kept.
- **The TypeScript lessons.** `node` runs a `.ts` file directly (Node 22.18 or later), and
  `npm run check` runs TypeScript 7, the version `npm install -D typescript` gives today, installed
  as `typescript-learner` so the studio's own build keeps its version.
- **Live view.** `tsconfig.json` in the workspace maps `@playwright/test` to a small wrapper
  (`.studio/test.ts`) that screencasts each Chromium page and posts the frames to the backend, so
  the Browser panel shows the test as it runs. The same wrapper applies the Run button's navigation
  allowlist.
- **Output** streams with its colors over the same WebSocket a Run uses. **Ctrl+C** stops the
  command, with its workers and browsers. The Terminal's state lives in a session object
  (`frontend-c/src/lib/terminalSession.ts`), so popping it out or back never interrupts a command. A command is stopped at `terminal_timeout_ms` (5 minutes
  by default), and one command runs at a time.
- **Run on a spec file** hands it to the Terminal as `npx playwright test`, and a spec-file code
  block in a lesson offers **Load into editor** for this.
- The Browser panel shows Chromium. `setup.bat` installs Chromium, Firefox and WebKit.

### Check my answer

A code exercise that the course can grade has a **Check my answer** button. The browser sends only
the learner's code and which exercise it is. The server reads the exercise's check from the course,
so a learner cannot mark their own answer correct, saves the code as the exercise's file, and runs
the check's command through the Terminal's own code (`backend/src/check.ts`):

- **Output checks** (the TypeScript exercises) pass when the program prints exactly the expected
  output; a wrong answer shows the expected and actual output side by side.
- **Test checks** (the Playwright exercises) pass when every test passes; a wrong answer shows the
  end of the test run, where the first error is.

The button grades the code in the editor, so it asks the learner to select **Start this in the
editor** first when the editor holds a different file. Written, predict and Terminal exercises have
no automatic check, and keep **Reveal solution**. `npm run verify:content` grades every model
answer through the same code, so a right answer is never marked wrong.

### It executes arbitrary user-supplied code

That is the feature, not an oversight. The guards are load-bearing:

- a separate child process per run, `SIGKILL`ed at the timeout (30 s default)
- a **navigation allowlist**, fail-closed — an empty list blocks everything. It gates top-level
  document navigation, so an allowed app's own fonts and scripts still load
- a concurrency cap, so one learner cannot exhaust the box
- a per-run scratch directory, removed afterwards
- the child's environment is stripped of anything matching `ANTHROPIC|API_KEY|TOKEN|SECRET|PASSWORD`
- the Terminal accepts Playwright commands only, never through a shell, and applies the same
  allowlist, timeout, and environment stripping

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
back to the first day for a clone that has not been opened yet.

This used to be an RBAC system — real accounts, a login screen, three roles, a cohort dashboard,
an admin People screen, a certificate, forgotten-password email. All of it is gone, on purpose;
see the format registry's invariant 4 for why re-adding any of it needs a deliberate decision,
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
| `soon` | Not written yet | `DAY_LOCKED` |

Progress is still recorded — the sidebar ticks days off and counts them per week — it just never
stands between you and a lesson.

---

## Verifying

```bash
npm run typecheck        # both workspaces, against shared/contracts/
npm run verify:content   # every lesson file and solution, run through the Terminal
```

`npm run verify:content` runs each lesson file and each whole-file exercise solution through the
same code a learner's Run uses, in a workspace folder of its own. A `node` file must print exactly
what the lesson shows; `npm run check` must pass, or fail with the lesson's error when the sample
fails on purpose; a test must pass, or fail when it is meant to. Add a filter to run fewer, such as
`npm run verify:content -- day3`.

Also worth walking by hand before a cohort uses it:

- `grep -r "fetch(" frontend-c/src` should match only `api/client.ts`
- a day with an example → Load into editor → Run: the overlay should paint live frames and finish `ok`
- a part with no code should show the editor's empty state, not a broken pane
- a link into a locked week should land on the locked page, not a 404
- `page.goto('https://example.com')` should come back `blocked`
- at 375 px the panes should stack and stay readable

---

## Known gaps

- **Practice solutions may not be written for every problem.** Where `solution` is `null` the
  reveal button is *absent* rather than disappointing, and the page says so.
- **The language switcher lists TypeScript, JavaScript, Python and Java, but only TypeScript is
  wired.** The other three are visibly disabled rather than silently broken.
- **A run takes 10–15 seconds**, almost all of it Chromium start-up. A warm browser pool would fix
  it and has not been built.
