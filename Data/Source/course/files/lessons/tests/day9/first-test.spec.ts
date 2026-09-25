import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test('student can sign in', async ({ page }) => {
  // Arrange: open the page
  await page.setContent(signInPage);

  // Act: do what a user would do
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: check the expected result
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page).toHaveTitle('QA Academy - Dashboard');
});
