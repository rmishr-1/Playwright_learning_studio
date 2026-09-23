import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

test('user can log out', async ({ page }) => {
  // Sign in
  await page.setContent(loginPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Log out
  await page.getByRole('button', { name: 'Log out' }).click();

  // Check the signed-out page
  await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
  await expect(page.getByText('See you soon!')).toBeVisible();
  await expect(page).toHaveTitle(/Signed out/);
});
