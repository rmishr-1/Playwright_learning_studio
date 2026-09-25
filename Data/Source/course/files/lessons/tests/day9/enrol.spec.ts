import { test, expect } from '@playwright/test';
import { enrolPage } from './practice-pages';

test('enrol button is disabled until the terms are accepted', async ({ page }) => {
  await page.setContent(enrolPage);
  const terms = page.getByRole('checkbox', { name: 'I accept the terms' });
  const enrolButton = page.getByRole('button', { name: 'Enrol now' });

  await expect(enrolButton).toBeDisabled();
  await terms.check();
  await expect(enrolButton).toBeEnabled();
  await terms.uncheck();
  await expect(enrolButton).toBeDisabled();
});

test('student can enrol in a course', async ({ page }) => {
  await page.setContent(enrolPage);

  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Course').selectOption('API Testing');                 // choose by visible text
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 11');
  await expect(page.getByLabel('Course')).toHaveValue('api');                   // the option's value
});

test('an email without @ is rejected', async ({ page }) => {
  await page.setContent(enrolPage);

  await page.getByLabel('Full name').fill('Ravi Kumar');
  await page.getByLabel('Email').fill('ravi.example.com');
  await page.getByLabel('Course').selectOption('Playwright Basics');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();

  await expect(page.getByRole('status')).toContainText('valid email');
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');        // no seat was taken
});
