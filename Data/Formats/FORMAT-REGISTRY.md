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
| `Data/Content/` | Imported course content — `course-index.json` + `week-N/day-N.json` | `scripts/import-notebooks.ts` **only** | backend |
| `Data/Learners/` | One file per account: identity, role, password digest, progress | backend | backend |
| `Data/Config/` | `studio.config.json` — trainer code, training-repo path, run limits, assistant key | operator | backend |

**`Data/Content/` is generated.** The 147 notebooks in the training repo are the master. Hand-editing
an imported day is always wrong: the next import overwrites it. The one exception is authored
practice **solutions**, which do not exist in the notebooks — they live in `Data/Content/solutions/`
and are merged in at import time so a re-import never erases them. (Same reasoning as the portal
keeping `bank-comments.json` out of `bank.json`.)

## The change workflow

1. Change the master template here first.
2. Mirror into `shared/contracts/` — one file per format, named identically. BOTH the SPA and the
   backend import that single module, so the two sides cannot drift.
3. Walk the consumer table below; say which entries need a code change and which need re-verification.
4. Apply the invariants; run the verification checklist.

## Format index and consumers

Legend: **F** = frontend (`frontend/src`), **B** = backend (`backend/src`), **I** = importer
(`scripts/import-notebooks.ts`).

| Format | Direction | Producer → Consumer | Endpoint |
|---|---|---|---|
| `problem_error_format.json` | response | B → F | every non-2xx |
| `course_index_format.json` | content | I → B → F | `GET /api/course` |
| `course_day_format.json` | content | I → B → F | `GET /api/course/:week/:day` |
| `learner_format.json` | state | F ↔ B | `GET /api/learner/me`, `POST /api/learner/progress` |
| `session_format.json` | req/resp | F ↔ B | `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `GET /api/people`, `PUT /api/people/:id/role` |
| `run_format.json` | req/resp | F ↔ B | `POST /api/run` + `WS /api/run/:run_id/stream` |
| `assistant_format.json` | req/SSE | F ↔ B | `POST /api/assistant` |

## Cross-cutting invariants

1. **Never assume four parts, or three problems.** A `course-day` carries 1–4 parts in order. A
   missing `_1` becomes a `generated-prerequisite` so the TypeScript tab stays present; a missing
   `_3` is simply absent — **Week 1 Day 1 has three parts**, being theory plus practice with no
   second concept notebook. Likewise practice counts vary: weeks 1–4 and 8 give three labelled
   problems, weeks 5–7 give **7–8 numbered exercises with no difficulty label**, so
   `problems[].difficulty` is nullable. Nothing downstream may assume a part has content either —
   check `has_runnable_code` and `blocks.length`.
2. **Solutions are never in the notebooks.** `problems[].solution` is authored, merged at import,
   and `null` until authored. `null` means the reveal button is *absent*, never a broken button or
   an empty panel.
3. **A locked day still imports.** `locked: true` is a UI gate, not an import filter. Cross-links
   from an available day into a locked one must resolve to the locked state, never a 404.
4. **No answer keys reach the assistant.** The assistant's context carries lesson text and progress
   only. `problems[].solution` must never be placed in an assistant prompt — that would route around
   the hints-only guardrail.
5. **Identity IS authentication, and the server is the only judge of it.** This inverts the
   original invariant: `learner_id` used to be a slug off a self-declared name that anyone could
   claim, and nothing sensitive was allowed near it. Accounts now carry a scrypt password digest
   and a role, so three rules replace it:
   - **The acting user comes from the session cookie, never from the request body.** A
     `learner_id` in a payload is a claim, not a fact. Progress, runs and the assistant all read
     it from the session — otherwise one learner can write another's progress, which would make
     both the dashboard and the certificate meaningless.
   - **`password` never leaves the server.** Not in `/auth/me`, not in the People roster, not in
     the dashboard. No format in this folder may carry it outward.
   - **The role is never trusted from the client.** The session token deliberately omits it, so
     every request re-reads the account and a demotion applies immediately. A hidden menu item is
     not a permission: each protected route checks the role server-side as well.
6. **Timestamps.** ISO-8601 UTC `Z`; `_ms` suffix for durations; stored, not derived.
7. **Template vs instance.** `{options, value}`, `_itemTemplate` and `_comment` exist ONLY in
   `*_format.json`. Real payloads are plain values.
8. **Additive evolution.** New keys are appended; removing or renaming one bumps the `schema`
   version.
9. **The run path is the attack surface.** Any change to `run_format` must preserve the timeout, the
   concurrency cap and the navigation allowlist. A format change may not introduce a way to run code
   that bypasses them.

## Verification checklist

- [ ] Every `*.json` here parses.
- [ ] No `options`, `_itemTemplate` or `_comment` key in anything under `Data/Content/` or `Data/Learners/`.
- [ ] `shared/contracts/` reflects the change and `npm run typecheck` passes in both workspaces.
- [ ] `grep -r "fetch(" frontend/src` matches only `api/client.ts`.
- [ ] `npm run verify` (the import proof) is green.
- [ ] This registry updated if a consumer was added, moved or removed.
