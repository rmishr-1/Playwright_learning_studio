import { test, expect } from '@playwright/test';

test('same test, any browser', async ({ page, browserName }) => {
  // browserName tells us which engine is running this copy of the test
  await page.setContent('<h1>Hello from an automated test!</h1>');
  console.log(`Running in: ${browserName}`);
  await expect(page.getByRole('heading')).toHaveText('Hello from an automated test!');
});
