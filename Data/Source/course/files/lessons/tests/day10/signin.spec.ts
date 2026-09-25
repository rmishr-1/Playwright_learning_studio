import { test, expect } from '@playwright/test';
import { serveQaAcademy } from '../../utils/practice-site';
import { student, wrongPassword } from '../../test-data/users';
import { signInMessages } from '../../test-data/messages';

test.describe('Sign-in', () => {
  // Runs before EACH test in this group: every test starts on the sign-in page
  test.beforeEach(async ({ page }) => {
    await serveQaAcademy(page);
    await page.goto('/signin');                      // baseURL + '/signin'
  });

  test('valid student reaches the dashboard', { tag: ['@smoke', '@auth'] }, async ({ page }) => {
    await test.step('Enter credentials and submit', async () => {
      await page.getByLabel('Email').fill(student.email);
      await page.getByLabel('Password').fill(student.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    });

    await test.step('See the dashboard', async () => {
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByText(`Welcome back, ${student.name}!`)).toBeVisible();
    });
  });

  test('empty form shows a message', { tag: '@validation' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText(signInMessages.empty);
  });

  test('wrong password is rejected', { tag: ['@validation', '@auth'] }, async ({ page }) => {
    await page.getByLabel('Email').fill(wrongPassword.email);
    await page.getByLabel('Password').fill(wrongPassword.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText(signInMessages.invalid);
  });
});
