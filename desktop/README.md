# Desktop app

Packages the studio (the Option C page, the backend and the course) as a Windows app that runs
**fully offline**: it ships its own Node and its own Chromium, Firefox and WebKit, so the learner's
computer needs neither Node nor the internet. (Two lessons open playwright.dev, and need the
internet for that page only.)

It is proprietary software, and it is built so that copying it is **forbidden, slow and
traceable**. No packaging can make copying impossible: everything the app needs to run is on the
learner's computer. The aim is that taking the course out in bulk needs real skill and time, and
that a copy that does get out points to the licence it came from.

## Double-click jobs

In this folder, each asks for what it needs and waits for a key at the end:

| File | What it does |
|---|---|
| `build-app.bat` | Lists the apps (`variants.json`), asks which to build and whether as an installer or a zip, and puts it in `deliveries/<code>/`. Choose "Evoke Training Studio" for the internal app. |
| `new-customer.bat` | A new customer: their short code, licence and app, built (below). |
| `issue-licence.bat` | A new licence for a person or team at Evoke (it opens the internal app), or a reissue of one already issued: a new end date or computer, keeping its ID and, unless changed, its logo. |
| `revoke-licence.bat` | Lists the licences, asks which to revoke and why, and adds it to `revoked.json`. Then commit `revoked.json` and rebuild the app it opened. |

## The apps: one per audience

Every build is a **variant**, listed in `variants.json` (committed), and each has its own name:

| Code | App | Opens with |
|---|---|---|
| `internal` | Evoke Training Studio | any valid Evoke licence. **Never leaves Evoke**: it is not sealed. |
| a customer's code, e.g. `BOSTONU` | Evoke Training Studio BOSTONU | only that customer's licence |

new-customer.bat adds a customer's variant (below). A variant's name is its program
(`Evoke Training Studio BOSTONU.exe`), its install folder
(`%LOCALAPPDATA%\Programs\Evoke Training Studio BOSTONU`), its Start-menu and desktop shortcuts,
its entry in Windows' Apps list, its windows and its page, and its data folder
(`%APPDATA%\Evoke Training Studio BOSTONU`: progress, work, licence). Its `appId` names its installer's
registry entries and its taskbar button. So **every variant installs and runs beside the others**
on one computer, each with its own progress. A variant's name and appId are stored, not worked out
at build time: once one has been installed anywhere, changing either would make a different app
with none of the learner's progress.

```bash
npm run build-variant -- internal
npm run build-variant -- BOSTONU
```

Each builds the variant's installer and puts what to send in `deliveries/<code>/`, replacing that
variant's previous delivery only once the new one is complete. `--zip` makes a zip that runs where
it is unzipped instead; `--unsigned` builds without a code-signing certificate without asking;
`--carry` puts the licence inside the app (anyone with it can then open it, so it is off by
default). A customer's variant builds only on the computer that holds their licence
(`licences/` is not committed).

The studio run with `launcher.bat` (the Option C page and backend, from the repository) is plain
"Evoke Training Studio" too, and needs no licence: licences are the desktop app's alone.

## A new customer

Double-click **`new-customer.bat`** (in this folder). It asks for the customer's **short code**
(2 to 8 capital letters or digits, such as `BWP`: their app will be "Evoke Training Studio BWP"),
their name, an optional email, expiry date, logo (a PNG or JPEG, up to 300 KB; drag the file into
the window) and machine code. It then issues their licence, adds their variant to `variants.json`,
and builds their app, in about 10 minutes. Keep the window open until it says **DONE**, then
**commit `variants.json`**, so their app keeps its name and identity in every later build. What
to send them is in `deliveries/<code>/`:

- `Evoke-Training-Studio-<code>-Setup-<version>.exe`: the installer. It installs for the user
  only, with no administrator rights, into `%LOCALAPPDATA%\Programs\Evoke Training Studio <code>`
  (a folder other accounts cannot change: a release refuses to start from one they can), with
  Start-menu and desktop shortcuts. It is removed from Settings > Apps, which keeps the learner's
  progress, work and licence.
- `<customer> licence.lic`: their licence.
- `READ ME FIRST.txt`: how to install, start and remove the app.
- `SHA256SUMS.txt`: the fingerprints of the installer and the licence, so they can check what arrived.

