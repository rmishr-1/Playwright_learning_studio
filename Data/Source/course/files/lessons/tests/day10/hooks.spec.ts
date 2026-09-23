import { test, expect } from '@playwright/test';

test.beforeAll(async () => {
  console.log('beforeAll  → once, before the tests');
});

test.beforeEach(async ({ page }) => {
  console.log('beforeEach → before each test');
  await page.setContent('<h1>Hooks demo</h1>');
});

test.afterEach(async () => {
  console.log('afterEach  → after each test');
});

test.afterAll(async () => {
  console.log('afterAll   → once, after the tests');
});

test('first test', async ({ page }) => {
  console.log('test body  → first test');
  await expect(page.getByRole('heading')).toHaveText('Hooks demo');
});

test('second test', async ({ page }) => {
  console.log('test body  → second test');
  await expect(page.getByRole('heading')).toBeVisible();
});
