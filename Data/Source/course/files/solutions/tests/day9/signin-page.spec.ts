import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test('TC-206 sign-in page shows everything a new visitor needs', async ({ page }) => {
  await page.setContent(signInPage);

  await expect(page).toHaveTitle('QA Academy - Sign in');
  await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
  await expect(page.getByAltText('QA Academy logo')).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeEmpty();
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
});
