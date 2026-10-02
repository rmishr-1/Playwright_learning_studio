import { test, expect } from '@playwright/test';
import { productsPage } from './products-page';

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
