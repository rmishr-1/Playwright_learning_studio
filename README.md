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
ships. `Data/Content/` **is** committed, so a fresh clone has the whole course.

---

## Where the content lives

The course is written by hand as JSON in `Data/Content/`: `course-index.json` lists the weeks and
days, and each day is `weeks/week-N/day-N.json`. The formats are in
[Data/Formats/](Data/Formats/FORMAT-REGISTRY.md). The backend reads these files and never writes
them, and an edit shows on the next page load without a restart. With no `course-index.json`, the
app says the course has no lessons yet.

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
| `backend/` | Express on `127.0.0.1:3010` — content, progress, the code runner, the assistant |
| `frontend/` | Vite + React on `5180`, proxying `/api` to the backend |
| `Data/Formats/` | The wire contracts + [FORMAT-REGISTRY.md](Data/Formats/FORMAT-REGISTRY.md) |
| `Data/Content/` | The course content, written by hand |
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
`USERS` and `BASE_URL` injected as ambient bindings, so an example needs no `import` line.

### The run panels

The overlay over the editor has three panels: **Browser**, **Console**, and **Terminal**. Each
has a toggle in the overlay's header, so any of them can show at the same time, side by side, with
draggable dividers between them. The **⇱** button on a panel pops it out into a window of its own,
which stays live and, for the Terminal, typeable; **Back to the studio**, or closing the window,
puts it back. The panel is a React portal into that window (`frontend/src/components/PopOut.tsx`),
so no state is copied between windows. Which panels show, their widths, and the overlay's height
are remembered in the browser's local storage. Popped-out windows are not reopened on the next
visit, because a browser opens a window only when the learner clicks something.

### The Terminal

The **Terminal** panel (also opened by **>_ Terminal** in the editor toolbar) runs real
Playwright commands on the code in the editor: `npx playwright test` with its common options
(`--list`, `--headed`, `--project`, `-g`, `--workers`, `--retries`, `--trace`, `--reporter`), and
`npx playwright show-report`. Type `help` for the list. Everything else is refused with a message,
and a line is never handed to a shell: `backend/src/terminal/commands.ts` splits it into words and
checks every option.

- **One folder.** Every command works in `Data/Workspace/` (ignored by Git), a small Playwright
  project laid out like the learner's own: `package.json`, `playwright.config.ts`, `tests/`,
  `test-results/`, `playwright-report/`. The tests folder holds only the file the current command
  runs. The editor is saved as `tests/editor.spec.ts`, or under the name the command gives, so
  `npx playwright test tests/login.spec.ts` behaves as it would in the learner's own project.
- **Live view.** `tsconfig.json` in the workspace maps `@playwright/test` to a small wrapper
  (`.studio/test.ts`) that screencasts each Chromium page and posts the frames to the backend, so
  the Browser panel shows the test as it runs. The same wrapper applies the Run button's navigation
  allowlist.
- **Output** streams with its colors over the same WebSocket a Run uses. **Ctrl+C** stops the
  command, with its workers and browsers. The Terminal's state lives in a session object
  (`frontend/src/lib/terminalSession.ts`), so popping it out or back never interrupts a command. A command is stopped at `terminal_timeout_ms` (5 minutes
  by default), and one command runs at a time.
- **Run on a spec file** hands it to the Terminal as `npx playwright test`, and a spec-file code
  block in a lesson offers **Load into editor** for this.
- The workspace runs Chromium only, because `setup.bat` installs only Chromium.

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
| `soon` | Not written yet | `DAY_LOCKED` |

Progress is still recorded — the sidebar ticks days off and counts them per week — it just never
stands between you and a lesson.

---

## The learning assistant

A floating bubble on each day, backed by `claude-opus-5` through `@anthropic-ai/sdk`. It is
**explain-only**: it cannot write the editor, run code, or see run output, and it says so rather
than pretending otherwise.

It is given the day's parts and the learner's progress. It is **never** given
`problems[].solution` — that is invariant 4 in the format registry, and `buildContext()` in
`backend/src/assistant.ts` is what enforces it. On practice problems it gives hints and points at
the API; the Reveal solution button stays the only route to an answer.

Needs `ANTHROPIC_API_KEY` in the environment — never in a config file, never sent to the browser.
Without it the rest of the studio works and the assistant reports itself unavailable.

---

## Verifying

```bash
npm run typecheck  # both workspaces, against shared/contracts/
```

Also worth walking by hand before a cohort uses it:

- `grep -r "fetch(" frontend/src` should match only `api/client.ts`
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
