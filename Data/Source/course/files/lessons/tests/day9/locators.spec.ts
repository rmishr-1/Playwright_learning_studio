import { test, expect } from '@playwright/test';
import { signInPage, enrolPage } from './practice-pages';

test('recommended locators on the sign-in page', async ({ page }) => {
  await page.setContent(signInPage);

  // By role (and accessible name): the first choice
  await expect(page.getByRole('heading', { name: 'Sign in to QA Academy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();

  // By label: form fields
  await expect(page.getByLabel('Password')).toBeEmpty();

  // By placeholder: fields with hint text
  await expect(page.getByPlaceholder('you@example.com')).toBeEditable();

  // By text: non-interactive text
  await expect(page.getByText('Sign in to QA')).toBeVisible();                 // part of the text is enough

  // By alt text (images) and by title attribute
  await expect(page.getByAltText('QA Academy logo')).toBeVisible();
  await expect(page.getByTitle('Reset your password')).toHaveText('Forgot password?');
});

test('matching rules, strictness and lists on the enrol page', async ({ page }) => {
  await page.setContent(enrolPage);

  // By test id: data-testid="seats"
  await expect(page.getByTestId('seats')).toHaveText('Seats left: 12');

  // Names match case-insensitively and by substring… unless exact: true
  await expect(page.getByRole('button', { name: 'enrol' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'enrol', exact: true })).toHaveCount(0);

  // Two text boxes match: count them, or narrow down to one
  const textboxes = page.getByRole('textbox');
  await expect(textboxes).toHaveCount(2);
  await expect(textboxes.first()).toHaveAttribute('id', 'name');
  await expect(textboxes.nth(1)).toHaveAttribute('placeholder', 'you@example.com');

  // Options inside the course list; filter by text
  const options = page.getByRole('option');
  await expect(options).toHaveCount(4);
  await expect(options.filter({ hasText: 'API' })).toHaveText('API Testing');
});
