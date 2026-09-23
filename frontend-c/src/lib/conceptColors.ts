/**
 * Concept-based semantic highlighting. The five categories a learner asked to see mapped to
 * consistent colors, everywhere code appears - the lesson's read-only examples
 * (components/Markdown.tsx) and the live editor (components/CodePane.tsx). One vocabulary here,
 * imported by both, so "same concept, same color" is structural rather than two lists that can
 * drift apart.
 *
 * The vocabulary lists real Playwright method names, not patterns:
 *
 *  - Every `getBy*` locator is listed, whether or not a lesson uses it yet, since they cost
 *    nothing to list.
 *  - The assertion list is a closed WHITELIST of real Playwright/Jest matcher names, not a
 *    pattern like `/\.to[A-Z]\w*\(/`. Plain TypeScript has `.toString()`, `.toFixed()`,
 *    `.toUpperCase()` - real methods that would misfire as "assertions" under a blind `.toXxx(`
 *    regex. They are deliberately never added to this whitelist.
 *
 * The explore-mode harness's own `launch()`/`show()`/`login()` are deliberately NOT a sixth
 * category - only the five requested ones are colored; harness calls stay neutral.
 */

export type Concept = 'locator' | 'assertion' | 'action' | 'wait' | 'test';

export const CONCEPT_VOCAB: Record<Concept, readonly string[]> = {
  locator: [
    'getByRole',
    'getByPlaceholder',
    'getByText',
    'getByLabel',
    'getByTestId',
    'getByAltText',
    'getByTitle',
    'locator',
    'first',
    'last',
    'nth',
    'filter',
  ],
  assertion: [
    'expect',
    'toBe',
    'toBeVisible',
    'toHaveURL',
    'toHaveCount',
    'toContain',
    'toHaveValue',
    'toBeTruthy',
    'toContainText',
    'toHaveText',
    'toEqual',
    'toHaveLength',
    'toBeLessThan',
    'toBeNull',
    'toBeGreaterThan',
    'toBeGreaterThanOrEqual',
    'toHaveScreenshot',
    'toThrow',
    'toBeDisabled',
    'toBeEnabled',
    'toBeUndefined',
    'toBeChecked',
    'toMatch',
    'toBeHidden',
  ],
  action: [
    'fill',
    'click',
    'check',
    'uncheck',
    'selectOption',
    'hover',
    'blur',
    'dblclick',
    'dragTo',
    'type',
    'press',
    'setInputFiles',
  ],
  wait: [
    'waitForURL',
    'waitForLoadState',
    'waitFor',
    'waitForTimeout',
    'waitForSelector',
    'waitForResponse',
    'waitForRequest',
    'waitForEvent',
    'waitForFunction',
  ],
  test: [
    'test',
    'describe',
    'beforeEach',
    'beforeAll',
    'afterEach',
    'afterAll',
    'skip',
    'fixme',
    'step',
    'use',
    'configure',
  ],
};

/** identifier -> its concept, or null. Built once; every consumer does an O(1) lookup. */
const LOOKUP: Map<string, Concept> = new Map();
for (const [concept, names] of Object.entries(CONCEPT_VOCAB) as [Concept, readonly string[]][]) {
  for (const name of names) LOOKUP.set(name, concept);
}

export function classify(identifier: string): Concept | null {
  return LOOKUP.get(identifier) ?? null;
}

/**
 * One alternation over every known name, each required to be followed by `(` - the same
 * "call-shaped" signal hljs's own tokenizer uses (see Markdown.tsx), so a bare word that merely
 * happens to match a concept name (a variable called `test`, unlikely but possible) is not
 * colored unless it is actually being called.
 */
export const CONCEPT_CALL_PATTERN = new RegExp(
  '\\b(' + [...LOOKUP.keys()].join('|') + ')\\s*(?=\\()',
  'g',
);
