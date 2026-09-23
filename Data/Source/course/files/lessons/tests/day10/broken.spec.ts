import { test, expect } from '@playwright/test';
import { loginPage } from '../day9/practice-pages';

test('wrong expected text', async ({ page }) => {
  await page.setContent(loginPage);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Mistake 1: the real message is "Please enter your email and password"
  await expect(page.getByRole('alert')).toHaveText('Email is required');
});

test('element that does not exist', async ({ page }) => {
  test.setTimeout(5000);   // fail faster than the default 30 s while we practise
  await page.setContent(loginPage);
  // Mistake 2: there is no "Log in" button — it's called "Sign in"
  await page.getByRole('button', { name: 'Log in' }).click();
});
