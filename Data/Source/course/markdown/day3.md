---
day: 3
week: 1
title: Setting Up Your Tools & Project
subtitle: Node.js, the terminal and VS Code in plain words; create a Playwright project with one command and understand every file it makes
estimatedTime: 2.5 hours
topics:
- Installation & Project Setup (Node.js, VS Code)
- The generated project
objectives:
- Explain what Node.js, npm, npx and package.json are, in plain words
- Use basic terminal commands to move around folders
- Install Node.js, VS Code and the Playwright extension on your own computer
- Create a Playwright + TypeScript project with `npm init playwright@latest`
- Describe the purpose of every generated file and folder
- Run the sample tests and open the HTML report
prerequisitesFromEarlierDays:
- 'Day 1–2: headed vs headless, Browser → Context → Page, the three browser projects'
workspace: pw-course/ (you create it today)
---

# Prerequisites

## P1 · Node.js, npm and npx in plain words

Playwright for TypeScript runs on **Node.js**. Three names come as a set:

| Name | Plain-English meaning | Analogy |
|---|---|---|
| **Node.js** | A program that runs JavaScript (and TypeScript) *outside* a browser, on your computer or a server | The engine of a car |
| **npm** (Node Package Manager) | Downloads and manages *packages* — ready-made code other people published. Installed together with Node.js | An app store for code |
| **npx** | Runs a command that comes *inside* a package, without you installing it globally | "Open app" without putting it on your home screen |

A few more words you will see today:

| Name | What it is |
|---|---|
| **package** | A bundle of code published to npm, e.g. `@playwright/test` |
| **`package.json`** | Your project's *ID card and shopping list*: its name, the packages it needs, and handy commands (scripts) |
| **`node_modules/`** | The folder where npm puts the downloaded packages. Big, auto-generated — never edit it, never commit it to Git |
| **`package-lock.json`** | Records the *exact* versions installed, so every teammate gets the same ones |
| **dependency** | A package your project needs. `devDependencies` are needed only while developing/testing |

```quiz
id: d3-p1-q1
type: single
question: You clone a teammate's project. It has package.json but no node_modules folder. What do you run?
options:
  - "`npx playwright test`"
  - "`npm install`"
  - "`node package.json`"
  - Copy node_modules from the teammate's laptop
answer: b
explanation: "`npm install` reads package.json (and package-lock.json) and downloads every dependency into node_modules. node_modules is never shared or committed — it is always re-created."
```

## P2 · Terminal survival kit

The **terminal** (also called command line, shell, console or command prompt) is a text window where you type commands. On this course platform it is the **Terminal** panel; on your computer it is also built into VS Code (**View → Terminal**).

| Task | macOS / Linux / platform terminal | Windows (PowerShell) |
|---|---|---|
| Where am I? | `pwd` | `pwd` |
| List files | `ls` (add `-a` to see hidden files) | `ls` or `dir` |
| Go into a folder | `cd pw-course` | `cd pw-course` |
| Go up one folder | `cd ..` | `cd ..` |
| Create a folder | `mkdir tests` | `mkdir tests` |
| Clear the screen | `clear` | `cls` or `clear` |
| Stop a running command | `Ctrl + C` | `Ctrl + C` |
| Repeat a previous command | `↑` arrow key | `↑` arrow key |
| Auto-complete a name | `Tab` | `Tab` |

> [!TIP]
> Most "command not found" or "no such file" errors mean you are in the **wrong folder**. Run `pwd` to check, then `cd` to the right place.

Try it in the terminal panel:

```bash terminal
pwd
mkdir practice-folder
cd practice-folder
pwd
cd ..
ls
```

```quiz
id: d3-p2-q1
type: single
question: A long-running command is stuck and you want to stop it. What do you press?
options:
  - "`Ctrl + Z`"
  - "`Ctrl + C`"
  - "`Esc`"
  - Close the browser
answer: b
explanation: "`Ctrl + C` stops (interrupts) the running command. You'll use it to close the HTML report server later today."
```

## P3 · VS Code essentials

