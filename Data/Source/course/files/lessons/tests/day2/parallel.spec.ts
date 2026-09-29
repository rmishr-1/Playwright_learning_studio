import { test, expect } from '@playwright/test';

// Four independent tests. Each one opens a page that takes 3 seconds to show its result.
const slowPage = `
  <p id="done"></p>
  <script>setTimeout(() => (document.getElementById('done').textContent = 'Done'), 3000);</script>
`;

for (const name of ['cart', 'search', 'profile', 'checkout']) {
  test(`${name} page loads`, async ({ page }) => {
    await page.setContent(slowPage);
    await expect(page.locator('#done')).toHaveText('Done');
  });
}
