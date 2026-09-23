import { test, expect } from '@playwright/test';
import { loginPage } from '../day9/practice-pages';

// Bug 1: beforeAll can't use `page` → use beforeEach (and remove the duplicate setContent in the test)
test.beforeEach(async ({ page }) => {
  await page.setContent(loginPage);
});

// Bug 2: test.only would fail CI (forbidOnly) and hide all other tests → plain test()
test('wrong password shows an error', async ({ page }) => {
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('nope');
  // Bug 3: missing await on the click
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Bug 4: missing await on the web-first assertion
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});
