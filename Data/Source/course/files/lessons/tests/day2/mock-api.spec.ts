import { test, expect } from '@playwright/test';

// A pretend shop page at https://shop.test. When it loads, its JavaScript asks
// the server for the product list at /api/products and shows each product.
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

test('show products from a mocked server', async ({ page }) => {
  // Serve the page itself
  await page.route('https://shop.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: productsPage }));

  // Pretend to be the server: answer /api/products with our own test data
  await page.route('https://shop.test/api/products', (route) =>
    route.fulfill({ json: [{ name: 'Wireless Mouse', price: 799 }, { name: 'Keyboard', price: 1499 }] }));

  await page.goto('https://shop.test/');
  await expect(page.getByRole('listitem')).toHaveText(['Wireless Mouse - ₹799', 'Keyboard - ₹1499']);
});

test('show an error when the server is down', async ({ page }) => {
  await page.route('https://shop.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: productsPage }));

  // Pretend the server is broken
  await page.route('https://shop.test/api/products', (route) => route.abort());

  await page.goto('https://shop.test/');
  await expect(page.getByRole('listitem')).toHaveText('Could not load products');
});
