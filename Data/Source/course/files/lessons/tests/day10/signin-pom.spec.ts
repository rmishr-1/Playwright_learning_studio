import { test, expect } from '../../fixtures';
import { student, wrongPassword } from '../../test-data/users';
import { signInMessages } from '../../test-data/messages';

test('valid student reaches the dashboard', { tag: '@smoke' }, async ({ signInPage, page }) => {
  await signInPage.signIn(student.email, student.password);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('wrong password is rejected', async ({ signInPage }) => {
  await signInPage.signIn(wrongPassword.email, wrongPassword.password);
  await expect(signInPage.message).toHaveText(signInMessages.invalid);
});

test('empty form shows a message', async ({ signInPage }) => {
  await signInPage.signIn('', '');
  await expect(signInPage.message).toHaveText(signInMessages.empty);
});
