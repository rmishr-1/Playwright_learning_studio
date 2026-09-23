---
day: 6
week: 2
title: 'TypeScript I: Arrays, Objects & Types for Test Data'
subtitle: Lists and records — how you'll store test data — plus union and literal types and the `any` trap
estimatedTime: 2.5 hours
topics:
- Data Types (arrays, tuples, objects)
- Type aliases
- Union & literal types
objectives:
- Store lists in arrays and tuples and read items by index
- Describe objects with type aliases, including optional properties
- Use union and literal types, and explain why `any` should be avoided
- Find and fix type errors in test-data code
prerequisitesFromEarlierDays:
- 'Day 5: let/const, primitive types, template literals, operators, the ts-basics playground'
workspace: pw-course/ts-basics/day6/
---

# Prerequisites

## P1 · Quick recap from Day 5

Three quick checks from Day 5 before we add lists and records:

```quiz
id: d6-p1-q1
type: single
question: "What does `console.log(`${2 + 3} items`);` print?"
options:
  - "${2 + 3} items"
  - "5 items"
  - "23 items"
answer: b
explanation: "Inside backticks, `${ }` evaluates the expression: 2 + 3 = 5."
```

```quiz
id: d6-p1-q2
type: single
question: "Which line does the type checker reject? `const a = 1; let b = 'x';`"
options:
  - "`a = 2;`"
  - "`b = 'y';`"
  - Neither
answer: a
explanation: "`a` is a const and cannot be reassigned. `b` is a let holding a string, so 'y' is fine."
```

```quiz
id: d6-p1-q3
type: single
question: "`const ok = 10 % 3 === 1 && !false;` — what is ok?"
options:
  - "true"
  - "false"
answer: a
explanation: "10 % 3 is 1, so the comparison is true; !false is true; true && true is true."
```

# Fundamentals

## F1 · Arrays and tuples

### Arrays — ordered lists

```ts file=ts-basics/day6/arrays.ts mode=editor run="node day6/arrays.ts"
// An array of strings. Two ways to write the type: string[] or Array<string>
const browsers: string[] = ['chromium', 'firefox', 'webkit'];

console.log(browsers[0]);        // first item — counting starts at 0!
console.log(browsers[2]);        // third item
console.log(browsers.length);    // how many items

browsers.push('msedge');         // add an item at the end
console.log(browsers);
console.log(browsers.includes('firefox'));   // is "firefox" in the list?

const retryDelays: number[] = [1000, 2000, 4000];
console.log(retryDelays[1]);
```

```output console
chromium
webkit
3
[ 'chromium', 'firefox', 'webkit', 'msedge' ]
true
2000
```

> [!NOTE]
> `browsers` is a `const`, yet we could `push` into it. `const` means *the box can't be replaced with a different array* — the contents of the array can still change.

### Tuples — fixed-length lists with a type per position

```ts mode=read
// [username, password] — always exactly a string then a string
const credentials: [string, string] = ['asha@example.com', 'Secret@123'];

// [product name, price, in stock?]
const item: [string, number, boolean] = ['Keyboard', 1499, true];
item[1] = 'free';   // ❌ error — position 1 must be a number
```

```quiz
id: d6-f4-q1
type: single
question: "`const cities = ['Delhi', 'Kolkata', 'Hyderabad'];` — what is `cities[1]`?"
options:
  - "'Delhi'"
  - "'Kolkata'"
  - "'Hyderabad'"
  - undefined
answer: b
explanation: Array positions (indexes) start at 0. Index 0 is 'Delhi', index 1 is 'Kolkata'.
```

## F2 · Objects — records with named properties

### Objects — named properties

Objects group related values under **property names** — perfect for test data:

```ts file=ts-basics/day6/objects.ts mode=editor run="node day6/objects.ts"
// A type alias describes the shape of an object once, so we can reuse it
type User = {
  name: string;
  email: string;
  age: number;
  isAdmin: boolean;
  phone?: string;          // ? = optional property (may be missing)
};

const testUser: User = {
  name: 'Asha Verma',
  email: 'asha@example.com',
  age: 29,
  isAdmin: false,
};

console.log(testUser.name);        // read a property with a dot
console.log(testUser['email']);    // or with square brackets
testUser.age = 30;                 // change a property
console.log(testUser);
console.log(testUser.phone);       // optional and not set → undefined
```

