# Desktop app

Packages the studio (the Option C page, the backend and the course) as a Windows app that runs
**fully offline**: it ships its own Node and its own Chromium, Firefox and WebKit, so the learner's
computer needs neither Node nor the internet.

It is proprietary software, and it is built so that copying it is **forbidden, slow and
traceable**. No packaging can make copying impossible: everything the app needs to run, including
the key that unlocks the course, is on the learner's computer. The aim is that taking the course
out in bulk needs real skill and time, and that a copy that does get out points to the licence it
came from.

## Build

In this folder (`desktop/`), with Node 24:

```bash
npm install
npm run runtime
npm run package
```

- `npm run runtime` copies Node (from the Node you run it with) and the browsers (from this
  computer's Playwright cache, or downloads them) into `runtime/`. Once, and again when Node or
  Playwright is upgraded.
- `npm run package` builds the app and the installer:
  `release/QA-Practice-Training-Studio-Setup-<version>-internal.exe` (about 450 MB).
  It takes the course from `../Data/Content/`, so run `npm run build:content` at the root first
  when the course has changed.

`npm start` builds a development copy (readable code, DevTools on) and runs it without packaging.

## Licences

Every copy needs a licence file from Evoke. Evoke signs licences with its private key; the app
only holds the public key, so a licence cannot be forged or edited.

```bash
npm run licence:keygen
npm run licence:issue -- --licensee "Acme Ltd" --email lead@acme.com --expires 2027-09-30
```

- `licence:keygen` runs **once, ever**. It writes `keys/licence-private.pem` (secret, never
  committed; **back it up somewhere safe**: without it no new licence works with copies already
  given out) and `src/licence-public.pem` (committed, built into the app).
- `licence:issue` writes `licences/<id>-<licensee>.lic` and records it in `keys/issued.csv`.
  `--machine XXXX-XXXX-XXXX-XXXX` limits it to one computer (the learner sees the machine code
  on the licence screen); `--id` reissues an existing licence ID.

The learner chooses the file on first start, then accepts the licence agreement.

### A build for one customer

```bash
npm run package -- --licence licences/EVK-1A2B3C4D-acme-ltd.lic
```

That installer carries the licence (no file to choose), accepts **only** that licence ID, and every
lesson carries that ID as an invisible watermark. If course text turns up somewhere:

```bash
npm run watermark:find -- copied-text.txt
```

prints the licence ID, which `keys/issued.csv` maps to the customer.

## What protects it

| Layer | What it does |
|---|---|
| Licence agreement | Shown and accepted on first start: no copying, extracting, reverse engineering. `legal/EULA.txt` is a **draft for legal review**. |
| Licence | Ed25519-signed; optional expiry and one-computer limit. |
| Encrypted course | `content.pack`, AES-256-GCM, new key every build, decrypted in memory only. |
| Locked API | The backend listens on 127.0.0.1 and answers only the app's own window (a new random token per start). A browser or script on the same computer gets 401. |
| Obfuscated code | The main process and backend are bundled and obfuscated; the page's own code is obfuscated; no source maps. |
| Electron fuses | Cannot be run as Node, with NODE_OPTIONS or a debugger; loads code only from `app.asar`, and refuses to start if `app.asar` was changed. Debugger switches and DevTools are refused. |
| Watermarks | The licence ID, invisible, in the lesson text. The window title names the licensee. |

What it does **not** stop: someone reading lessons on screen and retyping them, screenshots, or a
skilled person spending days pulling the key out of the obfuscated code. The lesson files a
learner runs are written to their workspace in plain text; that is the product working.

## Tests

```bash
npm run build -- --dev
npm run test:app
npm run package
npm run test:release
```

- `test:app` drives the development build with Playwright: every licence case, the agreement, the
  locked API, offline fonts, watermarks, the Terminal on the bundled Node, the editor's Run, and
  Check my answer with tests in all three bundled browsers.
- `test:release` checks the packaged app from outside: the fuses, what `app.asar` contains, that
  nothing in it is readable, that debugger switches and a changed `app.asar` are refused, and that
  the API refuses everything but the window.

Both use the real app data folder (`%APPDATA%\QA Practice Training Studio`) and empty it.

## Before the first external release

- **Code signing.** Buy a Windows code-signing certificate; set `CSC_LINK` and
  `CSC_KEY_PASSWORD` when running `npm run package`. Unsigned, SmartScreen warns on install.
- **Legal review** of `legal/EULA.txt` (placeholders in brackets) and of the `[REVIEW]` notes in
  the generated `THIRD-PARTY-NOTICES.txt` (source offer for the LGPL/MPL browser parts, Node's
  licence file).
- Confirm in writing that Evoke holds the rights to the course content.
- Back up `keys/licence-private.pem` and `keys/issued.csv`.
