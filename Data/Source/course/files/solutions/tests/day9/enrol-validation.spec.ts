import { test, expect } from '@playwright/test';
import { enrolPage } from './practice-pages';

test('TC-301 name is required', async ({ page }) => {
  await page.setContent(enrolPage);
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Course').selectOption('API Testing');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toHaveText('Name is required');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
});

test('TC-302 a course must be chosen', async ({ page }) => {
  await page.setContent(enrolPage);
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toHaveText('Please choose a course');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');
});
