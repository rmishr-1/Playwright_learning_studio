import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test('wrong password shows an error', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('not-my-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
});
