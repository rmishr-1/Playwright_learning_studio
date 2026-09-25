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

test('shows three mocked products', async ({ page }) => {
  // Serve the page
  await page.route('https://shop.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: productsPage }));

  // Mock the product list with three products
  await page.route('https://shop.test/api/products', (route) =>
    route.fulfill({ json: [
      { name: 'Monitor', price: 8999 },
      { name: 'Webcam', price: 2499 },
      { name: 'Headset', price: 1799 },
    ] }));

  await page.goto('https://shop.test/');
  await expect(page.getByRole('listitem')).toHaveCount(3);                          // exactly three items
  await expect(page.getByRole('listitem').first()).toHaveText('Monitor - ₹8999');   // first item
});