```output console
Asha Verma
asha@example.com
{
  name: 'Asha Verma',
  email: 'asha@example.com',
  age: 30,
  isAdmin: false
}
undefined
```

If you forget a required property or use the wrong type, the checker complains:

```ts mode=read
const badUser: User = { name: 'Ravi', email: 'ravi@example.com', age: '31' };
// ❌ Type 'string' is not assignable to type 'number'   (age)
// ❌ Property 'isAdmin' is missing
```

> [!TESTER]
> Objects are how you'll store **test data**: one object per user, product or form submission — just like a row in your test-data spreadsheet, with named columns.

```quiz
id: d6-f4-q3
type: single
question: "In `type Product = { name: string; price: number; discount?: number };`, what does the `?` mean?"
options:
  - discount must be a question
  - discount is optional — an object may leave it out
  - discount can be any type
  - discount is required
answer: b
explanation: A `?` after a property name makes it optional. If it's missing, reading it gives `undefined`.
```

## F3 · Union, literal and special types

### Union types — "this OR that"

```ts mode=read
let orderId: string | number;   // may be a string or a number
orderId = 1045;                 // ✅
orderId = 'ORD-1045';           // ✅
orderId = true;                 // ❌ boolean is not allowed
```

### Literal types — only these exact values

```ts mode=read
type BrowserName = 'chromium' | 'firefox' | 'webkit';

let target: BrowserName = 'firefox';   // ✅
target = 'safari';                     // ❌ '"safari"' is not assignable to type 'BrowserName'
```

Playwright uses literal types a lot — for example `browserName` is typed as `'chromium' | 'firefox' | 'webkit'`, so VS Code can autocomplete and catch typos.

### `any` and `unknown` — escape hatches

| Type | Meaning | Advice |
|---|---|---|
| `any` | "Turn off type checking for this value" — anything goes | **Avoid.** It hides bugs — it turns TypeScript back into plain JavaScript |
| `unknown` | "Could be anything — check before using it" | Safer when you truly don't know the type (e.g. data from a file) |

```quiz
id: d6-f4-q2
type: single
question: "Given `type Status = 'passed' | 'failed' | 'skipped';`, which assignment causes a type error?"
options:
  - "`let s: Status = 'passed';`"
  - "`let s: Status = 'skipped';`"
  - "`let s: Status = 'flaky';`"
  - "`let s: Status = 'failed';`"
answer: c
explanation: A literal-union type only accepts the exact listed values. 'flaky' isn't one of them.
```

# Implementation

## I1 · Build a test-data profile

You'll store test data for a registration test and print a summary — using `const`, an object type, template literals and string tools.

```ts file=ts-basics/day6/test-data.ts mode=editor run="node day6/test-data.ts"
// Describe the shape of our test data once
type RegistrationData = {
  fullName: string;
  email: string;
  age: number;
  country: string;
  acceptsTerms: boolean;
};

// One test-data record (like one row in a test-data sheet)
const newCustomer: RegistrationData = {
  fullName: 'Meera Iyer',
  email: 'meera.iyer@example.com',
  age: 27,
  country: 'India',
  acceptsTerms: true,
};

// Build some values from the data
const firstName = newCustomer.fullName.split(' ')[0];   // split the name at the space, take the first part
const expectedWelcome = `Welcome, ${firstName}!`;

// Print a readable summary
console.log('--- Test data: new customer ---');
console.log(`Name:    ${newCustomer.fullName}`);
console.log(`Email:   ${newCustomer.email}`);
console.log(`Adult:   ${newCustomer.age >= 18}`);
console.log(`Terms:   ${newCustomer.acceptsTerms ? 'accepted' : 'NOT accepted'}`);
console.log(`Expected message after sign-up: "${expectedWelcome}"`);
```

```bash terminal
node day6/test-data.ts
npm run check -- day6/test-data.ts
```

