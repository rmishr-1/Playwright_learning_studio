import { test, expect } from '@playwright/test';

// The login page from lesson P2, as text
const loginPage = `
  <title>My Shop - Log in</title>
  <h1>Welcome back</h1>
  <label for="email">Email</label>
  <input id="email" type="email" placeholder="you@example.com">
  <label for="password">Password</label>
  <input id="password" type="password">
  <button class="btn-primary">Log in</button>
  <a href="/forgot">Forgot password?</a>
`;

test('a tour of the DOM', async ({ page }) => {
  await page.setContent(loginPage);                    // load the page into the tab

  // Ask the page questions, the way a user would describe things
  console.log('Tab title:', await page.title());
  console.log('Heading text:', await page.getByRole('heading').textContent());
  console.log('Button text:', await page.getByRole('button').textContent());
  console.log('Link goes to:', await page.getByRole('link').getAttribute('href'));
  console.log('Email placeholder:', await page.getByLabel('Email').getAttribute('placeholder'));

  // And check a few expected results
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
});
