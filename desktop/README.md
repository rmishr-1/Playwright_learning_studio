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

## A new customer

Double-click **`new-customer.bat`** (in this folder). It asks for the customer's name, an optional
email, expiry date, logo (a PNG or JPEG, up to 300 KB; drag the file into the window) and machine
code, then issues their licence and builds their app, in about 10 minutes. What to send them is in
`deliveries/<licence id>-<customer>/`:

- `QA-Studio-<version>-<licence id>.zip`: the app. They unzip it to a short folder (such as
  `C:\QA Studio`: the browsers' deepest files are 149 characters in, and Windows cannot extract
  past 260) and run `QA Practice Training Studio.exe`; nothing to install.
- `<customer> licence.lic`: their licence.
- `READ ME FIRST.txt`: the four steps to start.

That app opens **only** with that licence: it refuses every other one, even a valid licence
issued to someone else, and without the licence it opens nothing. Their logo, when given, shows
in the header right of the theme switch; it is part of the signed licence, so it cannot be
swapped. Their lessons carry the licence ID as an invisible watermark.

The same without questions:
`npm run new-customer -- --licensee "Boston University" --logo bu.png --expires 2027-09-30`

A new zip for a customer who already has a licence (after a course update), without issuing a
new one: `npm run new-customer -- --rebuild licences/<id>-<customer>.lic`

The zip is about 700 MB, almost all of it the three browsers the course tests in (Chromium in both
its forms, Firefox and WebKit), which the app ships so it works offline. The app itself is 3.5 MB.
The tool says DONE when the zip is in `deliveries/`; the last 5 minutes are the zip being made.

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
  on the licence screen); `--logo file.png` adds the customer's logo; `--id` reissues an existing
  licence ID.

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
npm run build -- --dev --obfuscate
npm run test:app
npm run package
npm run test:release
```

- `test:app` drives a development build with Playwright, laid out as installed (packed into
  `app.asar`, with the release's fuses, see `tests/packed.ts`): every licence case, the agreement, the
  locked API, offline fonts, watermarks, the Terminal on the bundled Node, the editor's Run, and
  Check my answer with tests in all three bundled browsers. `--obfuscate` makes the build's code
  exactly a release's, so this tests the code that ships; a real release refuses Playwright.
- `test:release` checks the packaged app from outside: the fuses, what `app.asar` contains, that
  nothing in it is readable, that debugger switches and a changed `app.asar` are refused, and that
  the API refuses everything but the window.
- `npm run build -- --dev --licence <file>` then `npm run test:customer -- <file>` checks a
  customer's build: it opens with its licence, refuses others, and carries that watermark.

They use the app's data folder (`%APPDATA%\QA Practice Training Studio`): they move it aside while
they run and put it back after, and refuse to start while the app is open.
`npm run test:release -- <licence>` checks a customer's zip build, which does not carry its licence.

## Before the first external release

- **Code signing.** Buy a Windows code-signing certificate; set `CSC_LINK` and
  `CSC_KEY_PASSWORD` when running `npm run package`. Unsigned, SmartScreen warns on install.
  electron-builder then signs every .exe it ships, the browsers' included; decide whether that is
  wanted, or limit it with a custom `win.signtoolOptions.sign`.
- **Test on a clean computer**: a Windows machine or VM with no Node and no internet. Install,
  add a licence, and run a Day 1 demo, a Day 5 `node` file and a Day 9 Check my answer.
- **Legal review** of `legal/EULA.txt` (placeholders in brackets) and of the `[REVIEW]` notes in
  the generated `THIRD-PARTY-NOTICES.txt` (source offer for the LGPL/MPL browser parts, Node's
  licence file).
- Confirm in writing that Evoke holds the rights to the course content.
- Back up `keys/licence-private.pem` and `keys/issued.csv`.
