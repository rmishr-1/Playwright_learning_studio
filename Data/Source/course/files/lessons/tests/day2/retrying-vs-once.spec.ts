import { test, expect } from '@playwright/test';
import { settingsPage } from './settings-page';

test('web-first assertion: keeps checking until "Saved!" appears', async ({ page }) => {
  await page.setContent(settingsPage);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#message')).toHaveText('Saved!');          // retries for up to 5 seconds
});

test('one-shot check: looks once, too early, and fails', async ({ page }) => {
  await page.setContent(settingsPage);
  await page.getByRole('button', { name: 'Save' }).click();
  const textRightNow = await page.locator('#message').textContent();   // read the text ONE time
  expect(textRightNow).toBe('Saved!');                                  // no retrying — fails
});
