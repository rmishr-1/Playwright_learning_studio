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

**Nothing secret is committed.** `.gitignore` covers `Data/Learners/` (accounts and password
digests), `Data/Config/*.json` (the admin list and any SMTP settings), `Data/Config/session.secret`
and `Data/Outbox/`. Only `studio.config.example.json` ships. `Data/Content/` **is** committed —
1.3 MB of imported course JSON — so a fresh clone runs without needing the training repo.

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
| `Data/Learners/` | One file per account: identity, role, password digest, progress |

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

## Accounts, roles and the dashboard

Everyone signs in. `/login` is shown on every launch when signed out — there is no silent
auto-resume, which is what used to make the app always come back as whoever used it last.

**Passwords** are scrypt digests with a per-account salt, hashed with `node:crypto` (no new
dependency). **Sessions** are an HMAC-signed token in an httpOnly cookie, so page scripts cannot
read it. The token carries the user id and an expiry and deliberately **not** the role: every
request re-reads the account, so demoting a trainer takes effect on their next request rather
than whenever their token expires.

### Three roles

| Role | Course | Dashboard | People |
|---|---|---|---|
| `learner` | ✓ | | |
| `trainer` | ✓ | ✓ | |
| `admin` | ✓ | ✓ | ✓ |

Everyone self-registers as a learner. An **admin** promotes people from `/people`. Both checks
happen server-side as well as in the menu — a hidden menu item is not a permission, and
`/dashboard` and `/people` return 403 to a learner who types the URL.

**Bootstrap.** `admins` in `Data/Config/studio.config.json` lists account ids that are admins
whatever the stored record says. That is the escape hatch: without it, one bad demotion would
lock everyone out of the only screen that can undo it. Pinned accounts cannot be demoted from
the UI, and the last remaining admin cannot demote themselves.

**The acting user comes from the cookie, never the request body.** Progress, runs and the
assistant all take the learner id from the session. Before this, `learner_id` travelled in the
payload and was trusted, so one learner could write another's progress — which would have made
both the dashboard and the certificate meaningless.

### Forgotten passwords

`/login` carries a **Forgot your password?** link. It asks for the name, mails a six-digit code
to the address on the account, and the same card then takes the code and a new password.

Four things make that safe enough to expose:

- **No enumeration.** `/auth/forgot` answers identically whether the account exists, whether it
  has an email, and whether the mail succeeded. A helpful "no such account" would turn the
  endpoint into a way to list who is registered.
- **The code is never stored** — only a salted scrypt digest of it, the same treatment as the
  password, so a leaked record cannot be used to reset anyone.
- **Single use and time-boxed.** Ten minutes by default, cleared the moment it is used.
- **Guessing is capped.** Five wrong attempts discard the code. Six digits is only a million
  wide; unlimited guesses would fall in minutes.

Resetting does **not** sign you in — you then sign in with the new password, which proves you
know it.

#### Mail is not configured, and the code says so

This repo ships with no SMTP credentials, so **nothing is actually sent**. The message is written
to `Data/Outbox/` and the log says loudly that it was not delivered; an operator reads the code
out and passes it on. That is the same shape as the assessment portal's *Copy email* button,
which also shipped before its Outlook credential existed.

To turn on real sending, fill in `mail` in `Data/Config/studio.config.json` and put the password
in `STUDIO_SMTP_PASSWORD` — never in the file:

```json
"mail": { "host": "smtp.office365.com", "port": 587, "secure": false,
          "user": "no-reply@evoketechnologies.com",
          "from": "Playwright Studio <no-reply@evoketechnologies.com>" }
```

**Accounts created before emails existed have none**, so they cannot use this until an admin
gives them one from the **People** screen.

### Unclaimed accounts — a real weakness

Records created before logins existed have no password. Such an account is **unclaimed**: the
first person to sign in with that name sets the password and takes it. It is a bootstrap
convenience, not a feature. The People screen flags them, and you should **delete records you do
not recognise** from `Data/Learners/` rather than leave them claimable — the test accounts
`ada-lovelace`, `nora-beginner` and `test-runner` are exactly that.

## The certificate

Awarded when **every day of the course is complete — all 38**, not just the weeks open today.
Weeks 3–8 are not authored yet, so nobody can earn it now; until then `/certificate` shows honest
progress (*"You have completed 10 of 38 days"*) rather than a page nobody can open.

`issued_at` is stamped once, the first time it is earned, so the date does not move if a learner
reopens a day afterwards.

The backend owns the markup at `GET /api/certificate/view.html`; the page embeds it in an iframe
and the PDF renders **that same HTML**, so there is no second template to drift. The PDF comes
from `page.pdf()` on the Chromium the code runner already depends on — no PDF library — and it
takes a slot from the same concurrency cap as code runs, so a burst of downloads cannot exhaust
the box. It is issued by **Evoke Technologies Private Limited**; the design is text-only and a
logo can be dropped in later.

### The week list collapses

Each week is a disclosure, and an **All weeks** row above them collapses the lot — the sidebar
disappears entirely and the lesson takes the width. A `☰` in the tab bar brings it back, and the
locked screens carry their own *Show weeks* button so hiding the list can never strand you on a
page with no tab bar. The choice is remembered per viewer.

### The course is sequential

A week opens only once **every day of the previous week is complete**. Week 1 is always open.
This is enforced in `blockingWeek()` on **both** sides — the sidebar greys the week and shows a
`locked` pill, and `GET /api/course/:week/:day` returns `423 WEEK_NOT_UNLOCKED` when a learner id
is supplied. The sidebar alone would be a suggestion: the URL is right there in the address bar.

Two locks exist and they never merge, because they mean different things:

| Pill | Meaning | Error code |
|---|---|---|
| `soon` | Not written yet (weeks 3–8) | `DAY_LOCKED` |
| `locked` | Written, but you have not finished the week before it | `WEEK_NOT_UNLOCKED` |

`/dashboard` shows cohort progress to trainers and admins.

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
npm run verify:auth         # registration, sign-in, the role gates, session identity
npm run verify:certificate  # refused part-way, a real PDF when earned, a stable date
npm run verify:reset        # no enumeration, single use, capped guessing, digest-only storage
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
