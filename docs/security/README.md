# Evoke Training Studio: security-testing guide

For Evoke's own security team. It describes every interface the application offers or uses, how
each is protected, and where to look first. Nothing here goes to customers.

| File | What it is |
|---|---|
| [`openapi.yaml`](openapi.yaml) | OpenAPI 3.1 spec of the studio's local HTTP API, its WebSocket and the report server. Import it into Burp, ZAP or Postman. |
| [`swagger.html`](swagger.html) | The same spec in Swagger UI. Double-click to open (it carries a copy of the spec; it loads Swagger UI from cdnjs, so it needs the internet). After changing `openapi.yaml`, run `python3 docs/security/embed-spec.py` to refresh the copy. |
| this file | Architecture, trust boundaries, the two desktop IPC bridges, outgoing downloads, licences, data on disk, observations, and a test plan. |

Everything below comes from the code as of this commit. File references are `path:line`.

---

## 1. What runs where

```
Learner's PC (Windows, per-user install, no admin)
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Launcher (Electron main process, desktop/src/main.ts)                            │
│   - launch window (licence, progress)  ── IPC: window.setup ──┐                  │
│   - downloads + verifies the studio code and the course (GitHub, signed + AES)   │
│   - runs the studio code in-process (bundle-loader.ts)                           │
│   - studio window → http://127.0.0.1:<port> with cookie studio_token             │
│                                                                                  │
│ Studio backend (Express, in the launcher process)                                │
│   - API server   127.0.0.1:<20000-49999>   Host/Origin/cookie gate               │
│   - report server 127.0.0.1:<random>/<32-hex>   HTML report + View in Page        │
│   - spawns learner code: Run harness (node) and Terminal (node / tsc / playwright)│
│       └── headless browsers (Chromium/Firefox/WebKit) with a navigation allowlist │
│ Learner's own browser: opens the report and View in Page pages                   │
└──────────────────────────────────────────────────────────────────────────────────┘
Evoke's build PC only: Studio Tools window (desktop/tools) ── IPC: window.tools ── runs .bat jobs

Internet (outgoing only): raw.githubusercontent.com (every start), nodejs.org,
storage.googleapis.com, playwright.download.prss.microsoft.com, cdn.playwright.dev (first start)
```

**Trust boundaries**
1. **Other local processes / web pages → the studio API.** Protected by binding to 127.0.0.1, the
   Host check (DNS rebinding), the Origin check (cross-site requests), and the per-start cookie token.
2. **The learner's code → the learner's computer.** By design, learner code runs as the learner (it
   is a coding course). The allowlists keep lessons on track; **they are not a sandbox**.
3. **The internet → the launcher.** Everything downloaded is signed and/or hash-pinned, and the
   course and studio code are encrypted to the licence.
4. **A customer → Evoke's content.** The licence (Ed25519-signed, optionally machine-bound) plus an
   app secret are both needed to decrypt the course.
5. **Evoke's build PC → signing key and releases.** Studio Tools and the `.bat` jobs; never shipped.

---

## 2. The studio API (details in `openapi.yaml`)

### 2.1 The gate (backend/src/server.ts:200-210)
- **Bind:** `server.listen(port, '127.0.0.1')` (server.ts:301). The report server too (server.ts:184).
- **Host:** desktop accepts exactly `127.0.0.1:<port>`; development also `localhost:<port>` (server.ts:105-107).
- **Origin** (when sent): desktop exactly `http://127.0.0.1:<port>`; development also the Vite page on 5185. `Origin: null` is refused.
- **Token:** cookie `studio_token`, 64 hex, new each start (desktop/src/main.ts:646), set on the
  launcher's own session as httpOnly + SameSite=Strict (main.ts:653-659); compared with
  `crypto.timingSafeEqual` after a length check (server.ts:97-102). No other way to send it.
- **Frame callback** `POST /api/terminal/<uuid>/frame` skips the cookie. It needs the per-command
  `X-Studio-Frame-Key` (16 random bytes, hex), checked before the body is read (410), and a
  loopback remote address (403) (server.ts:219-225, routes.ts:373-377, terminal/index.ts:369-385).
