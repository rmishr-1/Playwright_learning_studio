import { test, expect } from '@playwright/test';

test('docs page has title', async ({ page }) => {
  // Open the Playwright website
  await page.goto('https://playwright.dev/');
  // Check that the tab title contains the word "Playwright"
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started opens installation', async ({ page }) => {
  // Open the Playwright website
  await page.goto('https://playwright.dev/');
  // Click the "Get started" link
  await page.getByRole('link', { name: 'Get started' }).click();
  // Check that the "Installation" heading is visible
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
