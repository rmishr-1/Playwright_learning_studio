import { test as base } from '@playwright/test';
import { SignInPage } from '../pages/SignInPage';
import { serveQaAcademy } from '../utils/practice-site';

// The extra fixtures our tests can ask for
type QaAcademyFixtures = {
  signInPage: SignInPage;
};

// A new test() that has everything the normal one has, plus our fixtures
export const test = base.extend<QaAcademyFixtures>({
  signInPage: async ({ page }, use) => {
    await serveQaAcademy(page);               // set-up: make the practice site available
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await use(signInPage);                    // hand it to the test, and wait until the test ends
    // anything after use() is clean-up, and runs after the test
  },
});

// Re-export expect, so tests import both from one place
export { expect } from '@playwright/test';
