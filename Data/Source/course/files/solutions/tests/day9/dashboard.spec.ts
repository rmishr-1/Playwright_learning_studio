import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

test("TC-210 dashboard lists the student's courses", async ({ page }) => {
  // Steps 1–3: sign in
  await page.setContent(signInPage);
  await page.getByLabel('Email').fill('student@qa.academy');
  await page.getByLabel('Password').fill('Learn@123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Expected: the dashboard, with a greeting and three courses in order
  await expect(page).toHaveTitle('QA Academy - Dashboard');
  await expect(page.getByText('Welcome back, Student!')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your courses' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveText(['Playwright Basics', 'API Testing', 'Performance Testing']);
});