- **WebSocket** `/api/run/<uuid>/stream`: same gate; refused upgrades are destroyed (server.ts:276-294).
- Not present: CORS headers, CSRF tokens, rate limiting, helmet. Unknown keys in bodies are dropped.

Verified on a running backend for this guide: wrong `Host` → 401; `Origin: http://evil.example`
→ 401; `Origin: null` → 401; wrong frame key → 410; bad JSON → 400 problem+json; unknown
`/api/...` → Express HTML 404.

### 2.2 Headers
All responses: `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin` (server.ts:117-126).
The page also gets `X-Frame-Options: DENY` and a strict CSP (`script-src 'self'`,
`frame-ancestors 'none'`, …; server.ts:73-86).

### 2.3 The report server (server.ts:148-190)
- Random port, secret path `/<32 hex>` (config.ts:144), both new each start. **No token or Origin
  check**; the secret path is the only key. Host must be `127.0.0.1` or `localhost` with its port.
- Report files: realpath must stay inside the report folder (403), `dotfiles: 'deny'`.
- View in Page (`/<path>-page/<32 hex>`): `Content-Security-Policy: sandbox allow-scripts
  allow-forms allow-modals allow-popups` and `nosniff`; a helper script is injected
  (backend/src/preview.ts).

### 2.4 Learner code (intended code execution)
**Run button** (backend/src/runner.ts):
- One Node process per run, temp folder, environment allowlist, stdin closed, killed at the timeout
  (default 30 s) with its whole process tree.
- Module guard: the program may `require` only Node built-ins and the shipped/installed packages
  (runner.ts:374-397; plus `module-guard.cjs` via `NODE_OPTIONS`, child-env.ts:25-63).
  Built-ins include `fs` and `child_process`: **full user rights**.
- Browsers: every `launch()` forced headless, `launchPersistentContext` refused, every context gets
  `serviceWorkers: 'block'` and the navigation gate (top-level navigations only; redirects sent to
  `about:blank`).
- Navigation allowlist default (backend/src/config.ts:90-96): `https://shop.test`,
  `https://qa-academy.test`, `https://playwright.dev`, `http://localhost`, `http://127.0.0.1`
  (the last two: any port).
- The parent parses the child's stdout for `__STUDIO_EVT__` lines; the child can forge them
  (types and sizes are checked).

**Terminal** (backend/src/terminal/commands.ts, index.ts): no shell; the line is parsed and only
`node <file>.ts` (in `ts-basics/`), `npm run check <file>`, `[npx] playwright test` with
allowlisted flags/values/paths, `npx playwright show-report`, and version/help run. `npm pkg set
scripts.<name>=...` writes a script to the workspace's package.json only when its value itself
parses as `playwright test` or `show-report`; `npm test` / `npm run <name> [-- args]` re-parse that
script plus the args through the same allowlist. `--ui`,
`--debug`, `codegen`, `install`, `init` and anything else are refused. One command at a time,
default limit 5 min. Test processes load `.studio/test.ts`: headless forced, same navigation gate,
frames posted to the frame callback.

**Environment** (backend/src/child-env.ts:83-142): an allowlist of Windows variables (no `HOME`,
no tokens/proxies), plus `NODE_OPTIONS=--require module-guard.cjs`.

---

## 3. The launcher window bridge: `window.setup` (desktop/src/setup-preload.ts)

| Method | Channel | Args | Notes |
|---|---|---|---|
| `state()` | `setup:state` | none | Returns `{step, product, version, machine, reason, message, detail}` (includes the machine code) |
| `chooseLicence()` | `setup:choose` | none | Only in step `licence`. Native open dialog (`.lic`, `.json`); file read, verified, copied to `%APPDATA%\<product>\licence.lic`. The path never comes from the page. |
| `copyMachineCode()` | `setup:copy-machine` | none | Clipboard write |
| `retry()` | `setup:retry` | none | Only in step `problem` |
| `quit()` | `setup:quit` | none | |
| `onUpdate(fn)` | `setup:update` (main → page) | | The IPC event object is not passed to the page |

- **Sender check** on every handler: same webContents and frame URL exactly
  `studio://app/setup.html` (main.ts:319-326). Handlers removed when the window closes.
