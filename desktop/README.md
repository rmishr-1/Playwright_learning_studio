# Desktop app

Packages the studio as a Windows app in two halves:

- **The installer** carries a launcher (the licence, the windows, the security), Electron, and the
  Playwright and TypeScript packages the learner's code runs on. **No course and no studio code**.
  It comes in two kinds:
  - **standard** (the default, about 100 MB): its **first start downloads Node and the browsers**
    (Chromium, Firefox, WebKit: about 530 MB, once) from their official servers, checks every one
    against hashes built into the app, and keeps them in `%LOCALAPPDATA%\<app>\runtime`;
  - **full** (`--full`, about 490 MB): carries Node and the browsers, for a customer whose network
    blocks those downloads.

  Either way the learner's computer needs no Node or Playwright of its own.
- **The course and the studio's code** (its backend and page) are **published** to two public
  GitHub repositories, encrypted and signed (`distribution.json`, `publish-course.bat`,
  `publish-app.bat`). At every start the launcher downloads both, opens them in memory with the
  learner's licence, and runs the studio. Nothing of the course stays on the disk after it closes.

So **the studio needs the internet at every start**; without it, it says so and offers Retry. A
course update or a new feature reaches every installed copy at its next start, with no new
installer; a day that changed shows **Updated** (or **New**) on its card until it is opened, and
the learner's progress and saved work stay with their exercises.

What a customer's IT must allow:

| Address | For | Needed by |
|---|---|---|
| `raw.githubusercontent.com` | the course and the studio's code, every start | every build |
| `nodejs.org` | Node, on the first start | standard |
| `storage.googleapis.com` (`/chrome-for-testing-public/`) | Chromium, Google's Chrome for Testing | standard |
| `playwright.download.prss.microsoft.com` | Firefox, WebKit, ffmpeg, winldd (Microsoft's Playwright CDN) | standard |
| `cdn.playwright.dev` | the same, Playwright's fallback address | standard |

It is built so that copying the course out of it is **slow and traceable**. No packaging can make
copying impossible: everything the app needs to run is on the learner's computer. The aim is that
taking the course out in bulk needs real skill and time, and that a copy that does get out points
to the licence file it came from. Nothing the learner sees makes legal claims: no copyright line,
no trademark, no licence agreement; only the third-party notices the open-source parts require.

## Double-click jobs

**`studio-tools.bat`** opens a window that lists every job here and in the studio folder, by
stage, shows the state of this computer (the signing key, the licences, the apps, what is
published, git) and what to run next, and runs the job you choose in a terminal inside the window
(below). The jobs themselves are these files; each asks for what it needs and waits for a key at
the end:

| File | What it does |
|---|---|
| `studio-tools.bat` | The window above: every job in one place, with the state of this computer. |
| `build-app.bat` | Lists the apps (`variants.json`), asks which to build, whether standard or full, and whether as an installer or a zip, and puts it in `deliveries/<code>/` (a full one in `deliveries/<code>-full/`). Choose "Evoke Training Studio" for the internal app. |
| `new-customer.bat` | A new customer: their short code, licence and app, built (below). |
| `issue-licence.bat` | A new licence for a person or team at Evoke (it opens the internal app), or a reissue of one already issued: a new end date or computer, keeping its ID and, unless changed, its logo. |
| `revoke-licence.bat` | Lists the licences, asks which to revoke and why, and adds it to `revoked.json`. Then commit `revoked.json` and run `publish-access.bat`, choosing new keys. |
| `publish-course.bat` | Builds the course from `Data/Source` and publishes it: every installed studio gets it at its next start. |
| `publish-app.bat` | Builds the studio's code (backend and page) and publishes it: a new feature or fix, with no new installer. Needs the key's passphrase. |
| `publish-access.bat` | Publishes who has access: after a licence is issued or reissued, or (new keys) withdrawn. |
| `make-setup-kit.bat` | Makes `Evoke-Studio-Setup-Kit.exe` on your desktop, to set up another computer (below). |

### The Studio Tools window

`studio-tools.bat` builds the window (`tools/`, esbuild only) and opens it. What it shows:

- **The status strip**: Node, npm and git; whether the packages are installed; the signing key
  (present, passphrase set, public key matching); every licence in `licences/` and whether it opens
  the course; every app in `variants.json` and when it was last built; the course and studio
  releases published from this computer (**Check GitHub** asks GitHub what is live); the git branch
  and what is uncommitted. **Suggested next** says what to do about any of it, and opens the job.
- **The jobs**, by stage: this computer (set up, the key, a setup kit); customers and licences;
  build an installer; publish an update; source code (the studio from source, `git-sync.bat`, the
  collaborator scripts). Each says what it needs, what it produces, and what to run after it.
- **The terminal** the job runs in. It is a real console (ConPTY): the job's questions, `[Y/n]`
  answers and the key's passphrase (typed without echo) all work as they do when double-clicked.
  The form above it fills in what it can (`build-app.bat <code> [--full] [--zip] [--unsigned]`,
  `new-customer.bat --code ... --licensee ...`, `publish-access.bat 1|2` take those arguments now);
  anything left blank is asked in the terminal.

One job at a time: the builds share `build/` and `release/`, and two at once corrupt each other.
**Stop** ends the running job and everything it started. The window keeps its own copy of
Electron in `%LOCALAPPDATA%\EvokeStudioTools` (once per Electron version), so a job's `npm ci`
can refresh `node_modules` while it is open. Nothing of it ships: `test:release` checks that no app
carries `tools/` or node-pty. `git-pull.bat` and `git-push.bat` in the studio folder are older
than `git-sync.bat`, which replaces them; the window does not offer them.

### Another computer

git carries none of what builds and licences need: the signing key, the record of issued licences
(`issued.csv`, `seals.json`) and `desktop/licences/`. On the computer that holds them, run
**`make-setup-kit.bat`**: it puts all of them, encrypted with a passphrase you choose, into
`Evoke-Studio-Setup-Kit.exe` on your desktop. On the other computer, pull the latest studio and run
`setup.bat`, then run the kit: it asks for the studio folder and the passphrase, and sets everything
down there. Nothing already there is overwritten: a key already there is left alone, the records are
merged, and a licence file that differs is set down beside the one there as `.from-kit`. The
restored key asks for the kit's passphrase whenever a licence is issued there.

Send the passphrase another way than the kit (by phone, say), keep the kit off email and git, and
delete it once used: with its passphrase, it issues licences. Licences issued on one computer are
recorded on that computer only, so issue them on one, or bring the records together with a new kit.
A licence locked to one computer opens the app only there: the other computer needs a licence of
its own to open the internal app.

## Publishing the course and the studio

`distribution.json` (committed) names two **public** GitHub repositories, one for the course and
one for the studio's code. They hold only encrypted, signed files, so the app needs no GitHub
account or token; a release cannot be built until both are named. Only the publishing computer
clones them (into `%USERPROFILE%\.evoke-studio\dist\`); learners' computers only read
`https://raw.githubusercontent.com/<owner>/<repo>/main/...`.

```bash
npm run publish -- content          # the course in Data/Content (npm run build:content first)
npm run publish -- app              # the backend and page, built (build.ts buildBundle)
npm run publish -- grants           # access only, for licences issued since
npm run publish -- grants --rekey   # after a withdrawal: new keys
```

Each publish writes `latest.json` (a manifest signed with Evoke's key, naming the release by hash)
and `blobs/<sha256>.bin` (the release, AES-256-GCM), opens what it wrote with the launcher's own
code for every licence it grants, then commits, tags and pushes. `--dry-run` says what it would do;
`--to <folder>` writes to a plain folder; `--no-push` leaves the push to you.

**Who gets access**: every licence in `licences/` with a seal that matches `seals.json`, not
revoked and not expired. Each skipped licence is listed with the reason (`npm run licence:unsealed`
lists them without publishing). A licence's grant opens a release only together with the secret
built into every launcher, so neither the licence file nor the app alone opens anything. A publish
stops if the last release has grants this computer has no seal for (a licence issued on another
computer), unless `--drop-unknown`.

**A new feature** that needs an npm package for the learner's code: add it to `app-setup.json`
(`{ "id", "kind": "package", "name", "version" }`). `publish app` ships its tarball inside the
release; at the next start every launcher checks it and unpacks it into the learner's workspaces,
once. Changes to the launcher itself, Electron, Node, the browsers or the shipped Playwright still
need a new installer: bump `LAUNCHER_API` in `shared/studio-host.ts`, and older launchers keep
their own channel.

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
issued to someone else. It opens nothing until the course is published for the licence: run
`publish-access.bat` after new-customer.bat. Without the licence file nothing it downloads can be
decrypted (a licence without a seal is refused everywhere). Their logo
shows in the header right of the theme switch; it is part of the signed licence, so it cannot be
swapped. The lessons carry the licence ID as an invisible watermark.

If no code-signing certificate is set, the build asks before making an unsigned copy
(`--unsigned` answers yes when it runs without questions).

The same without questions:
`npm run new-customer -- --code BWP --licensee "BWP Group" --logo bwp.png --expires 2027-09-30`

A course update or a new feature needs **no new build**: publish it. A new build for a customer
(a new launcher, Electron or browsers): `npm run build-variant -- <code>`, or
`npm run new-customer -- --rebuild licences/<id>-<customer>.lic`, which finds the variant by the
licence (after a reissue, add `--code <their code>` if the licence file's name changed; a licence
with no variant yet gets one with `--code`).

The standard installer is about 100 MB, almost all of it Electron; its first start downloads about
530 MB of Node and browsers. The full one (`--full`, into `deliveries/<code>-full/`) is about
490 MB and downloads only the course. The launcher itself is about 1.5 MB; the studio's code it
downloads is about 10 MB, the course well under 1 MB.

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
| `... --id EVK-1A2B3C4D` | Reissues a licence (a new expiry, or bound to one computer). Same licensee only; it keeps the seal, and every earlier file is revoked (all of them must still be in `licences/`). Add `--new-seal` when the licence leaked. A withdrawn licence can come back only with `--new-seal`. Then publish access. |
| `npm run licence:revoke -- licences/<file>.lic [--reason withdrawn]` | Withdraws a licence file (`revoked.json`, committed); installed copies refuse it once published with new keys. The reason is a few plain words; a customer's name is refused. |
| `npm run licence:unsealed` | Lists the licences that cannot open the published course, and why. |
| `npm run licence:keygen` | Makes the key pair. Once, ever; it refuses to replace a key. |
| `npm run watermark:find -- copied-text.txt` | Prints the licence ID hidden in copied course text; `issued.csv` names the customer. |

**Revoking reaches installed copies.** Every release lists the licence files Evoke has withdrawn,
and every start downloads the latest release, so a copy refuses a withdrawn or replaced licence
file at its first start after the next publish (`publish-access.bat`). Publishing with new keys
(`--rekey`) also puts everything published from then on under keys the withdrawn file never had.
A reissue that narrows a licence (a computer limit, an earlier end date) reaches every copy the
same way. The same key that signs licences now signs code that runs on every learner's computer:
`publish app` refuses unless the key has a passphrase.

## Build

In this folder, with Node 24:

```bash
npm ci
npm run runtime -- --fresh
npm run build-variant -- internal
```

- `npm run runtime` gathers Node (it must carry the OpenJS Foundation's valid signature) and the
  browsers at the revisions Playwright pins into `runtime/`, from their **official archives**
  (nodejs.org, Chrome for Testing, Playwright's CDN), with the same code a standard build's first
  start uses (`src/runtime-install.ts`), and writes a SHA-256 manifest of it all. The archives are
  kept in `runtime-archives/` (gitignored) and reused when they still match; `--fresh` downloads
  them again: use it for anything that leaves Evoke. Every archive must match its SHA-256 and every
  folder its hash in `runtime-sources.json` and `runtime-pins.json` (both committed); after
  upgrading Playwright or Node, `npm run runtime -- --fresh --pin` records new ones (it pins the
  Node it runs on). Packaging refuses a runtime that has changed since.
- **Standard or full.** `npm run build-variant -- <code>` makes the standard installer: it builds in
  the pins of `runtime-sources.json` and the addresses they may come from, and its first start
  downloads and checks them (`src/runtime-install.ts`, shown in the launch window: "Downloading
  required components (first start only): 210 MB of 530 MB"). Add `--full` for the installer that carries `runtime/`
  itself. Both hold the same files: the full build ships what the standard one downloads. A
  standard copy keeps them in `%LOCALAPPDATA%\<app>\runtime`, which an update keeps and the
  uninstaller removes (`assets/installer.nsh`, `customUnInstall`; `Uninstall.bat` for a zip).
- **An internal build never leaves Evoke.** It opens with every customer's licence.
- A release build needs both repositories named in `distribution.json`, and the app secret, which
  is derived from the signing key (and cached, encrypted for this Windows user, in
  `%USERPROFILE%\.evoke-studio\app-secret.dpapi`): build releases where the key is.
- `npm start` (`build -- --dev`) builds the bundle too and opens it, with the course in
  `../Data/Content`, from this computer: no download, no repositories needed.
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
- While installing, one line under the progress bar names each file as it goes in
  ("Installing <file>..."), then "Completing the installation...". Packaging edits electron-builder's
  unpack macro for this (`patchExtractStatus` in `scripts/package.ts`, in `node_modules`; `npm ci`
  undoes it and the next build applies it again), and `assets/installer.nsh` moves the line
  under the bar. If the macro is not the expected one, packaging stops.
- Every installer and uninstaller message is in formal English: electron-builder's own wording
  (its `messages.yml` and `assistedMessages.yml`) is replaced the same way at build time
  (`patchInstallerMessages`, `INSTALLER_MESSAGES` in `scripts/package.ts`). Nothing the learner
  sees makes legal claims: no copyright line, no trademark, no licence agreement.
- The app's own packages for the learner's code (Playwright, TypeScript) are taken from their npm
  tarballs, checked against `package-lock.json`, not from `node_modules`.
- The installer carries no course: `publish-course.bat` publishes it from `../Data/Content/`.
  The build refuses a `src/licence-public.pem` that does not match the signing key's fingerprint.

## What protects it

| Layer | What it does |
|---|---|
| Licence | Ed25519-signed; optional expiry and one-computer limit; revocation list, in the app and in every release it downloads; re-checked every hour, with ten minutes' notice before the studio closes once a licence has ended; the learner is warned two weeks ahead. |
| Clock guard | The day used for expiry is never earlier than the day the licence was issued, the day the app was built, the day the downloaded release was published, or the latest date of the files in the app's data folder (two folders deep, not the learner's workspaces, where their own code writes). It stops the clock simply being turned back; someone who also edits or re-dates those files can get past it. |
| Nothing installed to copy | The course and the studio's code are not in the installer. They are downloaded at every start from public repositories that hold only encrypted files: AES-256-GCM, a new key for every release, wrapped once per licence with a key that needs **both** the licence's seal and the secret built into the app. Manifests are signed (Ed25519) and name every file by hash; an older manifest is never accepted after a newer one. Decrypted in memory only, never cached; the studio's code is run from memory, after checking, and may load nothing from the disk but Node's own modules. |
| Checked runtime | A standard build's Node and browsers come from their official servers only (an allow-list built into the app; a redirect anywhere else is refused), and each archive must match the SHA-256, and the folder it unpacks to the hash, built into the app before it is used. A piece that fails is deleted. The folder they are kept in must be the learner's own: a release refuses to start if other accounts can change it. |
| Checked program files | At every start (`src/integrity.ts`, about 1.5 s): the packages the learner's code runs on (`app.asar.unpacked`) against the SHA-256 of each file in app.asar's header, which Electron checks against the hash built into the program; Node and the browsers against `runtime-files.json` in app.asar (every file at its size, every program up to 100 MB by its SHA-256, and no file added beside them but logs). A changed file stops a release ("modified or damaged"); in a standard build, a changed Node or browser is downloaded and checked again. It catches files changed or planted after installing, not a learner who also rewrites the program: until the program is code-signed, its hash of app.asar can be rewritten too. |
| Wiped at quit | At quit (and at the next start, after a crash) the Terminal's starting files the learner has not changed, the test report and the Run folders leave the disk. Progress, the learner's own files and the licence stay. |
| Locked API | 127.0.0.1 only; answers only the app's window (a new random token every start), and only to its own host name, so neither another program nor a web page can read it. |
| Locked app | No command-line switches in a release (debuggers, proxies, network logs); Electron fuses; DevTools off; nothing leaves the computer; the test report is served apart from the studio; the learner's code gets none of the app's environment. |
| Obfuscated code | The main process, backend and page code are obfuscated; no source maps. |
| Watermarks | The licence ID, in zero-width characters, in every paragraph and list of the lessons (about eight blocks in ten; blocks that are only code or a table carry none), quiz questions, options (unless only code) and explanations, exercise statements and hints, and written answers (a solution that is code carries none, so it can be pasted into the editor), added again as each lesson is served with the licence in use. They travel with copied and pasted text; retyping, screenshots or a deliberate clean-up remove them. The About box (F1) names the licensee; the window's title bar is blank. |

What it does **not** stop: someone reading lessons on screen and retyping them, screenshots, or a
skilled person spending days extracting the course from a licensed copy running on their own
computer. The watermark traces text copied and pasted out of the app; for screenshots, the window
title shows the licensee. Neither survives a deliberate effort to remove it, and a mark only says
which licence ID it names: someone who knows the scheme could write another customer's ID in.

While the studio is open, two things are on the learner's disk by design: each open day's starting
files (the example and lesson tests the Terminal starts with) are written to their workspace as
plain files, since they edit and run them (those they have not changed leave at quit); and whatever
the page shows is, while it shows it, in the app's memory. Files the learner changed are theirs and
stay. Windows' page file and crash dumps are beyond the app's reach.

## Tests

The tests use a throwaway key pair of their own; Evoke's signing key is never touched by one.

```bash
npm run test:publish
npm run test:runtime
npm run test:distribution
npm run test:app
npm run test:customer
npm run package -- --internal --unsigned
npm run test:release -- licences/<a licence the build accepts>.lic
```

- `test:publish` (plain Node, seconds): the release format and the publisher. Who gets a grant,
  that neither the licence nor the app alone opens a release, tampering, wrong kinds and keys,
  grants-only publishes, `--rekey`, the launcher's download order (offline, withdrawn, a stale
  manifest, a course needing a newer app), the clean-up, the bundle's module guard and the
  package unpacker.
- `test:distribution` builds the app with no course in it, publishes the course and the studio's
  code with the real publisher to a stand-in for GitHub (`tests/fake-raw.ts`), and drives it as
  installed: a start opens the studio, no internet then Retry, GitHub busy, a damaged download, a
  licence with no access, a course update tagging the changed day, a licence withdrawn by a
  release, a course needing a newer studio, and no course text left on disk after quitting. Then a
  standard build, with no Node or browsers in it: a damaged runtime download is refused, Retry
  downloads the official archives (served from `runtime-archives/`) with its progress shown, the
  Terminal's Node and all three browsers run, and the next start downloads nothing.
- `test:runtime` (plain Node, seconds): the runtime installer against small zips made with
  Windows' `tar.exe`: install, mirrors, a wrong archive or a wrong unpacked folder refused with
  nothing left behind, too little disk space, a damaged piece downloaded again alone, and an
  unpinned old browser removed.
- `test:app` builds the app (obfuscated like a release) and drives it laid out as installed
  (packed, with the release's fuses, `tests/packed.ts`): every licence case, the clock guard, that
  no agreement is shown, the locked API, no caching, the page's Content Security Policy, offline, watermarks,
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

- **Create the two public repositories** on GitHub (empty), name them in `distribution.json`,
  then `publish-app.bat` and `publish-course.bat`. Tell customers' IT which addresses to allow
  (the table at the top; `READ ME FIRST.txt` lists them too), or send the full installer.
- **Back up the signing key** (above), and give it a passphrase: it now signs the studio's code.
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
- **Legal review** of the `[REVIEW]` notes in the generated `THIRD-PARTY-NOTICES.txt`; confirm in
  writing that Evoke holds the rights to the course content. (The draft licence agreement was
  withdrawn: no agreement ships. It is in git history, `desktop/legal/EULA.txt`, if wanted later.)
- **Test on a clean computer**: a Windows machine or VM with no Node, online (and once offline, to
  see the studio refuse to start and say why).