```output console
--- Test data: new customer ---
Name:    Meera Iyer
Email:   meera.iyer@example.com
Adult:   true
Terms:   accepted
Expected message after sign-up: "Welcome, Meera!"
```

**Try it:** change `age` to `'27'` (in quotes) and run `npm run check -- day6/test-data.ts`. Read the error, then change it back.

## I2 · Type detective — find and fix 5 bugs

This file has **five** type errors (it uses the operators from Day 5). Don't run it yet — first **check** it:

```ts file=ts-basics/day6/detective.ts mode=editor expect=error run="npm run check -- day6/detective.ts"
type Product = {
  name: string;
  price: number;
  inStock: boolean;
};

const keyboard: Product = {
  name: 'Mechanical Keyboard',
  price: '2499',            // bug 1
  inStock: 'yes',           // bug 2
};

const quantity: number = 2;
const maxQuantity = 5;
maxQuantity = 10;           // bug 3

let browser: 'chromium' | 'firefox' | 'webkit' = 'chrome';   // bug 4

const total: string = keyboard.price * quantity;             // bug 5
console.log(`Total for ${quantity}: ${total}`);
```

```bash terminal
npm run check -- day6/detective.ts
```

```output terminal
day6/detective.ts(9,3): error TS2322: Type 'string' is not assignable to type 'number'.
day6/detective.ts(10,3): error TS2322: Type 'string' is not assignable to type 'boolean'.
day6/detective.ts(15,1): error TS2588: Cannot assign to 'maxQuantity' because it is a constant.
day6/detective.ts(17,5): error TS2322: Type '"chrome"' is not assignable to type '"chromium" | "firefox" | "webkit"'.
day6/detective.ts(19,7): error TS2322: Type 'number' is not assignable to type 'string'.
```

Fix each line, then check again until the command prints nothing, and finally run it:

```ts file=ts-basics/day6/detective-fixed.ts mode=editor run="node day6/detective-fixed.ts"
type Product = {
  name: string;
  price: number;
  inStock: boolean;
};

const keyboard: Product = {
  name: 'Mechanical Keyboard',
  price: 2499,              // fix 1: a number, not text
  inStock: true,            // fix 2: a boolean
};

const quantity: number = 2;
let maxQuantity = 5;        // fix 3: let, because it changes
maxQuantity = 10;

let browser: 'chromium' | 'firefox' | 'webkit' = 'chromium';   // fix 4: an allowed value

const total: number = keyboard.price * quantity;               // fix 5: the result is a number
console.log(`Total for ${quantity}: ${total}`);
console.log(`Max quantity: ${maxQuantity}, browser: ${browser}`);
```

```output console
Total for 2: 4998
Max quantity: 10, browser: chromium
```

## I3 · Arrays, tuples and literal types for a test matrix

```ts file=ts-basics/day6/matrix.ts mode=editor run="node day6/matrix.ts"
// Only these three browser names are allowed
type BrowserName = 'chromium' | 'firefox' | 'webkit';

// The browsers we test on
const browsers: BrowserName[] = ['chromium', 'firefox'];
browsers.push('webkit');                        // add one more

// Login credentials as a tuple: [email, password]
const validLogin: [string, string] = ['asha@example.com', 'Secret@123'];
const [email, password] = validLogin;          // unpack the tuple into two variables

// Pages to check
const pagesToCheck: string[] = ['/home', '/products', '/cart'];

const runsNeeded = browsers.length * pagesToCheck.length;

console.log(`Browsers: ${browsers.join(', ')}`);
console.log(`Logging in as ${email} (password has ${password.length} characters)`);
console.log(`First page: ${pagesToCheck[0]}, last page: ${pagesToCheck[pagesToCheck.length - 1]}`);
console.log(`Total page checks: ${runsNeeded}`);
```

```output console
Browsers: chromium, firefox, webkit
Logging in as asha@example.com (password has 10 characters)
First page: /home, last page: /cart
Total page checks: 9
```

> [!TIP]
> `const [email, password] = validLogin;` is called **destructuring** — unpacking values into separate variables. You'll meet its object version, `{ page }`, on Day 8 and then in every Playwright test.

