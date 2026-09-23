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
| `Data/Content/` | Course content — `course-index.json` + `weeks/week-N/day-N.json` | authors, by hand | backend |
| `Data/Progress/` | The ONE progress record. No accounts: each clone of this repo is run by one person | backend | backend |
| `Data/Config/` | `studio.config.json` — run limits, allowed sites, assistant settings | operator | backend |

The backend reads `Data/Content/` and never writes it. With no `course-index.json`, the API answers
`CONTENT_MISSING` and the app says the course has no lessons yet.

## The change workflow

1. Change the master template here first.
2. Mirror into `shared/contracts/` — one file per format, named identically. BOTH the SPA and the
   backend import that single module, so the two sides cannot drift.
3. Walk the consumer table below; say which entries need a code change and which need re-verification.
4. Apply the invariants; run the verification checklist.

## Format index and consumers

Legend: **F** = frontend (`frontend/src`), **B** = backend (`backend/src`), **A** = authored
content in `Data/Content/`.

| Format | Direction | Producer → Consumer | Endpoint |
|---|---|---|---|
| `problem_error_format.json` | response | B → F | every non-2xx |
| `course_index_format.json` | content | A → B → F | `GET /api/course` |
| `course_day_format.json` | content | A → B → F | `GET /api/course/:week/:day` |
| `progress_format.json` | state | F ↔ B | `GET /api/progress`, `POST /api/progress` |
| `run_format.json` | req/resp | F ↔ B | `POST /api/run` + `WS /api/run/:run_id/stream` |
| `assistant_format.json` | req/SSE | F ↔ B | `POST /api/assistant` |

## Cross-cutting invariants

1. **Never assume four parts, or three problems.** A `course-day` carries 1–4 parts in order, and
   a practice part may have any number of problems, with or without a difficulty label, so
   `problems[].difficulty` is nullable. Nothing downstream may assume a part has content either —
   check `has_runnable_code` and `blocks.length`.
2. **A missing solution is absent, not broken.** `problems[].solution` is `null` until written, and
   `null` means the reveal button is *absent*, never a broken button or an empty panel.
3. **A locked day still loads.** `locked: true` is a UI gate, not a filter. Cross-links from an
   available day into a locked one must resolve to the locked state, never a 404.
4. **No answer keys reach the assistant.** The assistant's context carries lesson text and progress
   only. `problems[].solution` must never be placed in an assistant prompt — that would route around
   the hints-only guardrail. A `checkpoint` block is withheld **entirely**, question included: its
   payload is an answer key by another name, and handing over the question invites the assistant to
   answer it for the learner, which is the one thing a retrieval check cannot survive.
5. **There is no identity, so there is nothing to check it against.** This is the second inversion
   of this invariant. It first said identity is not authentication (anyone could claim a name); a
   later revision added real accounts, roles and a session cookie. Both are gone. Each clone of
   this repo is run by one person, so `Data/Progress/progress.json` is not "someone's" record to
   protect from someone else — it is simply the state. Nothing in this codebase may reintroduce a
   `learner_id`, a role, or a credential without first updating this invariant and the format it
   would touch.
6. **Timestamps.** ISO-8601 UTC `Z`; `_ms` suffix for durations; stored, not derived.
7. **Template vs instance.** `{options, value}`, `_itemTemplate` and `_comment` exist ONLY in
   `*_format.json`. Real payloads are plain values.
8. **Additive evolution.** New keys are appended; removing or renaming one bumps the `schema`
   version.
9. **The run path is the attack surface.** Any change to `run_format` must preserve the timeout, the
   concurrency cap and the navigation allowlist. A format change may not introduce a way to run code
   that bypasses them.
10. **Checkpoints are formative, never scored.** A `checkpoint` block exists so the learner retrieves
   what they just read; it is not an assessment. Nothing about an answer is written to
   `progress_format` — no score, no attempt count, no right/wrong history — and nothing in the UI
   gates progress on one. This studio is deliberately not the assessment portal: the moment a
   checkpoint is recorded, a wrong answer starts costing something, and the learner stops using it
   to think with. Adding a scored quiz means a new format and a new invariant, not a field here.

## Verification checklist

- [ ] Every `*.json` here parses.
- [ ] No `options`, `_itemTemplate` or `_comment` key in anything under `Data/Content/` or `Data/Progress/`.
- [ ] `shared/contracts/` reflects the change and `npm run typecheck` passes in both workspaces.
- [ ] `grep -r "fetch(" frontend/src` matches only `api/client.ts`.
- [ ] A content edit is visible **without restarting the backend**. `store.ts` caches a day against
      that day's own mtime; anything that caches on a different file's stamp will serve stale content
      to whichever writer it is not watching.
- [ ] This registry updated if a consumer was added, moved or removed.
