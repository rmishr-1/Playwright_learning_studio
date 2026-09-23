import { test, expect, type Page } from '@playwright/test';
import { enrolPage } from '../day9/practice-pages';

// Helper: fill the form (empty strings leave a field blank) and accept the terms
async function fillForm(page: Page, name: string, email: string, course: string): Promise<void> {
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  if (course !== '') {
    await page.getByLabel('Course').selectOption(course);
  }
  await page.getByLabel('I accept the terms').check();
}

test.describe('Enrolment page', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(enrolPage);
  });

  test('R1: shows the correct title and heading', { tag: '@smoke' }, async ({ page }) => {
    await expect(page).toHaveTitle('QA Academy - Enrol');
    await expect(page.getByRole('heading', { name: 'Enrol in a course' })).toBeVisible();
  });

  test('R2: Enrol button follows the terms checkbox', { tag: '@regression' }, async ({ page }) => {
    const enrol = page.getByRole('button', { name: 'Enrol now' });
    const terms = page.getByLabel('I accept the terms');
    await expect(enrol).toBeDisabled();
    await terms.check();
    await expect(enrol).toBeEnabled();
    await terms.uncheck();
    await expect(enrol).toBeDisabled();
  });

  test('R3: name is required', { tag: '@regression' }, async ({ page }) => {
    await fillForm(page, '', 'asha@example.com', 'API Testing');
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Name is required');
  });

  test('R4: email must contain @', { tag: '@regression' }, async ({ page }) => {
    await fillForm(page, 'Asha Verma', 'asha.example.com', 'API Testing');
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Enter a valid email');
  });

  test('R5: a course must be chosen', { tag: '@regression' }, async ({ page }) => {
    await fillForm(page, 'Asha Verma', 'asha@example.com', '');
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Please choose a course');
  });

  test('R6: valid enrolment shows a confirmation', { tag: '@smoke' }, async ({ page }) => {
    await fillForm(page, 'Asha Verma', 'asha@example.com', 'API Testing');
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByRole('status')).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
  });

  test('R7: seats left goes down by one', { tag: '@regression' }, async ({ page }) => {
    await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
    await fillForm(page, 'Asha Verma', 'asha@example.com', 'Playwright Basics');
    await page.getByRole('button', { name: 'Enrol now' }).click();
    await expect(page.getByTestId('seats')).toHaveText('Seats left: 11');
  });
});
