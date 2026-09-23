import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

// Test data: one row = one test
const invalidLogins = [
  { email: '', password: '', message: 'Please enter your email and password' },
  { email: 'student@qa.academy', password: '', message: 'Please enter your email and password' },
  { email: 'nobody@qa.academy', password: 'Learn@123', message: 'Invalid email or password' },
  { email: 'student@qa.academy', password: 'learn@123', message: 'Invalid email or password' },
];

test.describe('Invalid sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(loginPage);
  });

  // Create one test per data row
  for (const data of invalidLogins) {
    test(`rejects "${data.email}" / "${data.password}"`, async ({ page }) => {
      await page.getByLabel('Email').fill(data.email);
      await page.getByLabel('Password').fill(data.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('alert')).toHaveText(data.message);
    });
  }
});