- Page: CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'`;
  all text rendered with `textContent`. The `studio://` scheme serves only `/setup.html` and `/logo.png`.
- **All windows** (main.ts:267-274, 753-782): `contextIsolation`, `sandbox`, no `nodeIntegration`,
  `webSecurity`, DevTools off and force-closed in release; window.open only to the studio origin
  (http(s) links go to the system browser); navigation, redirects and subframes locked to the
  studio origin; webviews refused.
- **Session** (main.ts:839-856): direct (no proxy), requests outside the studio origin cancelled,
  cookies stripped from any other request, permissions limited to clipboard write and fullscreen.
- **Start-up guards, release** (main.ts:96-122): exits on any extra argument or on 20 dangerous
  Chromium switches (`remote-debugging-*`, `inspect*`, `js-flags`, `proxy-*`,
  `ignore-certificate-errors`, …); single instance; refuses to start when other users can write the
  install or runtime folder (PowerShell `Get-Acl`, main.ts:864-910).
- **Electron fuses** (desktop/scripts/package.ts:363-372): `runAsNode` off, NODE_OPTIONS off,
  `--inspect` off, cookie encryption on, embedded asar integrity on, only load from asar.
- **The studio code** is downloaded, decrypted in memory and run in the main process
  (desktop/src/bundle-loader.ts) with a `require` filter (built-ins except `electron`, JSON under
  its own `node_modules`).

---

## 4. The Studio Tools bridge: `window.tools` (desktop/tools; Evoke's build PC only)

`studio-tools.bat` builds the window and starts it from a staged copy in
`%LOCALAPPDATA%\EvokeStudioTools`. A release check fails the build if `tools/` or `node-pty` is ever
inside an app (desktop/tests/release-checks.ts:170-172).

| Method | Channel | Args | Validation in the main process |
|---|---|---|---|
| `info()` | `tools:info` | none | Returns root/desktop paths, Electron version, Windows build, build time |
| `status()` | `tools:status` | none | Runs `desktop/tools/status.ts` in a child Node (60 s); refused while a job runs |
| `checkGithub()` | `tools:check-github` | none | Same, plus two unauthenticated GETs of `latest.json` on raw.githubusercontent.com, verified with the public key |
| `run(req)` | `tools:run` | `{jobId, form, cols, rows}` | `jobId` must be one of the 17 jobs; one job at a time; each form value boolean or a string matching `ARG = /^[^"%!^&|<>\r\n]{0,200}$/`, and every built argument again; cols 20-400, rows 5-200 (main.ts:118-161) |
| `input(data)` | `tools:input` | string | Typed into the running job's terminal |
| `resize(size)` | `tools:resize` | `{cols, rows}` | Clamped |
| `stop()` | `tools:stop` | none | `taskkill /pid <pid> /T /F` |
| `pickFile(req)` | `tools:pick-file` | `{mode, title, filters, defaultPath?}` | Native dialog; returns the chosen path |
| `openFolder(req)` | `tools:open-folder` | `{what, code?}` | Only `root`, `desktop`, `licences`, `key-dir`, `deliveries[/<code>]`, `code` matching `^[A-Za-z0-9]{2,8}(-full)?$` |
| `onData` / `onStarted` / `onExit` | main → page | | |

- **Sender check:** same webContents and frame URL exactly the staged `index.html` (main.ts:211-218).
- **Jobs run** as `cmd.exe /d /s /c "<fixed .bat path> <args>"` through node-pty (main.ts:104-145); the
  `.bat` path comes from the fixed job list, arguments from the form (quoted when they contain
  spaces). Environment: the user's, minus `ELECTRON_*`, `npm_*`, `NODE_OPTIONS`, plus `STUDIO_TOOLS=1`.
- **Window:** contextIsolation, sandbox, no nodeIntegration; navigation and pop-ups refused; CSP
  `default-src 'none'; script-src 'self'; …` (no network from the page). **DevTools are enabled**
  (F12).
- **Jobs** (desktop/tools/jobs.ts): setup, keygen, passphrase, backup-key, restore-key, setup-kit,
  new-customer, issue-licence, revoke-licence, publish-access, build-app, publish-course,
  publish-app, launcher, git-sync, collab-pull, collab-push.

