import { test, expect } from '@playwright/test';
import { slowPage } from './slow-page';

for (const name of ['cart', 'search', 'profile', 'checkout']) {
  test(`${name} page loads`, async ({ page }) => {
    await page.setContent(slowPage);
    await expect(page.locator('#done')).toHaveText('Done');
  });
}
