import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';   // our practice page (no .ts needed in test files)

test('valid user can sign in', async ({ page }) => {
  // Arrange: open the sign-in page
  await page.setContent(loginPage);
  await expect(page).toHaveTitle('QA Academy - Sign in');

  // Act: sign in like a user would
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: the dashboard appears (after ~0.8 s — Playwright waits for it)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome back')).toBeVisible();
  await expect(page).toHaveTitle(/Dashboard/);
});
