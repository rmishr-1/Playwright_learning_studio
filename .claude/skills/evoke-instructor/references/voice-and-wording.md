# Voice and wording

Taken from Days 1–10. When in doubt, find a similar passage in `Data/Source/course/markdown/` and match it.

## Voice

- Talk to the learner as **"you"**. Use "we" only for a choice the course makes ("we always write it") or for shared code ("we want to report all of them"). Never the classroom "let's".
- Calm, practical, encouraging and honest. Reassure without cheering:
  - "You do **not** need to be a web developer."
  - "Don't worry about the syntax yet — look at how much the test runner does for you."
  - "An error message is not a failure — it's the computer telling you exactly what it didn't understand, and where."
  - "A failure is a clue, not a verdict."
- State limits plainly: "Playwright isn't the answer to everything. Its honest limits:"
- Blunt about traps: "**Avoid.** It silently switches TypeScript off." "Fall-through is almost always a bug."
- No hype, no humour, no "Great job!", no exclamation marks in prose.

## Sentences and paragraphs

- One idea per sentence, typically 8–20 words. Split with a colon or a dash rather than chaining clauses.
- Paragraphs of 1–3 sentences (at most 4).
- When a paragraph would list three or more facts, use a table instead.
- Contractions are fine (you'll, don't, it's).

## Introducing a term

1. **Bold on first use, defined in the same sentence**, usually after a dash, "is", or in brackets:
   - "**Headless** — no window is drawn."
   - "An **array** is an ordered list of values."
   - "an **API** — a web address that returns data rather than a page"
   - "('binaries' simply means the browser programs)"
2. Often describe it in plain words first, then name it: "…a loop inside a loop is called a **nested loop**." "This 'check first, then TypeScript knows' behaviour is called **narrowing**."
3. Secondary terms mentioned in passing go in *italics* (*methods*, *port*).
4. Gloss code symbols in words: `string[]` means *"a list of strings"*; `=>` reads "gives back".
5. Quote the official docs in italics, then restate: "The docs say it plainly: *…*. In plain words: **…**".
6. Defer, never hand-wave: "You'll learn functions properly on Day 8; for now, you only need to read this shape."
7. Glossary tables use `Term | Plain-English meaning`, or `Name | Plain-English meaning | Analogy`.

## Analogies

Use one analogy per big idea, from testing or everyday life. Reuse these rather than inventing new ones for the same idea:

| Idea | Course analogy |
|---|---|
| HTML / CSS / JavaScript | walls and furniture / paint and decoration / electricity and plumbing |
| Browser → Context → Page | browser → a brand-new **incognito window** → a **tab** |
| WebDriver vs Playwright | posting a letter per instruction vs staying on a phone call |
| Node.js / npm / npx | the engine of a car / an app store for code / "open this app" without installing it |
| `package.json` | the project's *ID card and shopping list* |
| Port | a door number for one service |
| Variable | a named box; a named cell in your test-data spreadsheet |
| Primitive / array / object / empty value | a cell / a column / a row with named columns / an empty cell |
| Type alias | the header row of the sheet |
| `if` / loops | "If a cookie banner appears…" / "Repeat steps 2–5 for each browser" |
| Narrowing | a precondition: "given… then…" |
| `break` / `continue` | "Stop testing — a blocker was found" / "Skip this row; it's N/A" |
| Function | a shared step in a test-management tool |
| Promise | an order-tracking number: pending, delivered, failed |
| Class | a blueprint |
| Framework folders | suites, shared steps, preconditions, data sheets, test plan, tags |
| Trace | the automated version of a perfect bug report |
| Error message | a defect report: read *where*, then *what* |
| Parallel runs | the difference between an hour and a coffee break |

## Bridging to manual testing

This is the course's defining habit. Use at least one of these in every part:

- A table with a **Manual-testing equivalent** column, or `Manual step | Type | Playwright step`.
- "You already think this way." / "Read it like a test case." / "Read the output like a tester."
- Steps become actions; expected results become assertions.
- "Is it a bug in the **application**, or a mistake in the **test**?"
- A `> [!TESTER]` callout (1–3 per day) for the tester's angle, career or interview advice.

## Recurring lead-ins

| Purpose | Phrases |
|---|---|
| Hands-on | **Try it:** … / **Try it — make it fail.** / Try it in the terminal panel: |
| Reading code or output | **What to notice** / Two things to notice: / Read it as a story: / Read it top to bottom: / Here is the output, shortened: |
| Dissecting | The command, piece by piece: / Decoding the first line of every Playwright test |
| Wrap-up | What the test proved: / What each new piece does — no need to memorise the syntax yet: |
| Rules | **Rule of thumb:** start with `const`. / Rule for the rest of the course: |
| Output caveats | Your numbers will differ. / Version numbers and paths will differ. |
| Callbacks to earlier days | On Day 1 you ran TC-101 without understanding every symbol. Now you can read the whole test. |

## Punctuation, symbols and spelling

- **Em dashes** are the main tool for definitions, asides and pivots. Keep to one aside per sentence.
- **Middle dot** `·` in headings and references: `## F3 · Arrays — ordered lists`, "(Day 5 · F3)".
- **Arrows** `→` in prose and tables: "Browser → Context → Page", "`'3'` → 3".
- The real ellipsis `…`, also for omitted code: `{ … }`.
- ✓ / ✘ for pass and fail; ✅ / ❌ for right and wrong in tables and code comments (`// ❌ error TS2588: …`). Emoji otherwise only inside mermaid nodes or a printed demo message, never in prose.
- Keys in backticks: `Ctrl + C`. UI paths in bold with arrows: **View → Terminal**.
- Arithmetic in explanations with × and −: "10 × 3 = 30, then 30 − 5 = 25."
- **British spelling**, as used consistently in all ten days: behaviour, colour, organise, recognise, catalogue, licence (noun), enrol, judgement.
- Test data has an Indian flavour: ₹ prices; names such as Asha, Asha Verma, Ravi, Meera Iyer, Priya Sharma; cities such as Delhi.

## Avoid

- A term used before it is defined, or before the day that teaches it.
- Undefined acronyms.
- Telling learners to memorise.
- Blame: errors are "normal — and helpful".
- Long paragraphs; walls of bullets where a table fits.
- Teaching bad practice as normal: `any`, `enum` (not supported by Node's type stripping; use literal unions), CSS or XPath as a first choice, fixed `sleep` waits in tests ("`sleep` is for learning, not for tests").
- Describing a lesson by what it lacks ("No code today"). Say what it is about.
- Platform words learners don't need: notebook, cell, kernel.
- Hand-drawn ASCII markers under code (`└──┬──┘`). They break when the line wraps. Name the parts in a table or bullets instead.