---

## 5. Outgoing network calls (desktop/src/fetch-session.ts, release.ts, runtime-install.ts)

No telemetry, analytics or auto-update. Requests use an in-memory session with the system proxy,
`credentials: 'omit'`, no cache, and **send no licence id, machine code, seal or token**. The only
added data is a `?t=<timestamp>` cache-buster on `latest.json`. TLS uses the Windows certificate
store; there is no pinning (integrity comes from signatures and hashes). Only `https://` URLs under
an allowlist of prefixes may be fetched, on every redirect hop.

| When | Host / URL | Size limit | Verified by |
|---|---|---|---|
| Every start | `raw.githubusercontent.com/<owner>/training-studio-app/main/channels/api-1/latest.json`, then `blobs/<sha256>.bin` | 1 MiB; blob ≤ 96 MiB | Manifest Ed25519 signature (domain-separated prefix), blob size + SHA-256, AES-256-GCM grant and blob keyed from the licence seal + app secret (HKDF), container format checks (≤ 4000 files, safe paths) |
| Every start | `.../training-studio-course/main/latest.json`, `blobs/<sha256>.bin` | 1 MiB; ≤ 32 MiB | Same |
| First start (standard build) | `nodejs.org/dist/`, `storage.googleapis.com/chrome-for-testing-public/`, `playwright.download.prss.microsoft.com/...`, `cdn.playwright.dev/` | exact pinned size | Pinned size + SHA-256 before unpacking (bsdtar `C:\Windows\System32\tar.exe`), then a pinned hash of the unpacked tree (desktop/runtime-sources.json) |

**Rollback:** a release older than the last accepted one is refused; the stored manifest is reused
(release.ts:79-94). **Revocation:** licence fingerprints in `revoked.json` (built in) and in each
release manifest; the licence is re-checked hourly (main.ts:970-978).

---

## 6. Licences (desktop/src/licence.ts)

- `{ licence: {id, licensee, email, issued, expires, machine, product, logo?, seal?, serial?}, signature }`.
- Ed25519 over a canonical JSON; one accepted signature encoding (so a revoked one cannot be
  re-encoded); `product` must be `learning-studio`; expiry with a clock floor (the newest of the
  date, the last release, `last-seen.json`, the build date and file times; main.ts:160-213);
  optional machine binding to `SHA-256('learning-studio:' + MachineGuid)` (first 16 hex).
- The `seal` in the licence is half of the course key; the other half is the app secret.

---

## 7. Data on disk

