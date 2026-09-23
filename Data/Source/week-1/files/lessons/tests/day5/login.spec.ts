import { test, expect } from '@playwright/test';
import { loginPage } from './practice-pages';

test.describe('Sign in page', () => {
  // Runs before EACH test in this group: every test starts on a fresh sign-in page
  test.beforeEach(async ({ page }) => {
    await page.setContent(loginPage);
  });

  test('shows the sign-in form', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeEmpty();
    await expect(page.getByPlaceholder('you@example.com')).toHaveAttribute('type', 'email');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('valid user reaches the dashboard', { tag: '@smoke' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Signing in…');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);   // three course weeks listed
  });

  test('wrong password shows an error', { tag: '@regression' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeHidden();
  });

  test('empty form shows a validation message', { tag: '@regression' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('login-message')).toHaveText('Please enter your email and password');
  });

  test('pressing Enter submits the form', { tag: '@regression' }, async ({ page }) => {
    await page.getByLabel('Email').fill('student@qa.academy');
    await page.getByLabel('Password').fill('Learn@123');
    await page.getByLabel('Password').press('Enter');   // keyboard instead of mouse
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('remember-me can be ticked and unticked', { tag: '@regression' }, async ({ page }) => {
    const rememberMe = page.getByRole('checkbox', { name: 'Remember me' });   // a locator in a variable
    await expect(rememberMe).not.toBeChecked();
    await rememberMe.check();
    await expect(rememberMe).toBeChecked();
    await rememberMe.uncheck();
    await expect(rememberMe).not.toBeChecked();
  });
});
