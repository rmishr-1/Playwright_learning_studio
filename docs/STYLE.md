# Writing style for the Playwright Learning Studio

Who this is for: whoever writes the next week of lessons. It records the voice this course
uses, the rules `npm run verify` enforces mechanically, and — just as important — the rules it
cannot enforce and therefore leaves to review.

## The voice

**Professional but warm.** Complete sentences, no slang, no exclamation marks, and still
addressed to a person who is learning. The reader is a working tester or developer who has not
used Playwright before. They are not a beginner at their job.

**Orient before you qualify.** Say what a thing is for before you say what it lacks. This is the
rule the whole pass came from. The first screen of the course used to open with:

> This day introduces no new TypeScript. The code in the parts that follow uses only what you
> already have, or is theory with no code at all.

A first-time reader has not yet been told what TypeScript is, that days normally do introduce
some, or why a lesson would announce an absence. The page defines itself by a missing thing.
It now reads:

> You write Playwright tests in TypeScript. This tab is where each day covers the language
> features that day's lesson needs.
>
> Today's lesson needs nothing new, so you can go straight to it.

Three sentences, in the order a newcomer needs them: what the language is for, what this tab
does, what to do now.

**One idea per sentence.** The habit this course had was a main clause with a second clause
bolted on after an em dash, and sometimes a third inside brackets. Two asides in one sentence
is a hard failure, not a matter of taste:

| Before | After |
|---|---|
| The absolute form — `/html/body/div[2]/…` — describes a route through the tree | The absolute form, `/html/body/div[2]/…`, describes a route through the tree |
| anchor on what the user perceives — role, label, placeholder, visible text — not on how the page is built | anchor on what the user perceives, meaning role, label, placeholder and visible text, rather than on how the page is built |

**Break a long explanation into a list of short ones.** A 47-word sentence carrying three
parenthetical counter-examples became four sentences:

> The course chose it over three obvious alternatives. Deleting the record afterwards leaves the
> suite broken whenever a run fails mid-way. A file of ten prepared names runs out on the
> eleventh run. A timestamp collides when two tests start in the same second.

**No colloquialism.** "gotcha", "sweet spot", "handy", "tons of", "stuff", "don't worry". These
read as notes to a colleague, not as course material. "gotcha" became "trap".

**Name the consequence, not the mechanism**, when the mechanism is not the lesson. "a new
process each time" means nothing to someone on day one; what they need to know is that nothing
carries over from the previous run.

## What `npm run verify` checks

The linter lives in `backend/test/style-rules.ts` as pure functions and is run from
`import-proof.ts` under the **Voice and style** section.

### It lints the text this repository authors, and only that

In scope:

- `Data/Content/lessons/w*.json` — `at_a_glance`, every checkpoint `question`, `options[]` and
  `explanation`, and `recap`.
- `Data/Content/variations/w*.json` — every your-turn prompt.
- `Data/Content/solutions/w*.json` — the prose around the code.

Out of scope, permanently: the lesson bodies under `Data/Content/weeks/`. They are generated
from 147 notebooks in a training repository this checkout does not contain, and the next
`npm run import` overwrites anything edited there. **A rule that fails on text nobody here can
edit turns `npm run verify` permanently red, and a check everyone ignores is worse than no
check.**

Note that filtering the *merged* day files by block type would be the obvious way to do this,
and it is wrong: the placeholder text quoted above ships as a plain `markdown` block, and
`studioise()` injects its banners inside notebook-derived markdown. A type filter misses the
exact sentence that prompted this work. Lint the sources.

One check closes the loop between the two: **every overlay-typed block in a shipped day file
must be byte-identical to its authored source.** That proves the text the linter measured is
the text the learner reads, and it catches hand-edits of the generated tree.

### Hard failures

| Rule | Threshold |
|---|---|
| Banned lexicon | gotcha, sweet spot, nothing new today, kinda, tons of, awesome, handy, no big deal, don't worry, stuff |
| Exclamation marks | none |
| Em dashes in one sentence | two or more fails |
| Sentence length | over 45 words |
| Checkpoint `explanation` shape | starts with a capital or code, ends `.` `?` |

45 words is deliberately loose. One sentence that legitimately names four API methods should not
fail; a runaway should. The measured maximum before this pass was 53.

### Warnings, printed but not failing

Sentences over 32 words, more than one parenthetical in a sentence, and ALL-CAPS words outside
an acronym allowlist. Each has legitimate exceptions — a deliberate `ONE` for emphasis, a
32-word sentence that reads perfectly well — so they inform rather than block.

### Preprocessing, and why it matters

Before any rule runs, the text is reduced to what a reader parses as prose: fenced code is
dropped entirely, an inline code span becomes a single token (`page.getByRole("button", { name:
"Login" })` is one idea to a reader but eight "words" to a naive splitter), link hrefs are
dropped and labels kept, and heading, blockquote and table markers are stripped.

Sentence splitting then happens at three levels, in order: blank lines, list markers, then full
stops. All three are needed. Without the paragraph split, a paragraph ending in a colon swallows
the one after it. Without the list split, a six-bullet recap measures as a single 66-word
sentence. The full-stop splitter itself does not break on `Day 1.2`, `Node 18+.`, `e.g.`, `i.e.`
or `vs.`

**If a rule fires on text that reads fine, check the splitter before rewriting the text.** Seven
of the first fourteen failures this linter reported were splitter defects, not prose defects.

## What these checks do not guarantee

Of the four things this pass set out to improve, only part of one is mechanically checkable.

| Criterion | Automatable? |
|---|---|
| Ease of understanding | **No.** Readability formulas count syllables, not clarity. A short sentence can be opaque. |
| Beginner friendly | **No.** No check can tell whether an explanation lands, or whether a term was used before it was defined. |
| Professional wording | **Half.** Known-bad phrases can be forbidden. Good writing cannot be asserted. |
| Sentence structuring | **Partly.** Length and punctuation density only. Rhythm, variety and logical order need a reader. |

The linter guarantees: no colloquialism from a known list, no runaway sentence, no stacked
asides, no fragmented explanation, and no drift between authored source and shipped file.
Everything else is a review responsibility, and the list above is the review checklist.

## The limit of this pass, stated plainly

Weeks 1 and 2 now have polished cards, banners and interface copy sitting on lesson bodies that
were not touched, because they cannot be durably touched from here. Measured over the prose that
actually ships in weeks 1–2, the em dash rate moved from 0.31 to 0.30 per sentence: the bulk of
the text is notebook-derived and out of reach. Measured over the authored text this repository
owns, hard-rule violations went from 21 to 0 and the longest sentence from 53 words to 45.

Closing that gap needs either the training repository in the checkout or a prose-rewrite overlay
for the generated tree. Neither is built.