| Place | What | Protection |
|---|---|---|
| `%LOCALAPPDATA%\Programs\<product>` | The app (asar + unpacked node_modules) | Asar integrity fuse; ACL check at start |
| `%LOCALAPPDATA%\<product>\runtime` | Node.js and browsers | Hash-pinned at install; ACL check at start |
| `%APPDATA%\<product>` | `licence.lic`, `port.json`, `last-seen.json`, `Progress\`, `Workspace\`, `release-state\` | User profile only |
| Memory | The course and the studio code | Never written to disk; the server sends `no-store`; traces removed at quit (cleanup.ts) |

---

## 8. Observations for testers (from the code review for this guide; not fixed yet)

Ranked roughly by how much they are worth a tester's time.

| # | Where | Observation |
|---|---|---|
| 1 | backend/src/server.ts:200-210, index.ts:9 | **Development mode has no authentication.** Without a token, any local client that sends the right `Host` and no `Origin` can use every route, including `/api/run` (code execution). Desktop release builds always have a token. |
| 2 | backend/src/config.ts:90-96 | **The navigation allowlist allows `http://127.0.0.1` and `http://localhost` on any port**, so learner code's browser can open the studio's own port and the report server. The API refuses it without the cookie (401); the report server needs the secret path. |
| 3 | backend/src/server.ts:156-173 | **No CSP on the HTML report files** of the report server; they are opened in the learner's own browser on that origin. |
| 4 | backend/src/routes.ts:283-298 | **`POST /api/terminal` has no locked-day check** (other routes return 423 for locked days). |
| 5 | backend/src/routes.ts:85-102 | **`GET /api/course/{week}/{day}` sends each exercise's model `solution` and `check`** to the page. |
| 6 | routes.ts:191-193, 366 | `run_id` path params of `last-frame` and `stop` are not format-checked (they only look up a Map). |
| 7 | desktop/tools/main.ts:118-161 | Studio Tools: the per-field patterns, required fields and allowed options are checked **only in the page**; the main process checks only `ARG`. With DevTools (F12) a value such as `--full` or `/branch` can add an option a job's `.bat` accepts. Command chaining is blocked (`& | < > ^ " % !` and newlines refused). |
| 8 | desktop/tools/main.ts:31-39, 62-64 | Studio Tools: DevTools enabled. |
| 9 | desktop/tools/launch.ts:33-71 | Studio Tools: the staged Electron and app in `%LOCALAPPDATA%\EvokeStudioTools` are reused without an integrity check; `config.json` there decides which folder's `.bat` files run. |
| 10 | desktop/tools/status.ts:7-8; signing-key.ts:139-141 | Studio Tools: the status script says it "never loads the private key", but `needsPassphrase()` decrypts the key file (DPAPI) and reads its first bytes; `migrate()` may write files. |
| 11 | desktop/src/bundle-loader.ts:31,53 | The studio code's `require` filter can be bypassed by the code itself (`module.require`); trust rests on the release signature and encryption, not on the filter. |
| 12 | desktop/src/main.ts:5,96-122 | "Refuses to run under a debugger" means argument/switch refusal plus fuses; there is no runtime debugger detection. |
| 13 | desktop/scripts/package.ts:357; main.ts:882-884 | `node_modules` is unpacked outside asar integrity; it relies on the folder ACL check, which **fails open** if PowerShell fails. |
| 14 | desktop/src/runtime-install.ts:165-172 | The runtime is hash-checked at install only, not at each start. |
| 15 | desktop/src/release.ts:79-94 | The rollback floor lives in `release-state\`, which the user can delete. |
| 16 | desktop/src/main.ts:328-348; licence.ts:49 | The chosen licence file is read with no size limit; `LOGO_MAX_BYTES` is defined but not enforced. |
| 17 | desktop/src/untar.ts:46 | Package extraction does not reject `:` (NTFS streams) or reserved device names (the tarballs are signed). |
| 18 | desktop/src/fetch-session.ts | No TLS pinning: a corporate TLS-inspection CA is accepted (content stays signed and encrypted). |

---

## 9. Suggested test plan

1. **Local API from outside the studio window** (desktop build): find the port
   (`%APPDATA%\<product>\port.json`), call `/api/*` without the cookie, with a wrong cookie, with a
   foreign `Host` (DNS rebinding), from a web page in the browser (CSRF, `fetch` with
   `no-cors`, form POST with `text/plain`), and over the WebSocket. Expect 401 / destroyed sockets.
2. **Frame callback:** forge `POST /api/terminal/<uuid>/frame` with guessed keys; check the timing
   and the 403/410 split.
3. **Inputs:** fuzz every body against `openapi.yaml` (sizes at and over each limit, unknown keys,
   `Number()` edge cases in `/api/course/{week}/{day}`, path traversal in `file` of
   `/api/terminal` and in the report server's paths, encoded `..`, symlinks in the report folder).
4. **Learner code:** from the Run button and the Terminal, try to reach the studio API, the report
   server, other hosts, other modules; try Terminal flags outside the allowlist, `node` on paths
   outside `ts-basics`, quoting tricks; forge `__STUDIO_EVT__` lines.
5. **View in Page:** script inside a practice page - can it reach the studio, the report, or the
   learner's other data? (Expect: opaque origin, no studio cookie.)
6. **Launcher:** run with extra arguments and debugging switches; tamper with
   `app.asar.unpacked`, the runtime folder, `release-state`, `licence.lic`, the clock, and
   MachineGuid; replay an older release; serve a modified release through a TLS-inspecting proxy.
7. **Studio Tools** (build PC): from DevTools call `window.tools.run` with crafted form values and
   unknown keys; tamper with the staged folder.
