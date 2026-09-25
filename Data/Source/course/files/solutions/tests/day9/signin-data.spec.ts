import { test, expect } from '@playwright/test';
import { signInPage } from './practice-pages';

type SignInCase = { id: string; email: string; password: string; expectedMessage: string };

const cases: SignInCase[] = [
  { id: 'TC-221', email: '', password: '', expectedMessage: 'Please enter your email and password' },
  { id: 'TC-222', email: 'student@qa.academy', password: '', expectedMessage: 'Please enter your email and password' },
  { id: 'TC-223', email: 'student@qa.academy', password: 'learn@123', expectedMessage: 'Invalid email or password' },
  { id: 'TC-224', email: 'someone@qa.academy', password: 'Learn@123', expectedMessage: 'Invalid email or password' },
  { id: 'TC-225', email: 'student@qa.academy', password: 'Learn@123', expectedMessage: 'Signing in…' },
];

// One test per row: each gets its own title, its own fresh page, and its own result
for (const c of cases) {
  test(`${c.id} sign-in with "${c.email}" / "${c.password}"`, async ({ page }) => {
    await page.setContent(signInPage);
    await page.getByLabel('Email').fill(c.email);
    await page.getByLabel('Password').fill(c.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText(c.expectedMessage);
  });
}
