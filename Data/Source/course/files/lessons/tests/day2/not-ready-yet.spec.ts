import { test, expect } from '@playwright/test';

// The "Place order" button starts DISABLED and is covered by a "Saving…" overlay.
// After 1 second the button is enabled; after 2 seconds the overlay disappears.
const orderPage = `
  <h1>Your order</h1>
  <button id="place" disabled>Place order</button>
  <div id="overlay" style="position:fixed; inset:0; background:rgba(255,255,255,0.8)">Saving…</div>
  <p id="result"></p>
  <script>
    setTimeout(() => (document.getElementById('place').disabled = false), 1000);
    setTimeout(() => document.getElementById('overlay').remove(), 2000);
    document.getElementById('place').onclick = () => {
      document.getElementById('result').textContent = 'Order placed';
    };
  </script>
`;

test('click waits until the button can really be clicked', async ({ page }) => {
  await page.setContent(orderPage);
  await page.getByRole('button', { name: 'Place order' }).click();   // waits for: enabled + not covered
  await expect(page.locator('#result')).toHaveText('Order placed');
});
