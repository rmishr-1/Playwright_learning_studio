import { test, expect } from '@playwright/test';
import { loginPage } from './practice-shop';

test('TC-102 login with a wrong password', async ({ page }) => {
  await page.setContent(loginPage);                                                   // Step 1: open the login page
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();    // Expected: heading shown

  await page.getByLabel('Email').fill('asha@example.com');                            // Step 2: enter email
  await page.getByLabel('Password').fill('WrongPass1');                               // Step 3: wrong password
  await page.getByRole('button', { name: 'Log in' }).click();                         // Step 4: click Log in

  await expect(page).toHaveTitle('My Shop - Log in');                                 // Expected: still on login
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();    // Expected: heading still shown
});
