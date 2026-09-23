---
day: 5
week: 1
title: 'TypeScript I: Your First Program, Variables & Operators'
subtitle: Just enough programming to read Playwright tests — running and checking a file, storing values, simple data types and operators
estimatedTime: 2.5–3 hours
topics:
- JavaScript / TypeScript Fundamentals
- Variables
- Operators
- Data Types (primitives)
objectives:
- Run a TypeScript file with Node.js and type-check it with the TypeScript compiler
- Explain the difference between JavaScript and TypeScript and why Playwright uses TypeScript
- Declare variables with `let` and `const` (and know why to avoid `var`)
- Use string, number, boolean, null and undefined with type annotations and inference
- Use arithmetic, assignment, comparison, logical, ternary and nullish operators correctly
- Read TypeScript error messages and fix type errors
prerequisitesFromEarlierDays:
- 'Day 3–4: the terminal, npm, the pw-course project'
workspace: pw-course/ts-basics/ (you create it today)
---

# Prerequisites

## P1 · What a program is

A **program** is a list of instructions (called **statements**) that the computer runs **from top to bottom**, one after another — exactly like the steps in a test case.

```ts mode=read
console.log('Step 1: open the login page');   // prints a line of text
console.log('Step 2: enter the username');
console.log('Step 3: click Log in');
```

Five rules to know before you write any code:

| Rule | Example |
|---|---|
| **`console.log(…)` prints** something to the console/terminal | `console.log('Hello')` |
| **Text goes in quotes** — single `'…'`, double `"…"` or backticks `` `…` `` | `'Log in'`, `"Log in"` |
| **Comments** are notes for humans; the computer ignores them | `// one line` and `/* several lines */` |
| **Semicolons** `;` end a statement (optional in most cases, but we use them for clarity) | `console.log('Hi');` |
| **Case matters** — `Console.log` is not `console.log` | `userName` ≠ `username` |

> [!WARNING] Straight quotes only
> Copying code from Word, PDFs or chat apps can turn `'` into curly quotes `‘ ’`. Code needs straight quotes. If you see a strange "Invalid character" error, retype the quotes.

## P2 · Set up your TypeScript playground

You'll practise TypeScript in a small separate folder inside your course project, called `ts-basics`. Run these commands from the `pw-course` folder:

```bash terminal
mkdir ts-basics
cd ts-basics
npm init -y
npm pkg set type=module
npm pkg set scripts.check="tsc --noEmit --strict --target esnext --module nodenext --allowImportingTsExtensions --ignoreConfig"
npm install -D typescript
mkdir day5 day6 day7 day8
```

What these do:

| Command | Purpose |
|---|---|
| `npm init -y` | Creates a `package.json` for the playground (`-y` = accept all defaults) |
| `npm pkg set type=module` | Uses modern `import`/`export` syntax (needed on Day 8) |
| `npm pkg set scripts.check=…` | Adds a `check` shortcut that runs the TypeScript **type checker** in strict mode (`--ignoreConfig` makes it check just the file you name, even if a `tsconfig.json` exists higher up) |
| `npm install -D typescript` | Installs the TypeScript compiler (`tsc`) |

From now on, for every `.ts` file you'll do two things:

| You want to… | Command (inside `ts-basics`) |
|---|---|
| **Run** the file and see its output | `node day5/hello.ts` |
| **Check** the file for type errors | `npm run check -- day5/hello.ts` |

> [!NOTE] Why can Node run `.ts` files?
> Modern Node.js (22.18 and newer, 24, 26) can run TypeScript directly: it simply **removes the type annotations** and runs the JavaScript that's left. It does **not** check your types — that's the job of `npm run check` (the TypeScript compiler). On older Node 22 versions, use `node --experimental-strip-types day5/hello.ts`.

Create your first file, `day5/hello.ts`:

```ts file=ts-basics/day5/hello.ts mode=editor run="node day5/hello.ts"
// My first TypeScript program
const course: string = 'Playwright with TypeScript';
console.log('Welcome to ' + course + '!');
```

```bash terminal
node day5/hello.ts
npm run check -- day5/hello.ts
```

```output console
Welcome to Playwright with TypeScript!
```

The `check` command prints nothing when there are **no errors** — silence is success.

## P3 · How to read an error message

