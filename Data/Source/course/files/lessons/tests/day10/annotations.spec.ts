import { test, expect } from '@playwright/test';
import { loginPage } from '../day9/practice-pages';

test('runs everywhere', async ({ page }) => {
  await page.setContent(loginPage);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('skipped on WebKit only', async ({ page, browserName }) => {
  // Conditional skip: imagine a known Safari-only issue
  test.skip(browserName === 'webkit', 'Known Safari issue BUG-123');
  await page.setContent(loginPage);
  await expect(page.getByLabel('Remember me')).not.toBeChecked();
});

test.skip('password reset link', async ({ page }) => {
  // Not built yet — skipped for everyone
});

test.fixme('sign in with Google', async ({ page }) => {
  // The test itself needs work — shows as "fixme" in the report
});
