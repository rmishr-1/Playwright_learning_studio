import { test, expect } from '@playwright/test';

// A page that prints the browser language and window width
const whoAmIPage = `
  <h1 id="info"></h1>
  <script>
    document.getElementById('info').textContent =
      navigator.language + ' | ' + window.innerWidth + 'px wide';
  </script>
`;

test('two contexts behave like two different devices', async ({ browser }) => {
  // Context 1: a laptop user in India
  const laptopUser = await browser.newContext({ locale: 'en-IN', viewport: { width: 1280, height: 720 } });
  // Context 2: a phone-sized user in France
  const phoneUser = await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });

  // One tab (page) in each context
  const laptopPage = await laptopUser.newPage();
  const phonePage = await phoneUser.newPage();
  await laptopPage.setContent(whoAmIPage);
  await phonePage.setContent(whoAmIPage);

  // Each context has its own settings
  await expect(laptopPage.locator('#info')).toHaveText('en-IN | 1280px wide');
  await expect(phonePage.locator('#info')).toHaveText('fr-FR | 390px wide');

  await laptopUser.close();
  await phoneUser.close();
});

test('cookies in one context are invisible to another', async ({ browser }) => {
  const customerA = await browser.newContext();
  const customerB = await browser.newContext();

  // Customer A "logs in" — we store a login cookie in context A only
  await customerA.addCookies([{ name: 'session', value: 'asha-logged-in', url: 'https://shop.example.com' }]);

  const cookiesA = await customerA.cookies();
  const cookiesB = await customerB.cookies();
  console.log('Customer A has', cookiesA.length, 'cookie(s)');
  console.log('Customer B has', cookiesB.length, 'cookie(s)');

  expect(cookiesA).toHaveLength(1); // A is logged in
  expect(cookiesB).toHaveLength(0); // B is NOT — contexts share nothing

  await customerA.close();
  await customerB.close();
});
