import { test, expect } from '@playwright/test';

// A tiny practice page. The "Pay now" button is added 2 seconds after the page loads.
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
  // Load the practice page into the browser tab
  await page.setContent(checkoutPage);

  // Click the button — it does not exist yet! Playwright waits until it appears.
  await page.getByRole('button', { name: 'Pay now' }).click();

  // Check the result — this assertion also retries automatically
  await expect(page.locator('#status')).toHaveText('Payment successful');
});
