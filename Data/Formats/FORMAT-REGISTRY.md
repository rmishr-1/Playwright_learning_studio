# Format Change Registry — the single source of truth

> **Read this file before changing any data format.**
> Every field lives in one `*_format.json` here as `{options, value}`. A change that isn't
> reflected here didn't happen.

## Architecture

One stack: a React SPA and an Express backend over the repo's `Data/` folder. Unlike the
assessment portal this studio has **no Data Service and no second writer** — the backend is the
only process that touches `Data/`, so a keyed mutex is sufficient and there is no CAS or lease.

| Path | Holds | Written by | Read by |
|---|---|---|---|
| `Data/Formats/` | These wire contracts | format changes only | both sides |
| `Data/Source/` | The course source: the course package (`course/`, holding every week), and the files every Terminal workspace starts with (`workspace/`) | authors | `npm run build:content` |
| `Data/Content/` | The built course — `course-index.json`, `weeks/week-N/day-N.json`, `workspaces.json` | `npm run build:content` **only** | backend |
| `Data/Workspace/` | The Terminal's workspaces, `demo/` and `project/`, with the files the learner saved | backend | backend |
| `Data/Progress/` | The ONE progress record. No accounts: each clone of this repo is run by one person | backend | backend |
| `Data/Config/` | `studio.config.json` — run limits and allowed sites | operator | backend |

**`Data/Content/` is built.** The course package in `Data/Source/course/` is authored as Markdown,
turned into JSON by the package's own tool (`tools/build_json.py`), and `npm run build:content`
turns that JSON into the app's format, validating every day against the contract before it writes
anything. Editing `Data/Content/` by hand is always wrong: the next build overwrites it. The backend
reads `Data/Content/` and never writes it. With no `course-index.json`, the API answers
`CONTENT_MISSING` and the app says the course has no lessons yet.

## The change workflow

1. Change the master template here first.
2. Mirror into `shared/contracts/` — one file per format, named identically. BOTH the SPA and the
   backend import that single module, so the two sides cannot drift.
3. Walk the consumer table below; say which entries need a code change and which need re-verification.
4. Apply the invariants; run the verification checklist.

## Format index and consumers

Legend: **F** = frontend (`frontend/src`), **B** = backend (`backend/src`), **S** = the build,
`scripts/build-content.ts`, from `Data/Source/`.

| Format | Direction | Producer → Consumer | Endpoint |
|---|---|---|---|
| `problem_error_format.json` | response | B → F | every non-2xx |
| `course_index_format.json` | content | S → B → F | `GET /api/course` |
| `course_day_format.json` | content | S → B → F | `GET /api/course/:week/:day` |
| `progress_format.json` | state | F ↔ B | `GET /api/progress`, `POST /api/progress` |
| `check_format.json` | req/resp | F ↔ B | `POST /api/check` |
| `run_format.json` | req/resp | F ↔ B | `POST /api/run` + `WS /api/run/:run_id/stream` |

## Cross-cutting invariants

1. **Never assume four parts, or three problems.** A `course-day` carries 1–4 parts in order, and
   a practice part may have any number of problems, with or without a difficulty label, so
   `problems[].difficulty` is nullable. Nothing downstream may assume a part has content either —
   check `has_runnable_code` and `blocks.length`.
2. **A missing solution is absent, not broken.** `problems[].solution` is `null` until written, and
   `null` means the reveal button is *absent*, never a broken button or an empty panel.
3. **A locked day still loads.** `locked: true` is a UI gate, not a filter. Cross-links from an
   available day into a locked one must resolve to the locked state, never a 404.
4. **There is no identity, so there is nothing to check it against.** This is the second inversion
   of this invariant. It first said identity is not authentication (anyone could claim a name); a
   later revision added real accounts, roles and a session cookie. Both are gone. Each clone of
   this repo is run by one person, so `Data/Progress/progress.json` is not "someone's" record to
   protect from someone else — it is simply the state. Nothing in this codebase may reintroduce a
   `learner_id`, a role, or a credential without first updating this invariant and the format it
   would touch.
5. **Timestamps.** ISO-8601 UTC `Z`; `_ms` suffix for durations; stored, not derived.
6. **Template vs instance.** `{options, value}`, `_itemTemplate` and `_comment` exist ONLY in
   `*_format.json`. Real payloads are plain values.
7. **Additive evolution.** New keys are appended; removing or renaming one bumps the `schema`
   version.
8. **The run path is the attack surface.** Any change to `run_format` must preserve the timeout, the
   concurrency cap and the navigation allowlist. A format change may not introduce a way to run code
   that bypasses them.
9. **Checkpoints are formative, never scored.** A `checkpoint` block exists so the learner retrieves
   what they just read; it is not an assessment. Nothing about an answer is written to
   `progress_format` — no score, no attempt count, no right/wrong history — and nothing in the UI
   gates progress on one. This studio is deliberately not the assessment portal: the moment a
   checkpoint is recorded, a wrong answer starts costing something, and the learner stops using it
   to think with. Adding a scored quiz means a new format and a new invariant, not a field here.

## Verification checklist

- [ ] Every `*.json` here parses.
- [ ] No `options`, `_itemTemplate` or `_comment` key in anything under `Data/Content/` or `Data/Progress/`.
- [ ] `shared/contracts/` reflects the change and `npm run typecheck` passes in both workspaces.
- [ ] `npm run build:content` builds every day, and `npm run verify:content` passes: every lesson file
      and every whole-file solution runs through the Terminal with the result the lesson shows.
- [ ] `grep -r "fetch(" frontend/src` matches only `api/client.ts`.
- [ ] A content edit is visible **without restarting the backend**. `store.ts` caches a day against
      that day's own mtime; anything that caches on a different file's stamp will serve stale content
      to whichever writer it is not watching.
- [ ] This registry updated if a consumer was added, moved or removed.