With `--zip`, the app comes as `Evoke-Training-Studio-<code>-<version>.zip` instead, to extract to
`%LOCALAPPDATA%\Programs\Evoke Training Studio <code>`. Its folder carries **`Uninstall.bat`**
(a zip has no uninstaller of its own). It removes exactly the files and folders the zip put there,
named one by one when the app was packed, then the folder only if nothing else is left in it, so a
copy unzipped straight into Downloads takes nothing else with it. It refuses while the studio is
open, and asks before deleting the learner's progress, work and licence, which it keeps unless
told otherwise.

**Send the licence by a different route from the installer** (for example the installer as a
download link, the licence by email to the named contact), and the fingerprints by a third, or read
them out: the seal only helps while the app and the licence travel apart, and fingerprints that
travel with the app prove nothing about it until it is code-signed.

A licence with no end date and no computer limit opens the customer's copy on any number of
computers, for good. For a customer with several learners, consider one licence per learner, or
at least an end date.

That app opens **only** with that licence: it refuses every other one, even a valid licence
issued to someone else. Its course is **sealed** to the licence: without the licence file the app
cannot even decrypt it (a customer build is refused for a licence without a seal). Their logo
shows in the header right of the theme switch; it is part of the signed licence, so it cannot be
swapped. The lessons carry the licence ID as an invisible watermark.

If no code-signing certificate is set, the build asks before making an unsigned copy
(`--unsigned` answers yes when it runs without questions).

The same without questions:
`npm run new-customer -- --code BWP --licensee "BWP Group" --logo bwp.png --expires 2027-09-30`

A new build for a customer who already has a licence (after a course update):
`npm run build-variant -- <code>`, or `npm run new-customer -- --rebuild licences/<id>-<customer>.lic`,
which finds the variant by the licence (after a reissue, add `--code <their code>` if the licence
file's name changed; a licence with no variant yet gets one with `--code`).

The installer is about 700 MB, almost all of it the three browsers the course tests in, which the
app ships so it works offline. The app itself is 3.5 MB.

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
| `... --id EVK-1A2B3C4D` | Reissues a licence (a new expiry, or bound to one computer). Same licensee only; it keeps the seal, so the customer's build still opens, and every earlier file is revoked (all of them must still be in `licences/`). Add `--new-seal` when the licence leaked: the customer then needs a new build too. A withdrawn licence can come back only with `--new-seal`. |
| `npm run licence:revoke -- licences/<file>.lic [--reason withdrawn]` | Withdraws a licence file: builds made from now on refuse it (`revoked.json`, committed). The reason is a few plain words; a customer's name is refused. |
| `npm run licence:keygen` | Makes the key pair. Once, ever; it refuses to replace a key. |
| `npm run watermark:find -- copied-text.txt` | Prints the licence ID hidden in copied course text; `issued.csv` names the customer. |

**Revoking reaches only builds made afterwards.** A copy already sent keeps its own key, seal and
revocation list, so it opens with the old licence file for good, or until that file's end date:
nothing Evoke does later can reach it. A reissue that narrows a licence (a computer limit, a new
computer, an earlier end date) therefore needs a new build for the customer
(`npm run new-customer -- --rebuild <new licence>`); `licence:issue` says so when it happens.
`--new-seal` stops the old file opening any build made from now on; it does nothing to the copy
already sent. An end date is the only limit that holds for a copy once it has left Evoke.

## Build

In this folder, with Node 24:

```bash
npm ci
npm run runtime -- --fresh
npm run build-variant -- internal
```

- `npm run runtime` gathers the Node the app ships (it must carry the OpenJS Foundation's valid
  signature) and the browsers at the revisions Playwright pins, and writes a SHA-256 manifest of
  it all. `--fresh` downloads the browsers again rather than copying this computer's cache: use
  it for anything that leaves Evoke. Every browser must match its hash in `runtime-pins.json`
  (committed); after upgrading Playwright, `npm run runtime -- --fresh --pin` records the new
  ones. Packaging refuses a runtime that has changed since.
- **An internal build never leaves Evoke.** It is not sealed, so its course can be decrypted
  without any licence, and it opens with every customer's licence.
- Run `npm ci` (here and at the root) before `npm run package`: the app's own code is bundled from
  `node_modules` as it is. `new-customer.bat` always does.
- `npm run build-variant -- <code>` builds that variant's installer into `deliveries/<code>/`
  (above). Under it, `npm run package -- --variant <code>` builds it into `release/`
  (`<Name-With-Dashes>-Setup-<version>.exe`, and `release/win-unpacked`, which `test:release`
  checks); `--internal` is the internal variant, and `--licence <file>` the variant that licence
  belongs to. Without a code-signing certificate (below) add `--unsigned`.
- The installer's check for a running copy is replaced (`assets/installer.nsh`) so that one
  variant's installer never closes another variant that is open: electron-builder's own matches
  any program whose path merely starts with the install folder. It is a copy of electron-builder
  26.15.3's; packaging stops at any other version until it is compared again.
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
| Clock guard | The day used for expiry is never earlier than the day the licence was issued, the day the app was built, or the latest date of the files in the app's data folder (two folders deep, not the learner's workspaces, where their own code writes). It stops the clock simply being turned back; someone who also edits or re-dates those files can get past it. |
| Encrypted, sealed course | `content.pack`, AES-256-GCM, a new key every build, decrypted in memory only and never cached; a customer's build needs their licence to decrypt it. |
| Locked API | 127.0.0.1 only; answers only the app's window (a new random token every start), and only to its own host name, so neither another program nor a web page can read it. |
| Locked app | No command-line switches in a release (debuggers, proxies, network logs); Electron fuses; DevTools off; nothing leaves the computer; the test report is served apart from the studio; the learner's code gets none of the app's environment. |
| Obfuscated code | The main process, backend and page code are obfuscated; no source maps. |
| Watermarks | The licence ID, in zero-width characters, in every paragraph and list of the lessons (about eight blocks in ten; blocks that are only code or a table carry none), quiz questions, options (unless only code) and explanations, exercise statements and hints, and written answers (a solution that is code carries none, so it can be pasted into the editor), added again as each lesson is served with the licence in use. They travel with copied and pasted text; retyping, screenshots or a deliberate clean-up remove them. The window title names the licensee. |

