import { test, expect } from '@playwright/test';

// Same pretend shop page as in mock-api.spec.ts
const productsPage = `
  <meta charset="utf-8">
  <h1>Products</h1>
  <ul id="list"><li>Loading…</li></ul>
  <script>
    fetch('/api/products')
      .then((response) => response.json())
      .then((products) => {
        document.getElementById('list').innerHTML =
          products.map((p) => '<li>' + p.name + ' - ₹' + p.price + '</li>').join('');
      })
      .catch(() => (document.getElementById('list').innerHTML = '<li>Could not load products</li>'));
  </script>
`;

test('waits for a slow product list', async ({ page }) => {
  await page.route('https://shop.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: productsPage }));

  // The "server" answers 2 seconds late
  await page.route('https://shop.test/api/products', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));   // pretend the server is slow
    await route.fulfill({ json: [{ name: 'Tablet', price: 19999 }] });
  });

  await page.goto('https://shop.test/');
  // The list shows "Loading…" for 2 seconds; the web-first assertion keeps retrying until the product appears
  await expect(page.getByRole('listitem')).toHaveText('Tablet - ₹19999');
});
