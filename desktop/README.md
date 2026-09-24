# Desktop app

Packages the studio (the Option C page, the backend and the course) as a Windows app that runs
**fully offline**: it ships its own Node and its own Chromium, Firefox and WebKit, so the learner's
computer needs neither Node nor the internet.

It is proprietary software, and it is built so that copying it is **forbidden, slow and
traceable**. No packaging can make copying impossible: everything the app needs to run is on the
learner's computer. The aim is that taking the course out in bulk needs real skill and time, and
that a copy that does get out points to the licence it came from.

## A new customer

Double-click **`new-customer.bat`** (in this folder). It asks for the customer's name, an optional
email, expiry date, logo (a PNG or JPEG, up to 300 KB; drag the file into the window) and machine
code, then issues their licence and builds their app, in about 10 minutes. Keep the window open
until it says **DONE**. What to send them is in `deliveries/<licence id>-<customer>/`:

- `QA-Studio-<version>-<licence id>.zip`: the app. They unzip it to a short folder (such as
  `C:\QA Studio`: the browsers' deepest files are 149 characters in, and Windows cannot extract
  past 260) and run `QA Practice Training Studio.exe`; nothing to install.
- `<customer> licence.lic`: their licence.
- `READ ME FIRST.txt`: the four steps to start.
- `SHA256SUMS.txt`: the fingerprints of the zip and the licence, so they can check what arrived.

**Send the licence by a different route from the zip** (for example the zip as a download link,
the licence by email to the named contact), and the fingerprints by a third, or read them out:
the seal only helps while the zip and the licence travel apart, and fingerprints that travel with
the zip prove nothing about it until the app is code-signed.

A licence with no end date and no computer limit opens the customer's copy on any number of
computers, for good. For a customer with several learners, consider one licence per learner, or
at least an end date.

That app opens **only** with that licence: it refuses every other one, even a valid licence
issued to someone else. Its course is **sealed** to the licence: without the licence file the app
cannot even decrypt it (a customer build is refused for a licence without a seal). Their logo
shows in the header right of the theme switch; it is part of the signed licence, so it cannot be
swapped. The lessons carry the licence ID as an invisible watermark.

If no code-signing certificate is set, `new-customer` asks before building an unsigned copy
(`--unsigned` answers yes when it runs without questions).

The same without questions:
`npm run new-customer -- --licensee "Boston University" --logo bu.png --expires 2027-09-30`

A new zip for a customer who already has a licence (after a course update), without issuing a
new one: `npm run new-customer -- --rebuild licences/<id>-<customer>.lic`

The zip is about 700 MB, almost all of it the three browsers the course tests in, which the app
ships so it works offline. The app itself is 3.5 MB.

## Licences and the signing key

Evoke signs licences with its private key; the app holds only the public key, so a licence cannot
be forged or edited.

