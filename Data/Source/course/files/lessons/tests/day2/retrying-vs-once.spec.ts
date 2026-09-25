import { test, expect } from '@playwright/test';

// After clicking Save, the page shows "Saved!" — but only 1 second later,
// like a real page waiting for the server.
const settingsPage = `
  <h1>Settings</h1>
  <button>Save</button>
  <p id="message"></p>
  <script>
    document.querySelector('button').onclick = () => {
      setTimeout(() => (document.getElementById('message').textContent = 'Saved!'), 1000);
    };
  </script>
`;

test('web-first assertion: keeps checking until "Saved!" appears', async ({ page }) => {
  await page.setContent(settingsPage);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#message')).toHaveText('Saved!');          // retries for up to 5 seconds
});

test('one-shot check: looks once, too early, and fails', async ({ page }) => {
  await page.setContent(settingsPage);
  await page.getByRole('button', { name: 'Save' }).click();
  const textRightNow = await page.locator('#message').textContent();   // read the text ONE time
  expect(textRightNow).toBe('Saved!');                                  // no retrying — fails
});
