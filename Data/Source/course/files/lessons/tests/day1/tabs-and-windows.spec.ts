import { test, expect } from '@playwright/test';

// A pretend website at https://shop.test. Playwright answers the browser's
// request with this HTML, so the demo works without internet.
const shopHome = `
<title>My Shop</title>
<h1 id="greeting"></h1>
<button>Log in as Asha</button>
<script>
  const user = localStorage.getItem('user');            // remembered login (like a session)
  document.getElementById('greeting').textContent = user ? 'Hello, ' + user : 'Hello, guest';
  document.querySelector('button').onclick = () => {
    localStorage.setItem('user', 'Asha');
    document.getElementById('greeting').textContent = 'Hello, Asha';
  };
</script>
`;

test('tabs share a context, windows do not', async ({ browser }) => {
  // Two separate "incognito windows"
  const windowA = await browser.newContext();
  const windowB = await browser.newContext();
  // In both windows, answer any request to https://shop.test with our HTML page
  for (const window of [windowA, windowB]) {
    await window.route('https://shop.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: shopHome }));
  }

  // Window A, tab 1: log in
  const tab1 = await windowA.newPage();
  await tab1.goto('https://shop.test/');
  await tab1.getByRole('button', { name: 'Log in as Asha' }).click();
  await expect(tab1.getByRole('heading')).toHaveText('Hello, Asha');

  // Window A, tab 2: SAME context → already logged in
  const tab2 = await windowA.newPage();
  await tab2.goto('https://shop.test/');
  await expect(tab2.getByRole('heading')).toHaveText('Hello, Asha');

  // Window B: DIFFERENT context → a stranger to the site
  const otherTab = await windowB.newPage();
  await otherTab.goto('https://shop.test/');
  await expect(otherTab.getByRole('heading')).toHaveText('Hello, guest');

  // Count the tabs in each window, then close both windows
  console.log(`Window A has ${windowA.pages().length} tabs, window B has ${windowB.pages().length}`);
  await windowA.close();
  await windowB.close();
});
