# Writing playbook for the Playwright Learning Studio

This playbook defines how a lesson in this course is structured and how its sentences are written.
It is for anyone who writes or reviews lesson content, including cards, practice problems,
solutions, and the banners that the scripts generate.

Each rule gives the rule itself, the reason for it, a **before** example quoted from this course,
and an **after** example. Where a rule comes from an established tutorial site, the source is
named. The rules are based on a review of seven reference pages (GeeksforGeeks, W3Schools, MDN
Learn, the Playwright docs, the TypeScript Handbook, and Microsoft Learn) and an audit of every
learner-facing string in Weeks 1 and 2.

The rules that can be checked mechanically are enforced by `npm run verify`. Section 12 lists which
rules are checked and which depend on review.

---

## Contents

0. [The course owner's preferences](#0-the-course-owners-preferences)
1. [Reader and voice](#1-reader-and-voice)
2. [Lesson structure](#2-lesson-structure)
3. [Headings](#3-headings)
4. [Sentences and paragraphs](#4-sentences-and-paragraphs)
5. [Word choice](#5-word-choice)
6. [Emphasis](#6-emphasis)
7. [House terminology](#7-house-terminology)
8. [Code presentation](#8-code-presentation)
9. [Callouts](#9-callouts)
10. [Practice problems, checkpoints, and recaps](#10-practice-problems-checkpoints-and-recaps)
11. [Things that are never written](#11-things-that-are-never-written)
12. [Enforcement and limits](#12-enforcement-and-limits)
13. [Reviewer checklist](#13-reviewer-checklist)
14. [Backlog for generated content](#14-backlog-for-generated-content)

---

## 0. The course owner's preferences

These are decisions the course owner has made while reviewing the course. They take precedence
over the general guidance in the rest of this playbook, and the sections below have been updated
to match them.

### Content

| Preference | What it means in practice |
|---|---|
| Professional, beginner-friendly language | Every lesson is written for someone opening the course for the first time. Chatty phrasing, slang, and insider shorthand are removed. |
| Never describe a lesson by what it lacks | "No new TypeScript today", "No code today", and a card row that answers "none" are all removed. State what the lesson *is* about. |
| Remove a tab that has no content of its own | If a tab lacks content, or its lesson needs none, remove the tab instead of explaining why it is empty. The day opens on its next tab. See [section 2](#tabs-with-no-content-are-removed). |
| Do not fill a sparse tab with prose that repeats its card | Where a tab is kept but has little content, it is a heading and its card, with nothing in between. |
| Refer to lessons by their tab names | Write *Fundamentals*, *Day 4 - Fundamentals*, or *Week 1 - Day 5 - TypeScript*. Never write the old notebook numbering, such as "Day 5.2". See [section 7](#referring-to-another-lesson). |
| Headings use hyphens as separators | `# Week 1 - Day 1 - Fundamentals - Why automation, why Playwright`. Only the structural separators change. Commas inside a subject stay. |
| Second person throughout | The reader is "you", in explanations as well as instructions. |
| Contractions sparingly | Allowed, as in the Playwright docs, but not in every sentence. |
| American spelling | *organize*, *behavior*, *favorite*. |
| At-a-glance cards use formal labels | Every card uses only Focus, Goals, Prerequisites, Tools, Environment, Scope, Key takeaway, and Next, in that order. Each row is a full, formal sentence. See [section 2](#the-at-a-glance-card). |
| Code examples follow the GeeksforGeeks order | A lead-in ending in a colon, then the code, **Output**, and **Explanation**. See [section 8](#8-code-presentation). |

### Scope and way of working

| Preference | What it means in practice |
|---|---|
| Weeks 1 and 2 only | Work on content is limited to weeks 1 and 2. Weeks 3 to 8 are hidden from the course and are not edited. |
| Review one tab at a time | Content is reviewed tab by tab, starting with Week 1 Day 1. The owner chooses a suggested change or proposes a different one for each section. |
| Ask when the choice is the owner's | Where a change involves a real choice, ask before making it. |
| Push directly to `main` | Changes are committed to `main` and pushed. There are no feature branches or pull requests. |

---

## 1. Reader and voice

### Who you are writing for

The reader is a working tester or developer who has not used Playwright before. They are new to
this tool, not to their job. Write for someone who is competent and short of time, and who reads
closely.

### Address the reader as "you", throughout

Use the second person in explanations as well as in instructions. This follows the Playwright
docs, which is the documentation your reader will use after the course.

| Before | After |
|---|---|
| ## The problem with what we wrote yesterday | ## The problem with the Fundamentals version |
| We'll go much deeper into the config in Week 3. | You configure projects and workers in Week 3. |

Never use "we" to mean the course or its author. It creates a narrator the reader has to keep
track of, and the course uses it inconsistently: "you" appears 363 times and "we" appears 5 times.

### Write in a professional register

- **No humor, no exclamation marks, and no superlatives.** Microsoft Learn's "congratulations!
  You just created a repository!" and "unmatched and unparalleled by any other company on the
  planet" are exactly what to avoid.
- **Contractions are allowed, but use them sparingly.** The Playwright, MDN, and TypeScript docs
  all use them. One or two in a paragraph reads naturally. A contraction in every sentence reads
  as chat. The linter warns when a string has more than one contraction per 40 words.
- **State facts plainly.** Avoid hedging ("basically", "pretty much") and intensifiers
  ("genuinely", "really").

### Orient before you qualify

Say what a thing is for before you say what it lacks. Never open a lesson by announcing an absence.
A first-time reader has not yet been told what a normal lesson contains, so an absence tells them
nothing and reads as an apology for the page they have just opened.

| Before | After |
|---|---|
| **No new TypeScript today** — the CLI commands below are shell commands, not language syntax, so there's no Day 3.1. | **Shell commands, not language syntax.** Day 2 got your environment ready. This is where you use it. |
| \| **New API** \| none — the same locators from Fundamentals \| | \| **The API** \| the same locators from Fundamentals \| |

### Do not restate what a card already says

If the at-a-glance card already names what is new today and where to go next, prose repeating it
in sentences is not a style problem to fix. It is a paragraph to cut. The TypeScript tabs on Week 1
Days 1 to 4 show where this leads. Their generated body was reworded three times before it became
clear that it should be deleted, and the tabs themselves were then removed, because none of those
days has a language lesson (see [section 2](#tabs-with-no-content-are-removed)).

---

## 2. Lesson structure

Every established tutorial site uses a predictable order, and learners come to rely on it.
GeeksforGeeks is the clearest example: each concept follows the pattern **definition → code →
Output → Explanation**. That predictability is its main strength, and this course adopts it.

### Every part opens the same way

1. **The H1 heading.** See [Headings](#3-headings) for the format.
2. **A one-sentence definition or thesis**, stated as *X is Y* or *X does Y*. All seven reference
   sites open this way.
3. **"By the end of this lesson, you will…"**, which lists three to six concrete outcomes.
4. **The at-a-glance card.**
5. **One banner at most**, placed directly after the card. A banner tells the reader where the code
   runs (for example, "Try it here" or "Follow this one in your own project").

| Before | After |
|---|---|
| By the end of this lesson you'll be comfortable writing an arrow function, reading an `async` one, and — this is the important part — … (62 words) | Arrow functions are the shorter function syntax that Playwright tests use throughout. By the end of this lesson, you will be able to write one, read an `async` one, and recognize a destructured parameter. |

### Templates by part type

**TypeScript** (a language primer):

1. Opening, as above
2. `## 1. <concept>`, `## 2. <concept>` and so on. Each section covers what the concept is, why
   it exists, its syntax, and one example.
3. Checkpoints
4. Recap
5. What's next

**Fundamentals** (introduces the Playwright API):

1. Opening
2. Concept sections, each built on the code pattern in section 8
3. Best practices
4. Common mistakes, as a three-column table: Mistake | What you see | Fix
5. Checkpoints
6. Recap
7. What's next

**Implementation** (the same API inside a project structure):

1. Opening
2. The problem with the Fundamentals version
3. The same code, with structure around it
4. Why it is shaped this way, as a table: Choice | Reason
5. What a reviewer looks for
6. Checkpoints
7. Recap
8. What's next

**Practice**:

1. Opening
2. How the problems are graded
3. The at-a-glance card
4. Three problems, each using the fixed labels in section 10
5. When you are done

### The at-a-glance card

Every card uses the same labels, in the same order, and a card includes only the rows it needs.

| Label | What the row states | Example (Week 1 Day 1 Fundamentals) |
|---|---|---|
| **Focus** | What the lesson covers | An orientation to test automation, with one guided look at the Playwright website. |
| **Goals** | What the learner can do afterwards | Explain what automation cannot do, why teams choose Playwright over Selenium, and where automation effort is spent. |
| **Prerequisites** | What the lesson assumes | No prior knowledge is required. This is the first lesson in the course. |
| **Tools** | The APIs, commands, or tools used | `npx playwright test`, `--headed`, and `show-report`. |
| **Environment** | Where the code runs, and on which app | In your own project, because these examples need the Playwright test runner. |
| **Scope** | What is covered here, and what is left for later | This lesson uses a plain function. The class-based Page Object Model is covered in Week 3. |
| **Key takeaway** | The one idea to keep | Automation does not find defects. It reports whether each check passed or failed. |
| **Next** | Where to go after this lesson | [Fundamentals](/learn/w2/d1/p2). |

**Write each row as a full, formal sentence** that makes sense without its label. The old labels
often started a sentence that the row finished ("**You'll watch** | a test pass with the wrong
password"). Under a noun label, that fragment no longer reads. A **Scope** row that describes what
the lesson does *not* cover must say so in the sentence itself, or it reads as the opposite.

| Before | After |
|---|---|
| **Today's shape** \| orientation, plus one "go and look at this" step | **Focus** \| An orientation to test automation, with one guided look at the Playwright website. |
| **Assumes** \| nothing at all — this is the first lesson | **Prerequisites** \| No prior knowledge is required. This is the first lesson in the course. |
| **The sentence to keep** \| automation never finds a defect. It reports pass or fail. | **Key takeaway** \| Automation does not find defects. It reports whether each check passed or failed. |
| **What this is not** \| the hooks lesson. | **Scope** \| This lesson shows the problem that hooks solve. Hooks themselves are taught in Week 3 - Day 2. |

If a row needs a label outside this set, it probably belongs in the lesson body instead of the card.
`npm run verify` fails a card that uses any other label, repeats a label, or lists rows out of order.

### Tabs with no content are removed

A tab that has no content of its own, or whose lesson needs none, is **removed**. It is not kept
and filled with prose that explains why it is empty. The remaining tabs close up, and the day opens
on the first tab it still has.

- **The TypeScript tabs on Week 1 Days 1 to 4 were removed on this basis.** The course's language
  lessons begin on Day 5, so those four tabs had nothing of their own to teach. Each of those days
  now opens on Fundamentals. Day 5 keeps its TypeScript tab, because it is a real lesson.
- **To remove a tab**, add its key (for example `w1d2p1`) to `REMOVED_PARTS` in
  `scripts/lesson-overlay.ts`, delete its entry from the lesson card file, and run
  `npm run overlay`. The importer applies the same list, so a re-import cannot bring the tab back.
  `npm run verify` fails if a removed tab reappears.
- **Part numbers are never renumbered.** A part's number decides its tab name (part 1 is always
  TypeScript, part 2 always Fundamentals) and appears in every lesson URL. Renumbering
  Fundamentals from 2 to 1 would relabel it "TypeScript" and break every link to it. No part number
  is visible to the learner, so removing the tab is enough.
- **Old links still work.** A URL that names a removed tab, such as `/learn/w1/d1/p1`, redirects to
  the day's first remaining tab.

### Sections that close a part

- **Best practices**: a bulleted list. Each item gives a rule and its reason in one sentence.
- **Common mistakes**: the three-column table above. A learner who sees an error message should
  be able to find it in the "What you see" column.
- **What's next**: one or two sentences that point forward. Do not use a stock phrase.
  GeeksforGeeks's "To know more, please refer to this article" is the pattern to avoid.

---

## 3. Headings

### The H1 format

Every part's H1 follows the same pattern:

```
# Week 1 - Day 1 - TypeScript
# Week 1 - Day 1 - Fundamentals - Why automation, why Playwright
# Week 2 - Day 3 - TypeScript - Building a unique value at runtime
```

The pattern is `Week N - Day D - <Tab>`, followed by ` - ` and the lesson's subject. Only the
structural separators are hyphens. A comma inside the subject is ordinary English and stays as it
is. A heading never repeats its tab name, so `Practice: actions on a form` under the Practice tab
becomes `Actions on a form`. This rule is enforced by `applyHeadingFormat()` in
`scripts/lesson-overlay.ts`.

### Subheadings (H2 and H3)

- **Write noun phrases in sentence case**, with code in backticks. MDN does this consistently,
  for example "Function arguments and parameters". The Playwright docs mix sentence case and title
  case, which is the pattern to avoid.
- **Do not use questions, contractions, or casual phrasing.**
- **Label examples and steps with a colon, not a dash:** `Example 1: Create an employee`.

| Before | After |
|---|---|
| ## Hands-on: go look at the tool | ## Explore playwright.dev |
| ## Playwright isn't the only automation tool — know the neighbourhood | ## Other automation tools |
| ## Doing it for real, in a spec file | ## The same test in a spec file |
| ## Example 4 — delete it, and prove it's gone | ## Example 4: Delete the employee and confirm the deletion |
| ## The problem: which column is "Actions"? | ## Locating the Actions column |
| ## What Playwright actually ships with | ## What Playwright includes |

---

## 4. Sentences and paragraphs

### Open with a definition, and include the article

A new concept starts with a sentence that defines it. GeeksforGeeks writes "List is a built-in data
structure…" and leaves out the article. Always include it: "A list is a built-in data structure…".

| Before | After |
|---|---|
| Locators represent a way to find element(s) on the page at any moment. | A locator is an object that finds an element on the page at the moment an action runs. |

### One idea per sentence

Keep the main clause and move additions into their own sentences. The habit this course had was a
main clause with a second clause attached after an em dash, and sometimes a third clause inside
brackets.

- **Use one em dash at most in a sentence, and only for a short gloss.** Two em dashes in one
  sentence fail the build.
- **Use one parenthetical at most in a sentence.**
- **Keep sentences under 32 words** as a working limit. A sentence over 45 words fails the build.

| Before | After |
|---|---|
| Committing the lock file is what guarantees your teammate — or CI — installs the exact same versions. | Committing the lock file ensures that your teammates and CI install exactly the same versions. |
| `.fill()` — and typing in general — only ever changes the property. | Typing, including `.fill()`, changes only the property. |

### Break a long explanation into short sentences

A 47-word sentence that carried three counter-examples in parentheses became four sentences:

> The course chose it over three obvious alternatives. Deleting the record afterwards leaves the
> suite broken whenever a run fails partway. A file of ten prepared names runs out on the eleventh
> run. A timestamp collides when two tests start in the same second.

### Use active voice, with the tool or the reader as the subject

The Playwright docs make the tool the subject: "Playwright waits for the element to be actionable
before performing the action." This tells the reader who does what.

| Before | After |
|---|---|
| Elements are accessed using their position. | You access an element by its position. |

### Name the consequence, not the mechanism

When the mechanism is not the point of the lesson, tell the reader what it means for them.

| Before | After |
|---|---|
| The studio executes your code in a new process each time. | Each time you press Run, your code starts from a clean slate. Nothing from a previous run is still in memory. |

---

## 5. Word choice

### Banned: colloquialisms

These phrases read as a note to a colleague rather than course material. The linter fails the build
when it finds them.

| Do not write | Write instead |
|---|---|
| gotcha | a specific description of the mistake: "`parent::div` selects the wrong element" |
| sweet spot | the best balance, the recommended setting |
| home turf | designed for, the primary use of |
| gymnastics | a precise description: "several `--grep` filters" |
| the whole trick | the key step |
| for free | automatically, by default |
| blow up | increase sharply, fail |
| poked at | explored, tried |
| neighbourhood | related tools, alternatives |
| handy, stuff, tons of, awesome, kinda | a precise word |

### Avoid: filler and intensifiers

These words add emphasis without adding meaning. The linter warns when it finds them.

| Word | Usually | Example |
|---|---|---|
| just | delete it | "today's takeaway is just:" → "today's takeaway is:" |
| actually | delete it | "What Playwright actually ships with" → "What Playwright includes" |
| real, for real | delete it, or say *which* | "open it for real" → "open the file" |
| genuinely | delete it | "watched Playwright genuinely ignore a test file" → "watched Playwright ignore a test file" |
| simply, basically, obviously | delete it | Nothing is simple or obvious to someone learning it. |

### Avoid: describing tools as if they were people

Tools do not have opinions, feelings, or intentions. Phrases like "the runner is happy" and "the
class has no opinion" are vivid, but they leave a beginner unsure what else the software is
deciding. Describe what the tool does. The linter warns when it finds these phrases.

| Before | After |
|---|---|
| What Codegen reaches for, and why | Which locators Codegen generates, and why |
| The class has no opinion on what should be true. | The class contains no assertions. |
| `const` never objected. | TypeScript reported no error. |
| so this cell tells the truth either way | so the output is correct in both cases |
| is lying about its own name | has a name that does not match its behavior |

### Do not replace one habit with another

Earlier fixes replaced "gotcha" with "trap" and certain phrases with "honest". Both words then
spread through the course: "trap" appears 5 times and "honest" 3 times. A banned word needs a
specific replacement each time it appears. It should never be swapped for a single house synonym.

---

## 6. Emphasis

- **Bold a term once, where it is defined.** Follow the term with a short gloss, as MDN does: "Some
  functions require **arguments** when you invoke them, which are values that…". Do not bold the
  same term again later in the lesson.
- **Never bold a whole clause.** Bolding "**This repo is already a set-up Playwright project**" is
  the written equivalent of raising your voice. If a sentence matters, give it its own paragraph
  or put it in an **Important** callout.
- **Do not use capitals for emphasis.** The linter warns on NOT, ONLY, ALL, OLD, and ONE when they
  are used for emphasis.

  | Before | After |
  |---|---|
  | Why does this lesson tell you NOT to run… | Why does this lesson tell you not to run… |
  | search for the OLD one | search for the previous name |

- **Use italics rarely**, for the first mention of a secondary term. The TypeScript Handbook uses
  them this way: "TypeScript tries to automatically _infer_ the types".

---

## 7. House terminology

Use one name for each concept. The course currently uses four different labels for expected output,
and both "When you're done" and "When you are done".

| Concept | Use | Do not use |
|---|---|---|
| The file that holds a test | spec file | test file, spec, `.spec.ts` file (except when discussing the suffix itself) |
| The program that runs tests | the test runner | the runner, test-runner process |
| Where the learner types code in the studio | the editor | the cell, lesson cell, here |
| Running code outside the studio | in your own project | own checkout, run-it-yourself, a real terminal |
| The result of an example | **Output** | Expected result, Expected, Expected (verified live) |
| A reference to another lesson | the name its heading uses, shortened by context (below) | Day 5.2, week3/day5, "yesterday" |

### Referring to another lesson

Refer to a lesson by the name its heading uses, and drop the parts the reader already knows:

| Where the target is | Write | Example |
|---|---|---|
| The same day | the tab name | [Fundamentals](/learn/w1/d5/p2) |
| The same week, another day | Day and tab | [Day 2 - Fundamentals](/learn/w1/d2/p2) |
| Another week | week, day, and tab | [Week 1 - Day 5 - TypeScript](/learn/w1/d5/p1) |

Make every reference a link. For a possessive, write "the [Fundamentals](/learn/w1/d5/p2)
lesson's version", not "Fundamentals's version". Headings keep plain text, without links.

Never write the old notebook numbering. "Day 5.2" meant day 5, notebook 2. A learner never sees
that number anywhere else, because the page calls that lesson Fundamentals. `relabelDayRefs()` in
`scripts/notebook-parse.ts` rewrites old references in generated text on every overlay, and the
`insider-term` rule fails authored text that contains one.

### Spelling and punctuation

- **Use American spelling** to match Playwright, TypeScript, and the APIs themselves (`color`,
  `initialize`). Write *organize*, *recognize*, *normalize*, *behavior*, *favorite*, *labeled*.
  British spelling fails the build.
- **Use the serial comma**: "Node, VS Code, and the CLI".
- **Format every API name as code, on every mention**: `fill()`, `getByRole`, `playwright.config.ts`.
  GeeksforGeeks and W3Schools often leave API names as plain text. MDN, Playwright, and TypeScript
  never do.
- **Write numbers one to nine as words** in prose. Use numerals for measurements, versions, and
  anything the reader types: *three tests*, *Node 18*, *30 seconds*.

---

## 8. Code presentation

This is the most important convention in the playbook. Every code example follows the same four
steps, in the same order.

### The pattern

1. **A lead-in sentence that ends with a colon** and states what the code shows. Every reference
   site does this.
2. **The code.** Comments inside the code are phrased as instructions, as in the Playwright docs:
   `// Create a locator.`
3. **Output**: a bold label, then the result in its own block. This follows GeeksforGeeks. For a
   test, the output is the test runner's result or the error message.
4. **Explanation**: a bold label, then full sentences that say *why*, not only *what*.

### A worked example

````markdown
To fill a text field, call `fill()` on its locator:

```ts
// Locate the field by its placeholder, then type the value.
await page.getByPlaceholder('Email').fill('ada@example.com');
```

**Output**

```
1 passed (1.2s)
```

**Explanation:** `fill()` clears the field before typing, so any value already present is
replaced rather than appended. This is why you do not need to clear the field yourself.
````

### Explain why, not only what

GeeksforGeeks's weakest habit is an explanation that repeats the code in words. For example,
"*args stores extra positional arguments" tells the reader what the syntax does but not why they
would use it. Every **Explanation** must add a reason, a consequence, or a common mistake.

| Before (describes what) | After (explains why) |
|---|---|
| `fill()` sets the value of the field. | `fill()` clears the field before typing, so an existing value is replaced rather than appended. |

### Keep the prose consistent with the code

If the lead-in says the example prints "Hello, World!", the output must say exactly that.
GeeksforGeeks's hub page says it displays "Hello, World!" and then shows "Hello World!". A reader
who notices the mismatch stops trusting the rest of the page.

---

## 9. Callouts

Use exactly three labels, and keep each callout to one to three sentences.

| Label | Use it for | Example |
|---|---|---|
| **Note** | Related information that is useful but not essential | **Note:** `fill()` works on `<input>`, `<textarea>`, and elements with `contenteditable`. |
| **Tip** | A practical shortcut the reader can apply immediately | **Tip:** Run `npx playwright test --ui` to step through a test in the browser. |
| **Important** | A rule that causes a real failure if ignored. Put the rule itself in bold. | **Important:** **Do not commit `test-results/`.** It changes on every run and makes every diff unreadable. |

A callout must add something new. If it repeats the paragraph above it, delete it.

---

## 10. Practice problems, checkpoints, and recaps

### Practice problems

Each problem uses these labels, in this order:

- **What to build.**
- **Where.**
- **How you will know it worked.**
- **Hint** (optional)

Use these exact labels. The course currently has both "What to do." and "What to build.", and both
"How you'll know" and "How you will know".

### Checkpoints

- **The question** is a complete sentence ending with a question mark.
- **The options** are parallel in grammar and similar in length. The correct option must not be
  the longest one.
- **The explanation** starts with a capital letter or code and ends with a full stop. It says why
  the correct answer is right and why the most tempting wrong answer is wrong. The linter checks
  the shape.

### Recaps

A recap states what the lesson established, in two to four sentences, and says where to go next.
It never opens with what the lesson did not cover.

| Before | After |
|---|---|
| No new TypeScript today. What changes is what you know about the runner: … | Today changes what you know about the test runner: … |

---

## 11. Things that are never written

These describe how the lesson was made, not what it teaches. The linter fails the build when it
finds any of them in authored text.

| Never write | Why | Before |
|---|---|---|
| notebook, kernel, cell | The learner is in a browser. The course was first written in Jupyter notebooks, and these words come from that. | "**Where.** A cell in this lesson." |
| verified live, while writing this lesson | These are notes for the author, not the reader. | "Verified green three runs in a row while writing this lesson." |
| the source training session | The reader has never seen the recording. | "used in the source training session" |
| `_shared/` paths | These are internal files the reader cannot open. | "noted in `_shared/CONCEPTS.md`" |
| yesterday | Lessons are not read on consecutive days, and in this course "yesterday" often referred to an earlier part of the same day. | "## The problem with what we wrote yesterday" |

---

## 12. Enforcement and limits

### What `npm run verify` checks

The linter is in `backend/test/style-rules.ts` and runs from `backend/test/import-proof.ts`. It
lints the text this repository authors:

- `Data/Content/lessons/w*.json`: `at_a_glance`, and every checkpoint's `question`, `options`, and
  `explanation`, plus `recap`
- `Data/Content/variations/w*.json`: every your-turn prompt
- `Data/Content/solutions/w*.json`: the prose around the code

**Every error-severity finding fails the build, whatever its rule is called.** An earlier version
checked only a hard-coded list of rule names. As a result, a rule could be added to
`style-rules.ts`, reported as enforced, and still be ignored. That happened: the
`defines-by-absence` rule let 11 violations through before this was fixed.

**Hard failures**

| Rule | What it catches |
|---|---|
| `banned-phrase` | The colloquialisms in section 5 |
| `defines-by-absence` | "no new TypeScript", "no code today", a table row that answers "none", "nothing to learn" |
| `british-spelling` | *-ise*, *-our*, *-re*, *-ogue*, and doubled *l* forms |
| `insider-term` | The words in section 11, and old "Day N.P" references |
| `exclamation` | Any exclamation mark outside code |
| `sentence-length` | A sentence over 45 words |
| `stacked-asides` | Two or more em dashes in one sentence |
| `card-label` | An at-a-glance label outside the fixed set, a repeated label, or rows out of order |
| `explanation-shape`, `explanation-empty` | A checkpoint explanation that is empty or is not a full sentence |

**Warnings**

These are printed as counts and do not fail the build.

| Rule | What it catches |
|---|---|
| `sentence-length` | A sentence over 32 words |
| `contractions` | More than one contraction per 40 words |
| `filler` | *just*, *actually*, *genuinely*, *for real*, *simply* |
| `anthropomorphism` | *is happy*, *has no opinion*, *complains*, *reaches for*, *lying* |
| `emphasis-caps` | NOT, ONLY, ALL, and similar words used for emphasis |
| `parentheticals` | More than one long parenthetical in a sentence |

These rules are warnings, not errors, because each one has legitimate exceptions. "Reaches for" has
a technical meaning, and a 33-word sentence can read perfectly well. A warning that people ignore
does less harm than an error that teaches them to ignore `verify`.

**Before you rewrite text that a rule flags, check the rule.** The sentence splitter has caused
false positives more than once. The first British-spelling rule also flagged the correct American
spelling *favorite*.

### Why generated text is not linted

Lesson bodies in `Data/Content/weeks/` are generated from notebooks in a training repository that
this checkout does not contain. The next `npm run import` overwrites anything edited there. A rule
that fails on text nobody here can edit leaves `verify` permanently red, and a check that everyone
ignores is worse than no check at all.

Generated text can still change through transforms that `npm run overlay` applies on every launch:

- `studioise()` in `scripts/notebook-parse.ts`, including `LEGACY_COPY` and `ABSENCE_BANNERS`
- `applyHeadingFormat()` in `scripts/lesson-overlay.ts`

Each transform is an exact-match rewrite tied to the current wording. This is how the "No new
TypeScript today" banners were removed from Week 1.

One check links the linted text to the shipped text: every block that comes from an overlay must be
byte-identical to its authored source. This proves that the text the linter checked is the text the
learner sees.

### What no linter can check

| Goal | Can it be automated? |
|---|---|
| Ease of understanding | **No.** A short sentence can still be unclear. |
| Beginner-friendliness | **No.** No check can tell whether an explanation lands. |
| Professional wording | **Partly.** Known bad phrases can be banned, but good writing cannot be asserted. |
| Sentence structure | **Partly.** Length and punctuation can be measured. Rhythm and logical order cannot. |

Everything the linter cannot check is the job of the reviewer checklist below.

---

## 13. Reviewer checklist

Check each lesson against this list before it ships.

- [ ] The part opens with a one-sentence definition, then "By the end of this lesson, you will…".
- [ ] Every section follows the template for its part type (section 2).
- [ ] Every code example has a lead-in sentence ending in a colon, the code, **Output**, and an
      **Explanation** that says why.
- [ ] The Output matches what the code actually produces.
- [ ] Every new term is bolded once, where it is defined, and followed by a gloss.
- [ ] Headings are sentence-case noun phrases, with no questions or casual phrasing.
- [ ] The text uses the house terms in section 7, spelled the American way.
- [ ] No sentence describes the lesson by what it does not contain.
- [ ] No tool is described as if it had opinions or feelings.
- [ ] No banned word has been replaced by a new habitual synonym.
- [ ] `npm run verify` passes, and any new warnings have been read.

---

## 14. Backlog for generated content

These problems exist in notebook-derived text. They can be fixed only through transforms in
`scripts/notebook-parse.ts`, and they are listed in priority order.

1. **Banned phrases that still ship:** "sweet spot" (Week 1 Day 3 Implementation) and "gotcha"
   (Week 2 Day 1 Fundamentals, Week 2 Day 4 Fundamentals).
2. **"cell" in practice problem statements:** "**Where.** A cell in this lesson." appears 9 times.
   `studioise()` runs only on markdown blocks, so problem statements need their own pass.
3. **"yesterday":** "## The problem with what we wrote yesterday" appears in 4 Implementation parts.
4. **Week 2 absence banners:** "This day introduces no new TypeScript" and "No new API here on
   purpose", the same pattern that was removed from Week 1.
5. **Expected-output labels:** replace the four variants with **Output**.
6. **Code comments that mention the notebook or kernel:** "Deno's kernel shares one module scope
   across every cell". Code blocks are not transformed at all at present.
7. **Stacked asides:** 25 sentences in generated text contain two or more em dashes.
