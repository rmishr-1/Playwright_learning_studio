import { test, expect } from '@playwright/test';
import { orderPage } from './order-page';

test('click waits until the button can really be clicked', async ({ page }) => {
  await page.setContent(orderPage);
  await page.getByRole('button', { name: 'Place order' }).click();   // waits for: enabled + not covered
  await expect(page.locator('#result')).toHaveText('Order placed');
});
