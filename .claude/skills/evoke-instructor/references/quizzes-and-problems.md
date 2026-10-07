# Quizzes, problems and exercises

## Quizzes

````markdown
```quiz
id: d6-f2-q1
type: single
question: "`let coupon: string | undefined;` — what does `console.log(coupon ?? 'none')` print?"
options:
  - "undefined"
  - "none"
  - "null"
  - Nothing; it is a type error
answer: b
explanation: "`coupon` was never given a value, so it's `undefined`, and `??` uses the fallback."
```
````

### Fields

| Field | Rule |
|---|---|
| `id` | `d{day}-{part}-q{n}`: part is `p1`, `f3`, `i6`, or `pr` for the Practice quiz. Unique within the day; number in order. |
| `type` | `single` (`answer: b`), `multiple` (`answer: [a, c]`, question ends "(Select all that apply)"), or `truefalse` (no options; `answer: true`). Week 2 uses only single and multiple. |
| `options` | Usually **4**; 3 when the domain has only 3 (three engines, three layers). 2–8 allowed. No letters in the text. |
| `answer` | Letters by the authored position. Options are **shuffled at build time** (seeded by id), so the correct answer may be written in any position. |
| `explanation` | 1–3 sentences. **Never mention option letters.** |
| `shuffle: false` | Only for ordered options such as "All of the above". |

### How many and where

- Prerequisites: 1–2 at the end of P1 (recap) and 1 scenario quiz in P2.
- Fundamentals: 1–3 at the **end** of each part.
- Implementation: rarely; at most 1 in a part.
- Practice `## Quiz · Day N check`: about 8 (10 on Days 1–2), covering the whole day in order.
- A day totals about 20–30 quizzes.

### Question styles (mix them)

- **Scenario:** "Your team releases every two weeks… which…?", "A colleague says…", "A cookie banner covers the button. What happens?"
- **Predict a value:** "What is `cities[1]`?", "`10 % 3`?", "How many times does the loop print?"
- **Read the output or log:** "What does `[chromium]` tell you?"; diagnose from an `Expected`/`Received` pair.
- **Spot the error:** "Which line causes a type error?"
- **Choose the tool:** "Which locator is best?", "Which file does this belong in?"
- **Order the steps:** "4 → 2 → 3 → 1".
- **Count:** tests × projects = runs.

Use capitals only to stress a contrast the question turns on: "SAME context", "NOT".

### Distractors

Build every wrong option from a real beginner mistake:

- The neighbouring concept: `find` vs `filter` vs `map`; `test.skip` vs `fixme` vs `fail`; `null` vs `undefined`.
- The typical error: off-by-one, `==` instead of `===`, single quotes around `${…}`, `.fill` on a `<select>`, a missing `await`, `for...in` giving `'0'`.
- The wrong layer: the browser vs the Playwright server.
- The over-generalisation: "Playwright deletes every cookie on your computer".
- A plausible wrong number.

At most one obviously wrong option. Keep options parallel in grammar and similar in length; the correct one must not be the longest.

### Explanations

State why the answer is right, then why the tempting option is wrong:

> `toHaveText` with a string needs the whole text; `toContainText` accepts a part — but case still matters.

> (`find` would give just the first, 404; `map` would give the true/false list.)

Show arithmetic: "5 × 4 = 20". Point forward when useful: "you'll see how Playwright does this on Day 2".

## Practice problems before the exercises

| Heading | Item | Use |
|---|---|---|
| `## Predict the output` | `type: predict`, id `d{day}-pr-p{n}` | TypeScript days: 3–4 items, easy → medium |
| `## Spot the bug` | `type: written`, id `d{day}-pr-bug{n}` | A broken test; the model answer names each bug |
| `## Where does it belong?` | `type: written` | Framework placement (Day 10) |

Predict item:

`````markdown
````exercise
id: d7-pr-p1
title: Predict — a loop with continue
level: easy
type: predict
prompt: What is printed?
code: |
  for (const n of [1, 2, 3, 4]) {
    if (n % 2 === 0) continue;
    console.log(n);
  }
answer: |
  1
  3

  `continue` skips the rest of the loop body for even numbers, so only 1 and 3 are printed.
````
`````

