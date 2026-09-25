import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

// TC-201 · valid credentials open the dashboard
test('TC-201 valid sign-in shows the dashboard', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Signing in…');             // shown straight away
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(); // appears 0.8 s later
  await expect(page.getByText('Welcome back, Student!')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);                      // three courses listed
});

// TC-202 · empty fields
test('TC-202 empty fields show a message', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Please enter your email and password');
  await expect(page).toHaveTitle('QA Academy - Sign in');                       // still on the sign-in page
});

// TC-203 · wrong password
test('TC-203 wrong password is rejected', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page.getByLabel('Email')).toHaveValue('student@qa.academy');   // the email is kept
});

// TC-204 · the Remember me checkbox
test('TC-204 remember me can be ticked and unticked', async ({ page }) => {
  await page.setContent(signInPage);
  const rememberMe = page.getByRole('checkbox', { name: 'Remember me' });

  await expect(rememberMe).not.toBeChecked();
  await rememberMe.check();
  await expect(rememberMe).toBeChecked();
  await rememberMe.uncheck();
  await expect(rememberMe).not.toBeChecked();
});

// TC-205 · sign out
test('TC-205 student can sign out', async ({ page }) => {
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByLabel('Password').press('Enter');                            // Enter submits the form too

  await page.getByRole('button', { name: 'Log out' }).click();                 // auto-waits for the dashboard
  await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
});