**Visual Studio Code (VS Code)** is a free code editor from Microsoft and the most common editor for Playwright work. On this platform you already have a built-in editor; on your own computer you'll use VS Code.

The five areas you'll use:

1. **Explorer** (left) — your project's files and folders
2. **Editor** (centre) — where you write code; tabs for open files
3. **Terminal** (bottom, **View → Terminal** or `` Ctrl + ` ``) — runs commands inside your project folder
4. **Extensions** (left bar, the squares icon) — add features such as the Playwright extension
5. **Testing** (left bar, the flask icon) — run and debug tests with a click (after installing the Playwright extension)

> [!TESTER]
> Think of VS Code as your test-management tool, test editor and execution console in one window.

# Fundamentals

## F1 · System requirements

Playwright's official requirements (check [playwright.dev/docs/intro](https://playwright.dev/docs/intro) for the latest):

| Requirement | Supported |
|---|---|
| **Node.js** | Latest **22.x**, **24.x** or **26.x** |
| **Windows** | Windows 11+, Windows Server 2019+, or WSL |
| **macOS** | macOS 14 (Sonoma) or later |
| **Linux** | Debian 12/13, Ubuntu 22.04 / 24.04 / 26.04 (x86-64 or arm64) |

> [!WARNING] Use an even-numbered LTS version of Node.js
> Download the **LTS** ("Long-Term Support") version from [nodejs.org](https://nodejs.org). Very old versions (for example Node 16 or 18) are no longer supported and cause confusing installation errors.

## F2 · Installing the tools on your own computer

> [!NOTE]
> On this course platform everything is already installed — you can skip to **F3** and do the hands-on part in **Implementation**. Follow F2 when you set up your own laptop.

### Step 1 — Install Node.js (npm comes with it)

1. Go to [nodejs.org](https://nodejs.org) and download the **LTS** installer for your operating system
2. Run it and accept the defaults
3. Open a **new** terminal and check:

```bash terminal
node -v
npm -v
```

```output terminal
v24.11.0
11.6.1
```

Your numbers will differ — anything starting with `v22`, `v24` or `v26` for Node is fine.

### Step 2 — Install VS Code

Download it from [code.visualstudio.com](https://code.visualstudio.com), install, and open it.

### Step 3 — Install the Playwright extension

1. Open **Extensions** (`Ctrl + Shift + X` / `Cmd + Shift + X`)
2. Search **Playwright Test for VS Code** — publisher **Microsoft**
3. Click **Install**

The extension adds a **Testing** panel where you can run, debug and record tests with a click, and see green/red icons next to each test in the editor.

```quiz
id: d3-f2-q1
type: single
question: You typed `node -v` and got "command not found". What is the most likely cause?
options:
  - Playwright is not installed
  - Node.js is not installed, or the terminal was opened before installing it
  - The tests folder is missing
  - VS Code needs the Playwright extension
answer: b
explanation: "`node` comes from the Node.js installation. Install Node.js, then open a NEW terminal window so it picks up the updated system path."
```

## F3 · Creating a project: `npm init playwright@latest`

One command creates a complete, working Playwright project:

```bash terminal
npm init playwright@latest
```

What that command means:

- `npm init <something>` → run the project *initializer* package called `create-<something>` — here, `create-playwright`
- `@latest` → use the newest version

It asks four questions (on Linux, a fifth one):

| Prompt | Recommended answer | Why |
|---|---|---|
| Do you want to use TypeScript or JavaScript? | **TypeScript** (default) | This course uses TypeScript |
| Where to put your end-to-end tests? | **tests** (default) | Playwright looks for tests here (becomes `testDir` in the config) |
| Add a GitHub Actions workflow? | **N** for now | Creates a CI file — we'll cover CI later in the course |
| Install Playwright browsers? | **Y** (default) | Downloads Chromium, Firefox and WebKit |
| *(Linux only)* Install Playwright operating system dependencies? | **N** on this platform (already done); **Y** on a fresh Linux machine | Installs system libraries the browsers need — requires `sudo`/root |

Then it:

1. Installs `@playwright/test` (and `@types/node`) into `node_modules/`
2. Creates `playwright.config.ts`, `tests/example.spec.ts` and `.gitignore`
3. Downloads the browser builds (a few hundred MB, only the first time)

### Where do the browsers go?

Not into your project. They go into a shared cache folder so every project on your computer can reuse them:

| OS | Browser cache folder |
|---|---|
| Windows | `%USERPROFILE%\AppData\Local\ms-playwright` |
| macOS | `~/Library/Caches/ms-playwright` |
| Linux | `~/.cache/ms-playwright` |

Useful related commands:

| Command | What it does |
|---|---|
| `npx playwright install` | Download the browsers for the Playwright version in this project |
| `npx playwright install chromium` | Download only Chromium |
| `npx playwright install --with-deps` | Also install the operating-system libraries browsers need (mainly Linux/CI) |
| `npx playwright --version` | Show the installed Playwright version |
| `npm install -D @playwright/test@latest` | Upgrade Playwright in this project (then run `npx playwright install` again) |

> [!TIP]
> You can safely re-run `npm init playwright@latest` in an existing project — for every file that already exists it **asks** before overwriting it (the default answer is No).

```quiz
id: d3-f3-q1
type: single
question: After upgrading Playwright with `npm install -D @playwright/test@latest`, tests fail with "Executable doesn't exist". What should you run?
options:
  - "`npm init playwright@latest` in a new folder"
  - "`npx playwright install`"
  - "`npm uninstall node`"
  - "`npx playwright show-report`"
answer: b
explanation: Each Playwright version needs its matching browser builds. `npx playwright install` downloads them.
```

## F4 · The generated project, file by file

After the installer finishes, your project looks like this:

```text mode=read
pw-course/
├── .gitignore               ← tells Git which files NOT to save
├── package.json             ← project ID card + dependencies + scripts
├── package-lock.json        ← exact installed versions (don't edit by hand)
├── playwright.config.ts     ← THE settings file for all your tests
├── node_modules/            ← downloaded packages (auto-generated, never edit)
└── tests/
    └── example.spec.ts      ← a sample test file with 2 tests
```

After you run tests, two more folders appear:

```text mode=read
├── test-results/            ← raw results: error details, traces, screenshots of failures
└── playwright-report/       ← the HTML report (open with: npx playwright show-report)
```

(If you answered **Y** to GitHub Actions you also get `.github/workflows/playwright.yml`.)

### `package.json`

```json mode=read
{
  "name": "pw-course",
  "version": "1.0.0",
  "scripts": {},
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@types/node": "^26.6.2"
  }
}
```

- `@playwright/test` — Playwright Test itself (the version number on your machine may be newer)
- `@types/node` — type information about Node.js so TypeScript and VS Code can help you
- `^1.63.0` — "version 1.63.0 or any newer 1.x" (the `^` allows minor updates)
- `scripts` — empty for now; you'll add shortcuts in the Implementation part

### `.gitignore`

```text mode=read
# Playwright
node_modules/
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
/playwright/.auth/
```

Everything generated or downloaded is excluded from Git: packages, results and reports can always be re-created.

### Test files: `*.spec.ts`

Playwright finds tests by name: any file in the `testDir` folder (and its sub-folders) ending in **`.spec.ts`** or **`.test.ts`** (also `.js` variants). A file called `tests/login.ts` would be **ignored**.

```quiz
id: d3-f4-q1
type: single
question: You create `tests/checkout.ts` with a test inside, but `npx playwright test` doesn't run it. Why?
options:
  - Test files must be in the project root
  - Test file names must end in `.spec.ts` or `.test.ts`
  - Playwright only runs example.spec.ts
  - You must restart VS Code
answer: b
explanation: Rename it to `tests/checkout.spec.ts` and Playwright will discover it.
```

```quiz
id: d3-f4-q2
type: multiple
question: Which of these should NOT be committed to Git? (Select all that apply)
options:
  - node_modules/
  - playwright.config.ts
  - playwright-report/
  - tests/example.spec.ts
answer: [a, c]
explanation: node_modules and the report are generated automatically and are already in .gitignore. Your config and tests are the valuable source code — always commit them.
```

# Implementation

## I1 · Check your tools

Open the **Terminal** panel and run:

```bash terminal
node -v
npm -v
```

You should see a Node version starting with `v22`, `v24` or `v26`, and an npm version.

## I2 · Create your project

Create a folder for the course and generate a Playwright project inside it:

```bash terminal
mkdir pw-course
cd pw-course
npm init playwright@latest
```

Answer the prompts: **TypeScript**, **tests**, **N** (no GitHub Actions), **Y** (install browsers) and, if asked, **N** for operating-system dependencies (the platform already has them).

```output terminal
Need to install the following packages:
create-playwright@1.17.x
Ok to proceed? (y) y

Getting started with writing end-to-end tests with Playwright:
Initializing project in '.'
✔ Do you want to use TypeScript or JavaScript? · TypeScript
✔ Where to put your end-to-end tests? · tests
✔ Add a GitHub Actions workflow? (y/N) · false
✔ Install Playwright browsers (can be done manually via 'npx playwright install')? (Y/n) · true
✔ Install Playwright operating system dependencies (requires sudo / root …)? (y/N) · false
Initializing NPM project (npm init -y)…
Installing Playwright Test (npm install --save-dev @playwright/test)…
Installing Types (npm install --save-dev @types/node)…
Writing playwright.config.ts.
Writing tests/example.spec.ts.
Writing package.json.
Downloading browsers (npx playwright install)…
✔ Success! Created a Playwright Test project at /home/learner/pw-course
```

(Version numbers and paths will differ.) Confirm the version:

```bash terminal
npx playwright --version
```

> [!WARNING] Linux users on their own machine
> If the browser download finishes but tests later complain about missing libraries, run `npx playwright install --with-deps` (it may ask for your password).

## I3 · Explore what was created

```bash terminal
ls -a
ls tests
```

Open `package.json`, `.gitignore`, `playwright.config.ts` and `tests/example.spec.ts` in the editor and match each one to lesson F4 (the config file gets its own lesson tomorrow, Day 4 · F1).

Now read the sample test. You don't need to understand every symbol yet — Days 5–9 will explain them — but you can already read it like a test case:

```ts file=tests/example.spec.ts mode=read network=true
import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
```

| Line | Reads as |
|---|---|
| `test('has title', …)` | A test case named **has title** |
| `page.goto('https://playwright.dev/')` | Step: open the Playwright website |
| `expect(page).toHaveTitle(/Playwright/)` | Expected: the tab title contains "Playwright" |
| `page.getByRole('link', { name: 'Get started' }).click()` | Step: click the link named "Get started" |
| `expect(…heading 'Installation'…).toBeVisible()` | Expected: a heading "Installation" is visible |

```quiz
id: d3-i3-q1
type: single
question: How many tests are in example.spec.ts, and how many runs will `npx playwright test` report with the default 3 browser projects?
options:
  - 2 tests → 2 runs
  - 2 tests → 6 runs
  - 3 tests → 6 runs
  - 1 test → 3 runs
answer: b
explanation: 2 tests × 3 projects (chromium, firefox, webkit) = 6 runs.
```

## I4 · Your first run

> [!NOTE]
> The example tests open playwright.dev, so they need an internet connection.

```bash terminal
npx playwright test
```

```output terminal
Running 6 tests using 3 workers
  6 passed (6.8s)

To open last HTML report run:

  npx playwright show-report
```

Six green runs: 2 tests × 3 browsers. Everything ran **headless** — no windows opened.

Open the report:

```bash terminal
npx playwright show-report
```

The report opens in the browser pane (it is served at `http://localhost:9323`). Click a test to see its steps and timing. Filter by browser or status at the top.

**When you're done, go back to the terminal and press `Ctrl + C`** to stop the report server — the terminal is blocked until you do.

# Practice

## Quiz · Day 3 check

```quiz
id: d3-pr-q1
type: single
question: Which file lists your project's dependencies and npm scripts?
options:
  - playwright.config.ts
  - package.json
  - .gitignore
  - tests/example.spec.ts
answer: b
explanation: package.json is the project's ID card — name, dependencies (`devDependencies`) and `scripts`.
```

```quiz
id: d3-pr-q2
type: single
question: What is the default folder where Playwright looks for tests in a freshly generated project?
options:
  - "`./src`"
  - "`./tests`"
  - "`./node_modules`"
  - "`./e2e` always"
answer: b
explanation: "`testDir: './tests'` — unless a `tests` folder already existed, in which case the installer suggests `e2e`."
```

```quiz
id: d3-pr-q4
type: single
question: What does `npx playwright show-report` do?
options:
  - Runs tests and prints a report
  - Serves the last HTML report so you can open it in a browser
  - Sends the report by email
  - Deletes old reports
answer: b
explanation: It starts a small local web server (default port 9323) for the playwright-report folder. Press Ctrl + C to stop it.
```

```quiz
id: d3-pr-q5
type: truefalse
question: Playwright's browser binaries are downloaded into your project's node_modules folder.
answer: false
explanation: They go into a shared cache folder (e.g. ~/.cache/ms-playwright on Linux) so all projects on the computer can reuse them.
```

## Exercises

````exercise
id: d3-ex2
title: Troubleshooting desk
level: medium
type: written
prompt: |
  A colleague sends you these problems. What is the most likely cause and fix for each?

  1. `npx: command not found`
  2. `Error: No tests found` — their file is `tests/Login.ts`.
  3. `browserType.launch: Executable doesn't exist at …/ms-playwright/chromium-…` right after upgrading Playwright.
  4. They ran `npm test` in their home folder and got `Missing script: "test"`.
  5. After a failing run, the terminal shows `Serving HTML report at http://localhost:9323. Press Ctrl+C to quit.` and won't accept commands.
modelAnswer: |
  1. Node.js (which includes npm and npx) isn't installed, or the terminal was opened before installing it. Install Node.js LTS and open a new terminal.
  2. Test files must end in `.spec.ts` or `.test.ts`. Rename it to `tests/login.spec.ts`.
  3. The new Playwright version needs matching browser builds. Run `npx playwright install`.
  4. They're in the wrong folder — npm reads the package.json of the current folder. `cd pw-course` first (check with `pwd`).
  5. The HTML reporter opened the report automatically after the failure. Press `Ctrl + C`. (Tomorrow, Day 4 · I1, you'll change one config line so this stops happening.)
````

````exercise
id: d3-ex4
title: Your own copy of the example
level: medium
type: code
prompt: |
  Create `tests/day3/my-first.spec.ts` by **copying** `tests/example.spec.ts`, then change it so that:

  1. The first test is called `docs page has title` and checks that the title contains `Playwright`.
  2. The second test is called `get started opens installation` (same steps as before).
  3. Add a comment above every line describing the step in your own words.

  Run only your new file in Chromium: `npx playwright test tests/day3 --project=chromium`.
file: tests/day3/my-first.spec.ts
run: npx playwright test tests/day3 --project=chromium
network: true
hints:
  - Only the text inside `test('…'` changes for the names.
  - Comments start with `//`.
solution: |
  import { test, expect } from '@playwright/test';

  test('docs page has title', async ({ page }) => {
    // Open the Playwright website
    await page.goto('https://playwright.dev/');
    // Check that the tab title contains the word "Playwright"
    await expect(page).toHaveTitle(/Playwright/);
  });

  test('get started opens installation', async ({ page }) => {
    // Open the Playwright website
    await page.goto('https://playwright.dev/');
    // Click the "Get started" link
    await page.getByRole('link', { name: 'Get started' }).click();
    // Check that the "Installation" heading is visible
    await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  });
````

## Reflection

1. Explain `npm`, `npx` and `package.json` to a teammate in one sentence each.
2. Which files did `npm init playwright@latest` create, and which folder should never be edited or committed?
3. Why must a test file end in `.spec.ts` or `.test.ts`?

> [!TIP] Coming up on Day 4
> The settings file `playwright.config.ts`, every useful command-line option, reading a failing test's error, npm script shortcuts, and the folder structure your framework will grow into.
