import { test, expect } from '@playwright/test';

// A practice checkout page. The "Pay now" button is added 2 seconds after the page loads,
// like a real page waiting for a payment service to respond.
const checkoutPage = `
  <h1>Checkout</h1>
  <p id="status">Loading payment options…</p>
  <script>
    setTimeout(() => {
      document.getElementById('status').textContent = 'Ready to pay';
      const button = document.createElement('button');
      button.textContent = 'Pay now';
      button.onclick = () => {
        document.getElementById('status').textContent = 'Payment successful';
      };
      document.body.appendChild(button);
    }, 2000);
  </script>
`;

test('Playwright waits for the Pay now button by itself', async ({ page }) => {
  await page.setContent(checkoutPage);                                   // open the page
  await page.getByRole('button', { name: 'Pay now' }).click();           // the button doesn't exist yet — Playwright waits
  await expect(page.locator('#status')).toHaveText('Payment successful'); // check the result
});