Errors are normal. Professionals see dozens a day. Here's one — change `hello.ts` so the course is a number:

```ts file=ts-basics/day5/broken.ts mode=editor expect=error run="npm run check -- day5/broken.ts"
const course: string = 2026;   // a number stored where a string is expected
console.log(course);
```

```bash terminal
npm run check -- day5/broken.ts
```

```output terminal
day5/broken.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'.
```

| Part | Meaning |
|---|---|
| `day5/broken.ts` | The file |
| `(1,7)` | Line 1, character 7 |
| `TS2322` | The error code (searchable online) |
| `Type 'number' is not assignable to type 'string'` | The explanation: you put a number where a string belongs |

> [!TESTER]
> Treat an error message like a bug report: **where** (file, line), **what** (the message), then investigate. Read it slowly — it usually tells you exactly what's wrong.

# Fundamentals

## F1 · JavaScript vs TypeScript

**JavaScript (JS)** is the programming language of the web. Every browser runs it, and Node.js runs it outside the browser. Playwright itself is used from JavaScript/TypeScript.

**TypeScript (TS)** is JavaScript **plus types**. It was created by Microsoft (first released in 2012) and is a **superset** of JavaScript: every valid JavaScript program is also valid TypeScript. TypeScript adds a way to say *what kind of value* each thing holds — text, number, true/false, list… — so mistakes are caught **before** the code runs.

```mermaid
flowchart LR
  TS["your-test.ts<br/>(TypeScript: JS + types)"] -- "type-check<br/>(tsc / VS Code)" --> OK{"errors?"}
  OK -- "no" --> JS["JavaScript<br/>(types removed)"]
  OK -- "yes" --> FIX["fix the code"]
  JS --> RUN["runs in Node.js<br/>or the browser"]
```

### Static vs dynamic typing

JavaScript is **dynamically typed** — a variable can hold a string now and a number later, and nobody complains until something breaks while the program is running. TypeScript is **statically typed** — once a variable is a string it must stay a string, and the editor warns you immediately.

```ts mode=read
// JavaScript: allowed, bug discovered later (maybe in production)
let retries = 'three';
retries = 3;

// TypeScript: the editor flags it instantly
let timeout: number = 30000;
timeout = 'thirty seconds';   // ❌ Type 'string' is not assignable to type 'number'
```

### Why TypeScript for test automation?

| Benefit | What it means for you |
|---|---|
| **Catches mistakes early** | Typos and wrong values are underlined in red *before* you run a 10-minute suite |
| **Autocomplete** | Type `page.` and VS Code lists every Playwright action — `click`, `fill`, `goto`… |
| **Readable** | `function login(user: string, password: string)` documents itself |
| **Default in Playwright** | `npm init playwright@latest` picks TypeScript by default; most Playwright examples are TypeScript |

Drawbacks: a little more to type, and types are one more concept to learn. For test suites that grow to hundreds of tests, the benefits win.

> [!WARNING] Important: Playwright runs TypeScript, but does not type-check it
> When you run `npx playwright test`, Playwright converts your `.ts` files to JavaScript on the fly and runs them — **without** checking types (so your tests start fast). Type errors are shown by **VS Code** (red underlines) and by running `npx tsc --noEmit`. Always fix the red underlines!

### See the compiler in action (optional)

The classic TypeScript workflow is: compile `.ts` → `.js`, then run the `.js`. Try it once:

```bash terminal
npx tsc day5/hello.ts --target esnext --ignoreConfig
node day5/hello.js
```

Open the new `day5/hello.js` — it's the same code **with the `: string` removed**. That's all "compiling" TypeScript mostly does. You can delete `hello.js` afterwards.

```quiz
id: d5-f1-q1
type: single
question: Which statement about TypeScript is TRUE?
options:
  - TypeScript is a completely different language from JavaScript
  - Every valid JavaScript program is also valid TypeScript; TypeScript adds types on top
  - Browsers run TypeScript directly without any conversion
  - TypeScript was created by Google
answer: b
explanation: TypeScript is a superset of JavaScript made by Microsoft. Browsers run JavaScript, so types are removed (compiled away) before code runs.
```

```quiz
id: d5-f1-q2
type: truefalse
question: When you run `npx playwright test`, Playwright stops and refuses to run if your test file has a type error.
answer: false
explanation: Playwright strips the types and runs the JavaScript without type-checking. The type error may still cause a failure at runtime — or silently do the wrong thing. Use VS Code's red underlines or `npx tsc --noEmit` to catch type errors.
```