The private key lives **outside this project**, in `%USERPROFILE%\.evoke-studio\`, encrypted by
Windows for this user on this computer (DPAPI): a copy of the file is useless anywhere else. The
record of issued licences (`issued.csv`, with the customers' emails) and each licence's seal
(`seals.json`) are kept beside it. `npm run licence:set-passphrase` adds a passphrase, asked for
whenever a licence is issued, so another program running as you cannot sign one.

```bash
npm run licence:backup-key -- D:\safe\evoke-signing-key.backup
```

**Do this now, and keep the backup and its passphrase safe, offline, and apart.** Because the key
opens only for this Windows user on this computer, the backup is the only way to issue licences
again on a new computer or profile (`npm run licence:restore-key -- <file>`). Without it, no new
licence will ever work with the copies already given out.

| Command | What it does |
|---|---|
| `npm run licence:issue -- --licensee "Acme Ltd" [--email x] [--expires 2027-09-30] [--machine CODE] [--logo x.png]` | Issues a licence into `licences/` |
| `... --id EVK-1A2B3C4D` | Reissues a licence (a new expiry, or bound to one computer). Same licensee only; it keeps the seal, so the customer's build still opens, and the old file is revoked. Add `--new-seal` when the licence leaked: the customer then needs a new build too. |
| `npm run licence:revoke -- licences/<file>.lic` | Withdraws a licence file: builds made from now on refuse it (`revoked.json`, committed; licence IDs only, never names). |

**Revoking reaches only builds made afterwards.** A copy already sent keeps the revocation list it
was built with, so it still opens with the old file. A reissue that narrows a licence (a computer
limit, an earlier end date) therefore needs a new build for the customer
(`npm run new-customer -- --rebuild <new licence>`); `licence:issue` says so when it happens. When
the old file must stop working even in the copy they have, reissue with `--new-seal`: the old
file then cannot decrypt the new build, and the old build is replaced.
| `npm run licence:keygen` | Makes the key pair. Once, ever; it refuses to replace a key. |
| `npm run watermark:find -- copied-text.txt` | Prints the licence ID hidden in copied course text; `issued.csv` names the customer. |

## Build

In this folder, with Node 24:

```bash
npm ci
npm run runtime -- --fresh
npm run package -- --internal
```

- `npm run runtime` gathers the Node the app ships (it must carry the OpenJS Foundation's valid
  signature) and the browsers at the revisions Playwright pins, and writes a SHA-256 manifest of
  it all. `--fresh` downloads the browsers again rather than copying this computer's cache: use
  it for anything that leaves Evoke. Every browser must match its hash in `runtime-pins.json`
  (committed); after upgrading Playwright, `npm run runtime -- --fresh --pin` records the new
  ones. Packaging refuses a runtime that has changed since.
- `npm run package -- --internal` builds the internal installer
  (`release/QA-Practice-Training-Studio-Setup-<version>-internal.exe`), for any valid licence.
  `--licence <file>` builds one customer's instead; `--carry` puts the licence inside it (then
  anyone with the installer can open it, so it is off by default); `--zip` makes a zip.
  Without a code-signing certificate (below) add `--unsigned`.
- The app's own packages for the learner's code (Playwright, TypeScript) are taken from their npm
  tarballs, checked against `package-lock.json`, not from `node_modules`.
- It takes the course from `../Data/Content/`: run `npm run build:content` at the root first
  when the course has changed. The build refuses a `src/licence-public.pem` that does not match
  the signing key's fingerprint.

## What protects it

| Layer | What it does |
|---|---|
| Licence agreement | Shown and accepted on first start, including the technical measures (section 4A). `legal/EULA.txt` is a **draft for legal review**. |
| Licence | Ed25519-signed; optional expiry and one-computer limit; revocation list (builds made after the revocation); re-checked every hour, with ten minutes' notice before the studio closes once a licence has ended; the learner is warned two weeks ahead. |
| Clock guard | The day used for expiry is never earlier than the day the licence was issued, the day the app was built, or the latest date of the app's own files (two folders deep). Turning the clock back after that takes deleting the app's data, progress included; it does not stop someone who does. |
| Encrypted, sealed course | `content.pack`, AES-256-GCM, a new key every build, decrypted in memory only and never cached; a customer's build needs their licence to decrypt it. |
| Locked API | 127.0.0.1 only; answers only the app's window (a new random token every start), and only to its own host name, so neither another program nor a web page can read it. |
| Locked app | No command-line switches in a release (debuggers, proxies, network logs); Electron fuses; DevTools off; nothing leaves the computer; the test report is served apart from the studio; the learner's code gets none of the app's environment. |
| Obfuscated code | The main process, backend and page code are obfuscated; no source maps. |
| Watermarks | The licence ID, in zero-width characters, in every paragraph and list of the lessons (about seven blocks in ten; blocks that are only code or a table carry none), quiz questions, options and explanations, exercise statements, hints and fenced solutions, added again as each lesson is served with the licence in use. They travel with copied and pasted text; retyping, screenshots or a deliberate clean-up remove them. The window title names the licensee. |

What it does **not** stop: someone reading lessons on screen and retyping them, screenshots, or a
skilled person spending days extracting the course from a licensed copy running on their own
computer. The watermark traces text copied and pasted out of the app; for screenshots, the window
title shows the licensee. Neither survives a deliberate effort to remove it.

## Tests

The tests use a throwaway key pair of their own; Evoke's signing key is never touched by one.

```bash
npm run test:app
npm run test:customer
npm run package -- --internal --unsigned
npm run test:release -- licences/<a licence the build accepts>.lic
```

- `test:app` builds the app (obfuscated like a release) and drives it laid out as installed
  (packed, with the release's fuses, `tests/packed.ts`): every licence case, the clock guard, the
  agreement, the locked API, no caching, the page's Content Security Policy, offline, watermarks,
  the Terminal on the bundled Node, the live view, the editor's Run, Check my answer in all three
  browsers, and the separate report server.
- `test:customer` builds a sealed copy for a test customer and checks it refuses other licences,
  opens with its own, carries its watermark and shows its logo.
- `test:release` checks the packaged app from outside: the fuses, what it contains, that nothing
  in it is readable, that every switch, a changed `app.asar`, a planted `reg.exe` and planted
  modules are refused, and that the API refuses everything but the window.

They move the app's data folder (`%APPDATA%\QA Practice Training Studio`) aside while they run and
put it back after, and refuse to start while the app is open.

## Before the first external release

- **Back up the signing key** (above).
- **Code signing.** Buy a Windows code-signing certificate. Certificates now live on a hardware
  token or in a cloud service; set whichever applies before `npm run package` or `new-customer.bat`:
  `STUDIO_SIGN_SUBJECT` (the certificate's subject name, for one in Windows' store or on a token),
  `STUDIO_AZURE_ENDPOINT`, `STUDIO_AZURE_ACCOUNT`, `STUDIO_AZURE_PROFILE` and
  `STUDIO_AZURE_PUBLISHER` (Azure Trusted Signing), or `CSC_LINK` and `CSC_KEY_PASSWORD` (a .pfx
  file). With one set, everything is signed with SHA-256 and each file made is checked to be
  validly signed. Without one, `package` needs `--unsigned`. Unsigned, SmartScreen warns on install.
- **GitHub branch protection** for `main` (Settings → Branches): require a reviewed pull request.
  `collab-push.bat` no longer pushes to `main`, but only GitHub can enforce it.
- **Legal review** of `legal/EULA.txt` (placeholders in brackets) and of the `[REVIEW]` notes in
  the generated `THIRD-PARTY-NOTICES.txt`; confirm in writing that Evoke holds the rights to the
  course content.
- **Test on a clean computer**: a Windows machine or VM with no Node and no internet.
