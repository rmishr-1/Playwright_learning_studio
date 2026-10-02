import { test, expect } from '@playwright/test';
import { checkoutPage } from './checkout-page';

test('Playwright waits for the Pay now button by itself', async ({ page }) => {
  await page.setContent(checkoutPage);                                   // open the page
  await page.getByRole('button', { name: 'Pay now' }).click();           // the button doesn't exist yet — Playwright waits
  await expect(page.locator('#status')).toHaveText('Payment successful'); // check the result
});
