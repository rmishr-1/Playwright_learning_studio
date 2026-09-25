import { test, expect } from '@playwright/test';
import { loginPage } from './practice-shop';

test('TC-101 successful login', async ({ page }) => {
  await page.setContent(loginPage);                                                   // Step 1: open the login page
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();    // Expected: heading shown

  await page.getByLabel('Email').fill('asha@example.com');                            // Step 2: enter email
  await page.getByLabel('Password').fill('Secret@123');                               // Step 3: enter password
  await page.getByRole('button', { name: 'Log in' }).click();                         // Step 4: click Log in

  await expect(page).toHaveTitle('My Shop - Dashboard');                              // Expected: dashboard opens
  await expect(page.getByText('Hello, Asha')).toBeVisible();                          // Expected: greeting shown
});
