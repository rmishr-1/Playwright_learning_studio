import { test, expect } from '@playwright/test';
import { enrolPage } from './practice-pages';

test('TC-303 the course list has four options', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Course list is being redesigned for Firefox');
  await page.setContent(enrolPage);
  await expect(page.getByRole('option')).toHaveCount(4);   // three courses + the "choose" prompt
});

test.fixme('TC-304 a student can pay by card', async ({ page }) => {
  // Payment page not built yet
});

test('BUG-51: an email with nothing after @ is accepted', async ({ page }) => {
  test.fail();
  await page.setContent(enrolPage);
  await page.getByLabel('Full name').fill('Ravi Kumar');
  await page.getByLabel('Email').fill('ravi@');
  await page.getByLabel('Course').selectOption('Playwright Basics');
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Enrol now' }).click();
  await expect(page.getByRole('status')).toHaveText('Enter a valid email', { timeout: 1000 });
});