**Try it:** add `browsers.push('safari');` and run the checker. Why does it complain?

# Practice

## Quiz · Day 6 check

```quiz
id: d6-pr-q4
type: single
question: "`const tags = ['@smoke', '@regression'];` — what is `tags.length`?"
options:
  - "1"
  - "2"
  - "3"
  - "0"
answer: b
explanation: The array has two items. (The last index is 1, but the length is 2.)
```

```quiz
id: d6-pr-q7
type: multiple
question: Which of these are TypeScript-only features (they don't exist in plain JavaScript)? (Select all that apply)
options:
  - "Type annotations like `: string`"
  - "`const` and `let`"
  - "Type aliases like `type User = { … }`"
  - "Template literals with backticks"
answer: [a, c]
explanation: "`const`, `let` and template literals are modern JavaScript. Type annotations and type aliases are what TypeScript adds — and they're removed when the code runs."
```

```quiz
id: d6-pr-q8
type: single
question: Why is using `any` everywhere a bad idea?
options:
  - It makes the program run slower
  - It switches off type checking for those values, so TypeScript can no longer catch mistakes
  - It isn't allowed in Playwright
  - It turns numbers into strings
answer: b
explanation: "`any` tells TypeScript to trust you blindly — you lose the main benefit of TypeScript."
```

## Predict the output

````exercise
id: d6-pr-p3
title: Predict — arrays and objects
level: medium
type: predict
prompt: What is printed?
code: |
  const results = ['pass', 'fail', 'pass'];
  const summary = { suite: 'Checkout', total: results.length };
  results.push('skip');
  console.log(results.length, summary.total, results[results.length - 1]);
answer: |
  `4 3 skip`

  `summary.total` stored the length (3) at the moment the object was created; pushing later doesn't change it. The array now has 4 items and the last one is 'skip'.
````

## Exercises

````exercise
id: d6-ex1
title: Tester profile card
level: easy
type: code
prompt: |
  Create `day6/profile.ts`. Declare **constants** for your name (string), years of testing experience (number), favourite browser (only `'chromium' | 'firefox' | 'webkit'` allowed) and whether you have used automation before (boolean).

  Print exactly this format using **one template literal per line** (with your own values):

  ```
  Tester: Priya Sharma
  Experience: 3 years
  Favourite browser: firefox
  Automation before: false
  ```
file: ts-basics/day6/profile.ts
run: node day6/profile.ts
starter: |
  // 1. Declare your constants here (with types)

  // 2. Print the four lines with template literals
hints:
  - "A literal type looks like: `const favouriteBrowser: 'chromium' | 'firefox' | 'webkit' = 'firefox';`"
  - "A template literal: `` console.log(`Tester: ${testerName}`); ``"
solution: |
  // 1. Constants with types
  const testerName: string = 'Priya Sharma';
  const yearsOfExperience: number = 3;
  const favouriteBrowser: 'chromium' | 'firefox' | 'webkit' = 'firefox';
  const usedAutomation: boolean = false;

  // 2. Print with template literals
  console.log(`Tester: ${testerName}`);
  console.log(`Experience: ${yearsOfExperience} years`);
  console.log(`Favourite browser: ${favouriteBrowser}`);
  console.log(`Automation before: ${usedAutomation}`);
expectedOutput: |
  Tester: Priya Sharma
  Experience: 3 years
  Favourite browser: firefox
  Automation before: false
````

````exercise
id: d6-ex3
title: Test-data object with a type alias
level: medium
type: code
prompt: |
  Create `day6/login-data.ts`:

  1. Define a type alias `LoginCase` with: `id` (string), `username` (string), `password` (string), `shouldSucceed` (boolean) and an **optional** `expectedError` (string).
  2. Create two constants of that type:
     - `validCase`: id `TC-01`, username `standard_user`, password `secret_sauce`, shouldSucceed `true`
     - `lockedCase`: id `TC-02`, username `locked_out_user`, password `secret_sauce`, shouldSucceed `false`, expectedError `Sorry, this user has been locked out.`
  3. Put both in an array `loginCases` typed `LoginCase[]` and print:
  ```
  2 login cases
  TC-01 standard_user expects success: true
  TC-02 locked_out_user expects error: Sorry, this user has been locked out.
  ```
  Run `npm run check -- day6/login-data.ts` — it must print nothing.