The answer gives the exact output, a blank line, then the reasoning. Add `codeLanguage: text` when the code is not runnable TypeScript.

## Exercises

`````markdown
````exercise
id: d6-ex1
title: A product catalogue
level: easy
type: code
prompt: |
  Create `day6/catalogue.ts`:

  1. Declare a type `Product` with `name`, `price` and an **optional** `badge`.
  2. Make an array of three products.
  3. Print each one in this exact format:

  ```
  Monitor - ₹8999
  Webcam - ₹2499 (New)
  Headset - ₹1799
  ```
file: ts-basics/day6/catalogue.ts
run: node day6/catalogue.ts
hints:
  - "An optional property has a `?`: `badge?: string;`"
  - "A ternary adds the badge only when there is one: `const badge = product.badge ? ' (' + product.badge + ')' : '';`"
solution: |
  type Product = { name: string; price: number; badge?: string };

  const products: Product[] = [
    { name: 'Monitor', price: 8999 },
    { name: 'Webcam', price: 2499, badge: 'New' },
    { name: 'Headset', price: 1799 },
  ];

  for (const product of products) {
    const badge = product.badge ? ` (${product.badge})` : '';
    console.log(`${product.name} - ₹${product.price}${badge}`);
  }
expectedOutput: |
  Monitor - ₹8999
  Webcam - ₹2499 (New)
  Headset - ₹1799
````
`````

### Fields by type

| `type` | Fields | Graded by |
|---|---|---|
| `code` | `file`, `run`, `starter` (optional), `hints`, `solution`, `expectedOutput` (for `node` programs) | exact output (`expectedOutput`), tests pass (`*.spec.ts`), or the type check |
| `terminal` | `hints`, `solution` (the commands) | each command exits 0 |
| `written` | `hints` (optional), `modelAnswer` (a numbered list with **bold** lead words) | self-check against the model answer |
| `predict` | `code`, `answer` | self-check |

Ids are `d{day}-ex{n}` and are **permanent**: never reuse a deleted exercise's id, and keep the id when you only reword an exercise. Learners' saved work is attached to it.

### A day's set of five

- Levels climb: easy → medium (×2–3) → `challenge`. The challenge title says so and is quoted because of the colon: `title: "Challenge: prove it with the debug log"`. Use `"Optional challenge: …"` when it is truly optional.
- Mix types across the day. Week 1 mixes written, predict, terminal and code; TypeScript days are mostly code; Playwright days are code exercises framed as manual test cases (a TC-ID in a table or blockquote) to automate.
- Day 10 style: a 5-step `## Mini-project · …`, each step building on the last.

### Wording a prompt

- Open with an imperative and the file: "Create `day7/smoke.ts` with: …", "Save this as `day4/fix-me.ts`, run `npm run check -- day4/fix-me.ts`, and fix every mistake."
- Numbered steps.
- Give the exact target output in a fence, and say "exact".
- Bold the constraints: **one**, **in order**, **optional**, "using **array methods** (no `for` loops)".
- State how to know it worked: "Run it — it must pass.", "until the check is silent".
- Often end with a probe: "Then change `maxChecks` to `3` and run it again."

### Hints

2–3 per exercise (up to 4), escalating from the approach to the near-exact line. Quote each hint string:

- "The first test in the same file already shows the correct pattern."
- "`const [user] = credentials;` takes just the first item — you only need the email."

### Solutions

Complete, runnable files that pass `npm run verify:content`. Same variable names as the lessons, `const` by default, short `//` comments, and for fix-it exercises a comment per fix (`// fix 2: a boolean, not text`). A `.spec.ts` solution must be the whole file, with its imports.

## Reflection

`## Reflection` with 4–6 numbered short questions the learner should answer out loud, covering the day's key ideas in order:

```markdown
## Reflection

Before moving on, make sure you can answer these out loud:

1. Why does a web-first assertion pass on a slow page when a one-time check fails?
2. …
```