What it does **not** stop: someone reading lessons on screen and retyping them, screenshots, or a
skilled person spending days extracting the course from a licensed copy running on their own
computer. The watermark traces text copied and pasted out of the app; for screenshots, the window
title shows the licensee. Neither survives a deliberate effort to remove it, and a mark only says
which licence ID it names: someone who knows the scheme could write another customer's ID in.

Two things are on the learner's disk by design: each open day's starting files (the example and
lesson tests the Terminal starts with) are written to their workspace as plain files, since they
edit and run them; and whatever the page shows is, while it shows it, in the app's memory.

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
  modules are refused, that a copy in a folder other accounts can change will not start, and that
  the API refuses everything but the window.

They move the app's data folder aside while they run and put it back after, and refuse to start
while the app is open: `test:app` and `test:customer` build the internal variant
(`%APPDATA%\Evoke Training Studio`), and `test:release` uses the data folder of whichever variant
it checks.

## Before the first external release

- **Back up the signing key** (above).
- **Code signing.** Buy a Windows code-signing certificate. Certificates now live on a hardware
  token or in a cloud service; set whichever applies before `npm run package` or `new-customer.bat`:
  `STUDIO_SIGN_SUBJECT` (the certificate's subject name, for one in Windows' store or on a token),
  `STUDIO_AZURE_ENDPOINT`, `STUDIO_AZURE_ACCOUNT`, `STUDIO_AZURE_PROFILE` and
  `STUDIO_AZURE_PUBLISHER` (Azure Trusted Signing), or `CSC_LINK` and `CSC_KEY_PASSWORD` (a .pfx
  file). With one set, everything is signed with SHA-256 and each file made is checked to be
  validly signed by a certificate named "Evoke Technologies". When the certificate arrives, pin
  its exact name (and ideally its thumbprint) in `scripts/package.ts`. Without one, `package` needs
  `--unsigned`. Unsigned, SmartScreen warns on install.
- **GitHub branch protection** for `main` (Settings → Branches): require a reviewed pull request.
  `collab-push.bat` no longer pushes to `main`, but only GitHub can enforce it.
- **Legal review** of `legal/EULA.txt` (placeholders in brackets) and of the `[REVIEW]` notes in
  the generated `THIRD-PARTY-NOTICES.txt`; confirm in writing that Evoke holds the rights to the
  course content.
- **Test on a clean computer**: a Windows machine or VM with no Node and no internet.