## F2 · Variables: `let`, `const` (and why not `var`)

A **variable** is a named box that stores a value so you can use it later.

```ts mode=read
const siteUrl = 'https://shop.example.com';   // create a box called siteUrl and put a URL in it
let attempts = 0;                              // a box whose value will change
attempts = attempts + 1;                       // put a new value in the box
```

### The three keywords

| Keyword | Can you change the value later? | Use it when… |
|---|---|---|
| `const` | ❌ No — "constant" | The value should never be replaced (URLs, test data, locators). **Use by default.** |
| `let` | ✅ Yes | The value must change (counters, results that update) |
| `var` | ✅ Yes | **Avoid** — the old way (before 2015). It has confusing scoping rules and lets you redeclare the same name by accident |

```ts file=ts-basics/day5/variables.ts mode=editor run="node day5/variables.ts"
// const: a value that never changes
const baseUrl = 'https://shop.example.com';

// let: a value that will change
let loginAttempts = 0;
loginAttempts = loginAttempts + 1;   // first attempt
loginAttempts = loginAttempts + 1;   // second attempt

console.log('Testing', baseUrl);
console.log('Login attempts:', loginAttempts);

// Uncomment the next line and run `npm run check -- day5/variables.ts`:
// baseUrl = 'https://other.example.com';   // ❌ Cannot assign to 'baseUrl' because it is a constant
```

```output console
Testing https://shop.example.com
Login attempts: 2
```

> [!NOTE]
> `console.log` can print several things separated by commas — it adds a space between them.

### Declaring now, assigning later

```ts mode=read
let testResult: string;       // declared with a type, no value yet
testResult = 'passed';        // assigned later
```

A `const` must get its value immediately: `const x;` is an error.

### Naming rules

