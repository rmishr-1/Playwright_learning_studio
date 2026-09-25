import { test as base } from '@playwright/test';
import { SignInPage } from '../pages/SignInPage';
import { EnrolPage } from '../pages/EnrolPage';
import { serveQaAcademy } from '../utils/practice-site';

// The extra fixtures our tests can ask for
type QaAcademyFixtures = {
  signInPage: SignInPage;
  enrolPage: EnrolPage;
};

// A new test() that has everything the normal one has, plus our fixtures
export const test = base.extend<QaAcademyFixtures>({
  signInPage: async ({ page }, use) => {
    await serveQaAcademy(page);
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await use(signInPage);
  },

  enrolPage: async ({ page }, use) => {
    await serveQaAcademy(page);
    const enrolPage = new EnrolPage(page);
    await enrolPage.goto();
    await use(enrolPage);
  },
});

export { expect } from '@playwright/test';
