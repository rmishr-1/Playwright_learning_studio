import { test, expect } from '@playwright/test';
import { loginPage } from './practice-shop';

test('the browser reports events back to the test', async ({ page }) => {
  // Listen: whenever the page writes to its console, print it here too
  page.on('console', (message) => {
    console.log(`📨 from the browser: ${message.text()}`);
  });

  await page.setContent(loginPage);
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();

  // The page stays on the login screen after a failed login
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
