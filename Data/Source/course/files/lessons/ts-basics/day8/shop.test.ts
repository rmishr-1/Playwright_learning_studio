// Import the runner's functions, and the shared test data
import { test, expectEqual, run } from './lib/runner.ts';
import { products, type Product } from './data/products.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('cart total adds up', async () => {
  let total = 0;
  for (const product of products) {
    total += product.price;
  }
  expectEqual(total, 13297);
});

test('headset is found by name', async () => {
  await sleep(100);                                  // pretend the search takes time
  const found: Product | undefined = products.find((p) => p.name === 'Headset');
  expectEqual(found?.price, 1799);
});

test('every product is in stock', async () => {
  const allInStock = products.every((p) => p.inStock);
  expectEqual(allInStock, true);                     // the Webcam isn't: this test fails
});

await run();