file: ts-basics/day6/login-data.ts
run: node day6/login-data.ts
hints:
  - "Optional property: `expectedError?: string;`"
  - "Access items with `loginCases[0]` and `loginCases[1]`."
solution: |
  // The shape of one login test case
  type LoginCase = {
    id: string;
    username: string;
    password: string;
    shouldSucceed: boolean;
    expectedError?: string;   // only needed for failing cases
  };

  const validCase: LoginCase = {
    id: 'TC-01',
    username: 'standard_user',
    password: 'secret_sauce',
    shouldSucceed: true,
  };

  const lockedCase: LoginCase = {
    id: 'TC-02',
    username: 'locked_out_user',
    password: 'secret_sauce',
    shouldSucceed: false,
    expectedError: 'Sorry, this user has been locked out.',
  };

  const loginCases: LoginCase[] = [validCase, lockedCase];

  console.log(`${loginCases.length} login cases`);
  console.log(`${loginCases[0].id} ${loginCases[0].username} expects success: ${loginCases[0].shouldSucceed}`);
  console.log(`${loginCases[1].id} ${loginCases[1].username} expects error: ${loginCases[1].expectedError}`);
expectedOutput: |
  2 login cases
  TC-01 standard_user expects success: true
  TC-02 locked_out_user expects error: Sorry, this user has been locked out.
````

````exercise
id: d6-ex5
title: "Challenge: build a URL and a test title"
level: challenge
type: code
prompt: |
  Create `day6/url-builder.ts`. Given:
  ```ts
  const baseUrl = 'https://shop.example.com';
  const category = 'Laptops & Tablets';
  const page = 2;
  const sortBy: 'price' | 'rating' = 'price';
  ```
  1. Turn the category into a URL-friendly **slug**: lowercase, `&` removed, spaces replaced by `-`, no double dashes → `laptops-tablets`. (Use `toLowerCase()`, `replace('&', '')`, `split(' ')`, `filter(...)` and `join('-')` — or research your own way.)
  2. Build: `https://shop.example.com/c/laptops-tablets?page=2&sort=price`
  3. Build a test title: `[P2] Laptops & Tablets sorted by price` — `P2` comes from the page number.
  4. Print both lines, the URL first.
file: ts-basics/day6/url-builder.ts
run: node day6/url-builder.ts
hints:
  - "'Laptops & Tablets'.toLowerCase() → 'laptops & tablets'"
  - ".replace('&', '') → 'laptops  tablets' (two spaces!)"
  - ".split(' ') → ['laptops', '', 'tablets'] — filter out the empty string with `.filter((word) => word !== '')`"
solution: |
  const baseUrl = 'https://shop.example.com';
  const category = 'Laptops & Tablets';
  const page = 2;
  const sortBy: 'price' | 'rating' = 'price';

  // 1. Make a slug: lowercase → remove & → split into words → drop empty words → join with -
  const slug = category
    .toLowerCase()
    .replace('&', '')
    .split(' ')
    .filter((word) => word !== '')
    .join('-');

  // 2. Build the URL with a template literal
  const url = `${baseUrl}/c/${slug}?page=${page}&sort=${sortBy}`;

  // 3. Build the test title
  const title = `[P${page}] ${category} sorted by ${sortBy}`;

  // 4. Print
  console.log(url);
  console.log(title);
expectedOutput: |
  https://shop.example.com/c/laptops-tablets?page=2&sort=price
  [P2] Laptops & Tablets sorted by price
````

## Reflection

1. Give one example each of an array, a tuple and an object you'd use as test data.
2. What is the difference between `string | number` and `'chromium' | 'firefox'`?
3. Why is `any` a bad habit?

> [!TIP] Coming up on Day 7
> Conditions, loops and functions: your code starts making decisions, repeating work and packaging steps you can reuse — like reusable test steps.
