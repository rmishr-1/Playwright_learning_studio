import { test, expect } from '@playwright/test';
import { signInPage, enrolPage } from './practice-pages';

test('runs normally', async ({ page }) => {
  await page.setContent(signInPage);
  await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
});

test.skip('social sign-in with Google', async ({ page }) => {
  // Not built yet: this test is skipped and never runs
});

test('the logo is shown', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Logo check not supported on WebKit yet');
  await page.setContent(signInPage);
  await expect(page.getByAltText('QA Academy logo')).toBeVisible();
});

test.fixme('remember me keeps the student signed in', async ({ page }) => {
  // Known to be broken: don't run it until it's fixed
});

test('BUG-42: an email without a dot is accepted', async ({ page }) => {
  test.fail();       // we EXPECT this test to fail until BUG-42 is fixed
  await page.setContent(enrolPage);
  await page.getByLabel('Full name').fill('Meera Iyer');
  await page.getByLabel('Email').fill('meera@example');
  await page.getByLabel('Course').selectOption('API Testing');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();
  await expect(page.getByRole('status')).toHaveText('Enter a valid email', { timeout: 1000 });
});

test('full sign-in journey', async ({ page }) => {
  test.slow();       // give this test 3× the normal time
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