| ✅ Allowed | ❌ Not allowed |
|---|---|
| `userName`, `user_name`, `$price`, `_temp`, `test2` | `2test` (can't start with a digit) |
| Letters, digits, `_`, `$` | `user-name` (no hyphens), `user name` (no spaces) |
| | `let`, `const`, `class`, `return` … (reserved words) |

**Convention:** use **camelCase** — first word lowercase, each next word capitalised: `loginButton`, `maxRetryCount`, `isLoggedIn`. Choose names that explain the value: `expectedTitle` beats `t`.

```quiz
id: d5-f2-q1
type: single
question: Which declaration will cause an error?
options:
  - "`let count = 1; count = 2;`"
  - "`const url = 'https://a.com'; url = 'https://b.com';`"
  - "`let name: string; name = 'Asha';`"
  - "`const maxRetries = 3;`"
answer: b
explanation: A `const` cannot be reassigned. Use `let` if the value must change.
```

```quiz
id: d5-f2-q2
type: multiple
question: Which are valid AND follow the camelCase convention? (Select all that apply)
options:
  - "`loginButton`"
  - "`login-button`"
  - "`expectedPageTitle`"
  - "`2ndUser`"
answer: [a, c]
explanation: Hyphens aren't allowed in names, and names can't start with a digit. `loginButton` and `expectedPageTitle` are valid camelCase.
```

## F3 · Primitive data types

A **data type** says what kind of value something is. TypeScript's everyday **primitive** (simple) types:

| Type | Examples | Used in testing for… |
|---|---|---|
| `string` | `'Asha'`, `"Log in"`, `` `Hello ${name}` `` | URLs, usernames, expected text |
| `number` | `42`, `3.14`, `-7`, `30000` | Counts, prices, timeouts (ms) |
| `boolean` | `true`, `false` | Is the checkbox ticked? Did the test pass? |
| `undefined` | `undefined` | "No value has been given yet" |
| `null` | `null` | "Intentionally empty" |

(There are also `bigint` for huge whole numbers and `symbol` for unique ids — you won't need them for testing.)

### Type annotations vs type inference

You can **annotate** a type with `: type` after the name — or let TypeScript **infer** (work out) the type from the value:

```ts mode=read
let username: string = 'asha';   // annotation: explicitly says "string"
let password = 'Secret@123';     // inference: TypeScript sees a string, so password is a string

password = 12345;                // ❌ error — TypeScript inferred string
```

Rule of thumb: when you give a value immediately, inference is enough. Annotate when you declare without a value, and for function parameters (Day 7).

### Strings in detail

```ts file=ts-basics/day5/strings.ts mode=editor run="node day5/strings.ts"
const firstName: string = 'Asha';
const product = "Wireless Mouse";

// Template literal: backticks + ${ } to insert values into text
const greeting = `Hello, ${firstName}! You added ${product} to the cart.`;
console.log(greeting);

// Useful string tools
console.log(product.length);              // number of characters
console.log(product.toUpperCase());       // WIRELESS MOUSE
console.log(product.includes('Mouse'));   // does it contain "Mouse"?
console.log('  padded  '.trim());         // remove spaces at both ends
```

```output console
Hello, Asha! You added Wireless Mouse to the cart.
14
WIRELESS MOUSE
true
padded
```

> [!TIP]
> Template literals (backticks) are everywhere in Playwright tests — for building URLs (`` `${baseUrl}/login` ``) and expected messages (`` `Welcome, ${user}` ``).

### Numbers

TypeScript has **one** number type for whole numbers and decimals. Timeouts in Playwright are numbers in **milliseconds**: `5000` = 5 seconds.

```ts mode=read
const price = 499.99;
const quantity = 2;
const timeoutMs = 30_000;   // underscores make big numbers readable (same as 30000)
```

### null vs undefined

```ts mode=read
let couponCode: string | undefined;   // not set yet → undefined
console.log(couponCode);              // undefined

let middleName: string | null = null; // deliberately "no middle name"
```

`undefined` usually means *"not set (yet)"*; `null` means *"set to nothing on purpose"*. You'll see both when a value may be missing.

### Checking a type at runtime: `typeof`

```ts mode=read
console.log(typeof 'hello');   // "string"
console.log(typeof 42);        // "number"
console.log(typeof true);      // "boolean"
```

```quiz
id: d5-f3-q1
type: single
question: "What does this print? `` const user = 'Ravi'; console.log(`Welcome back, ${user}!`); ``"
options:
  - "`Welcome back, ${user}!`"
  - "`Welcome back, Ravi!`"
  - "`Welcome back, user!`"
  - An error
answer: b
explanation: Inside backticks, `${ }` inserts the value of the expression — here the value of `user`.
```

```quiz
id: d5-f3-q2
type: single
question: "`let isVisible = true;` — what type does TypeScript infer for isVisible?"
options:
  - string
  - number
  - boolean
  - any
answer: c
explanation: "`true` and `false` are boolean values, so TypeScript infers `boolean`."
```

## F4 · Operators

**Operators** are symbols that do something with values: calculate, compare, combine.

### Arithmetic

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` | add (also joins strings) | `5 + 2` | `7` |
| `-` | subtract | `5 - 2` | `3` |
| `*` | multiply | `5 * 2` | `10` |
| `/` | divide | `5 / 2` | `2.5` |
| `%` | remainder (modulo) | `5 % 2` | `1` |
| `**` | power | `5 ** 2` | `25` |

### Assignment and increment

| Operator | Same as |
|---|---|
| `x = 5` | put 5 in x |
| `x += 2` | `x = x + 2` |
| `x -= 2` | `x = x - 2` |
| `x *= 2` | `x = x * 2` |
| `x++` | `x = x + 1` |
| `x--` | `x = x - 1` |

### Comparison — always produce `true` or `false`

| Operator | Meaning |
|---|---|
| `===` | equal (value **and** type) — **use this** |
| `!==` | not equal (value or type) — **use this** |
| `==` / `!=` | "loose" equal / not equal — converts types first. **Avoid** |
| `>` `<` `>=` `<=` | greater, less, greater-or-equal, less-or-equal |

```ts file=ts-basics/day5/comparison.ts mode=editor run="node day5/comparison.ts"
const expectedCount: number = 3;   // e.g. how many items we expect in the cart
const actualCount: number = 3;     // e.g. how many items the page shows
const fromTextBox = '3';           // text from an input box is always a string!

console.log(actualCount === expectedCount);    // same value, same type
console.log(actualCount > 5);
console.log(actualCount !== 0);

// Why we avoid == : it converts types behind your back
console.log(fromTextBox == (actualCount as any));    // loose: '3' becomes 3 → true
console.log(fromTextBox === (actualCount as any));   // strict: string vs number → false
```

```output console
true
false
true
true
false
```

> [!NOTE]
> The `as any` above only exists to let TypeScript compile this deliberately bad comparison. In real code, TypeScript would stop you from comparing a string with a number — one more reason to love it.

### Logical — combine true/false values

| Operator | Name | Result is `true` when… |
|---|---|---|
| `&&` | AND | **both** sides are true |
| `\|\|` | OR | **at least one** side is true |
| `!` | NOT | flips true ↔ false |

```ts mode=read
const isLoggedIn = true;
const hasItemsInCart = false;

console.log(isLoggedIn && hasItemsInCart);   // false — both needed
console.log(isLoggedIn || hasItemsInCart);   // true  — one is enough
console.log(!isLoggedIn);                    // false — flipped
```

### `+` with strings — joining text

```ts mode=read
console.log('Order ' + 1045);   // "Order 1045"  — number is turned into text
console.log(5 + '5');           // "55"          — careful: text wins!
console.log(5 + 5);             // 10
```

### Ternary — a one-line if/else

`condition ? valueIfTrue : valueIfFalse`

```ts mode=read
const failedTests = 0;
const status = failedTests === 0 ? 'PASS' : 'FAIL';   // "PASS"
```

This is exactly what you saw in `playwright.config.ts` on Day 4: `retries: process.env.CI ? 2 : 0`.

### Nullish coalescing `??` and optional chaining `?.`

```ts mode=read
// ?? gives a fallback when the left side is null or undefined
const envUrl: string | undefined = undefined;
const url = envUrl ?? 'http://localhost:3000';   // "http://localhost:3000"

// ?. reads a property only if the object exists (otherwise gives undefined, no crash)
type Order = { coupon?: { code: string } };
const order: Order = {};
console.log(order.coupon?.code);   // undefined — no error
```

### Order of operations

`*` and `/` happen before `+` and `-`, just like in maths: `2 + 3 * 4` is `14`. When in doubt, add parentheses: `(2 + 3) * 4` is `20`.

```quiz
id: d5-f5-q1
type: single
question: "What does `console.log(10 % 3);` print?"
options:
  - "3.33"
  - "3"
  - "1"
  - "30"
answer: c
explanation: "`%` gives the remainder: 10 ÷ 3 = 3 remainder 1."
```

```quiz
id: d5-f5-q2
type: single
question: "What does `console.log('2' + 2);` print?"
options:
  - "4"
  - "22"
  - An error
  - NaN
answer: b
explanation: When one side of `+` is a string, `+` joins text. '2' + 2 becomes '22'.
```

```quiz
id: d5-f5-q3
type: single
question: "`const passed = 8; const total = 10;` — what is `passed === total ? 'All green' : 'Some failed'`?"
options:
  - "'All green'"
  - "'Some failed'"
  - "true"
  - "false"
answer: b
explanation: 8 === 10 is false, so the ternary returns the value after the colon.
```

```quiz
id: d5-f5-q4
type: single
question: Why should you prefer `===` over `==`?
options:
  - "`===` is faster to type"
  - "`===` compares value AND type without converting, so `'5' === 5` is false — no surprises"
  - "`==` doesn't work in TypeScript"
  - They are exactly the same
answer: b
explanation: "`==` converts types before comparing (`'5' == 5` is true), which hides bugs. `===` is strict and predictable."
```

# Implementation

## I1 · Build expected messages with strings

Tests constantly build **expected text**: welcome messages, error messages, URLs. Let's practise with strings, template literals and a few string methods.

```ts file=ts-basics/day5/messages.ts mode=editor run="node day5/messages.ts"
// Test data
const firstName: string = 'Meera';
const lastName: string = 'Iyer';
const email: string = '  Meera.Iyer@Example.com  ';   // typed with extra spaces and capitals
const itemsInCart: number = 3;

// Build the values a test would check
const fullName = `${firstName} ${lastName}`;
const cleanEmail = email.trim().toLowerCase();         // what a good app should store
const welcome = `Welcome back, ${firstName}!`;
const cartLabel = `Cart (${itemsInCart})`;
const profileUrl = `https://shop.example.com/users/${cleanEmail}`;

console.log(welcome);
console.log(cartLabel);
console.log(`Full name has ${fullName.length} characters`);
console.log(`Clean email: ${cleanEmail}`);
console.log(`Profile URL: ${profileUrl}`);
console.log(`Email looks valid: ${cleanEmail.includes('@')}`);
```

```bash terminal
node day5/messages.ts
npm run check -- day5/messages.ts
```

```output console
Welcome back, Meera!
Cart (3)
Full name has 10 characters
Clean email: meera.iyer@example.com
Profile URL: https://shop.example.com/users/meera.iyer@example.com
Email looks valid: true
```

**Try it:** change `itemsInCart` to `0` and make the cart label print `Cart (empty)` when there are no items. (Hint: you'll need the ternary operator from lesson F4: `` itemsInCart === 0 ? 'Cart (empty)' : `Cart (${itemsInCart})` ``.)

## I2 · Calculate test-run metrics

Use arithmetic, comparison, logical and ternary operators to summarise a test run — the kind of numbers you'd put in a test-summary report.

```ts file=ts-basics/day5/metrics.ts mode=editor run="node day5/metrics.ts"
// Results from a test run (typed as number: in real life they come from a report)
const total: number = 48;
const passed: number = 42;
const failed: number = 4;
const skipped = total - passed - failed;       // whatever is left over

// Percentages
const passRate = (passed / total) * 100;       // brackets first, then × 100
const passRateText = passRate.toFixed(1);      // round to 1 decimal place → a string

// Decisions
const allPassed = failed === 0;
const releaseReady = passRate >= 90 && failed <= 5;   // both rules must be true
const status = allPassed ? '✅ GREEN' : '❌ RED';

console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
console.log(`Pass rate: ${passRateText}%`);
console.log(`Status: ${status}`);
console.log(`Ready for release? ${releaseReady}`);
```

```output console
Total: 48 | Passed: 42 | Failed: 4 | Skipped: 2
Pass rate: 87.5%
Status: ❌ RED
Ready for release? false
```

**Try it:** change `passed` to `44` and `failed` to `2`. Predict the four lines *before* you run it.

```quiz
id: d5-i3-q1
type: single
question: With passed = 44, failed = 2, total = 48, what is `releaseReady`? (Pass rate ≈ 91.7%)
options:
  - "true — the pass rate is at least 90 AND failures are at most 5"
  - "false — some tests failed"
  - "true — because failed is not 0"
  - An error
answer: a
explanation: 91.7 >= 90 is true and 2 <= 5 is true; true && true is true.
```

# Practice

## Quiz · Day 5 check

```quiz
id: d5-pr-q1
type: single
question: Which keyword should you use by default for a variable whose value never changes?
options:
  - var
  - let
  - const
  - static
answer: c
explanation: Use `const` by default and switch to `let` only when the value must change. Avoid `var`.
```

```quiz
id: d5-pr-q2
type: single
question: What is the type of `30000` in `const timeout = 30000;`?
options:
  - string
  - number
  - boolean
  - time
answer: b
explanation: It's a number (30,000 milliseconds = 30 seconds).
```

```quiz
id: d5-pr-q3
type: single
question: "What does `console.log(typeof 'false');` print?"
options:
  - boolean
  - string
  - "false"
  - undefined
answer: b
explanation: "'false' is in quotes, so it's a string that happens to contain the word false."
```

```quiz
id: d5-pr-q5
type: single
question: "What does `true && !false` evaluate to?"
options:
  - "true"
  - "false"
  - An error
answer: a
explanation: "`!false` is true, and true && true is true."
```

```quiz
id: d5-pr-q6
type: single
question: "`const port = process.env.PORT ?? '3000';` — if PORT is not set (undefined), what is port?"
options:
  - undefined
  - "'3000'"
  - "null"
  - An empty string
answer: b
explanation: "`??` returns the right-hand fallback when the left side is null or undefined."
```

## Predict the output

````exercise
id: d5-pr-p1
title: Predict — strings and numbers
level: easy
type: predict
prompt: Without running it, write down the four lines this program prints. Then run it to check.
code: |
  const a = 10;
  const b = '10';
  console.log(a + 5);
  console.log(b + 5);
  console.log(a === Number(b));
  console.log(`${a} items`);
answer: |
  15
  105
  true
  10 items

  `b + 5` joins text ('10' + 5 → '105'). `Number(b)` converts the string '10' to the number 10, so the strict comparison is true.
````

````exercise
id: d5-pr-p2
title: Predict — let and const
level: easy
type: predict
prompt: What is printed? Is there any line the type checker would reject?
code: |
  let count = 1;
  count += 4;
  count--;
  const label = count > 3 ? 'many' : 'few';
  console.log(count, label);
answer: |
  `4 many`

  count: 1 → 5 (after `+= 4`) → 4 (after `--`). 4 > 3 is true, so label is 'many'. No errors — `count` uses `let`, so it may change.
````

## Exercises

````exercise
id: d5-ex2
title: Shopping-cart calculator
level: medium
type: code
prompt: |
  Create `day5/cart.ts`. A cart has: unit price **1299**, quantity **3**, discount **10%**, and shipping **99** that is **free when the discounted subtotal is 3000 or more**.

  Calculate and print:
  ```
  Subtotal: 3897
  Discount: 389.7
  After discount: 3507.3
  Shipping: 0
  Total to pay: 3507.30
  ```
  Use `const` for the inputs, arithmetic operators for the maths, a **ternary** for shipping and `toFixed(2)` for the final line.
file: ts-basics/day5/cart.ts
run: node day5/cart.ts
hints:
  - "discount = subtotal × discountPercent / 100"
  - "`const shipping = afterDiscount >= 3000 ? 0 : 99;`"
solution: |
  // Inputs
  const unitPrice = 1299;
  const quantity = 3;
  const discountPercent = 10;

  // Calculations
  const subtotal = unitPrice * quantity;                      // 3897
  const discount = (subtotal * discountPercent) / 100;        // 389.7
  const afterDiscount = subtotal - discount;                  // 3507.3
  const shipping = afterDiscount >= 3000 ? 0 : 99;            // free above 3000
  const totalToPay = afterDiscount + shipping;

  // Output
  console.log(`Subtotal: ${subtotal}`);
  console.log(`Discount: ${discount}`);
  console.log(`After discount: ${afterDiscount}`);
  console.log(`Shipping: ${shipping}`);
  console.log(`Total to pay: ${totalToPay.toFixed(2)}`);
expectedOutput: |
  Subtotal: 3897
  Discount: 389.7
  After discount: 3507.3
  Shipping: 0
  Total to pay: 3507.30
````

````exercise
id: d5-ex4
title: Fix the config-style code
level: medium
type: code
prompt: |
  The file below mimics settings from `playwright.config.ts`, but has **four** type errors. Save it as `day5/settings.ts`, run `npm run check -- day5/settings.ts`, and fix every error so that it checks cleanly and prints:
  ```
  Retries: 0 | Workers: 4 | Headless: true | Base URL: http://localhost:3000
  ```
  (Assume the `isCI` variable is `false`.)
file: ts-basics/day5/settings.ts
run: node day5/settings.ts
starter: |
  const isCI: boolean = 'false';
  const retries: number = isCI ? 2 : '0';
  const workers: number = isCI ? 1 : 4;
  const headless: boolean = 'true';
  let baseURL: string | undefined;
  const finalUrl: number = baseURL ?? 'http://localhost:3000';
  console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${finalUrl}`);
hints:
  - Booleans are written without quotes.
  - Both sides of the ternary should be numbers for `retries`.
  - What type does `baseURL ?? 'http://…'` produce?
solution: |
  const isCI: boolean = false;                              // fix 1: boolean, not text
  const retries: number = isCI ? 2 : 0;                     // fix 2: number on both sides
  const workers: number = isCI ? 1 : 4;
  const headless: boolean = true;                           // fix 3: boolean, not text
  let baseURL: string | undefined;
  const finalUrl: string = baseURL ?? 'http://localhost:3000';   // fix 4: the result is a string
  console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${finalUrl}`);
expectedOutput: |
  Retries: 0 | Workers: 4 | Headless: true | Base URL: http://localhost:3000
````

## Reflection

1. Explain in one sentence the difference between *running* a `.ts` file with Node and *checking* it with `tsc`.
2. When do you choose `let` instead of `const`?
3. Why is `'5' === 5` false, and why is that a good thing?

> [!TIP] Coming up on Day 6
> Lists and records: arrays, tuples and objects — the way you'll store test data — plus union and literal types and why `any` is a trap.
