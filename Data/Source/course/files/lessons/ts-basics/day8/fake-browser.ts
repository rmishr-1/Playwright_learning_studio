const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// --- pretend browser API (Playwright gives you real versions of these) ---
let currentUrl = 'about:blank';

async function goto(url: string): Promise<void> {
  await wait(150);
  currentUrl = url;
  console.log(`  goto ${url}`);
}

async function fill(field: string, value: string): Promise<void> {
  await wait(50);
  console.log(`  fill ${field} = ${value}`);
}

async function click(button: string): Promise<void> {
  await wait(100);
  if (button === 'Log in') {
    currentUrl = '/dashboard';           // clicking Log in takes us to the dashboard
  }
  console.log(`  click ${button}`);
}

// --- the "test" ---
async function loginTest(): Promise<void> {
  console.log('TEST: user can log in');
  await goto('/login');
  await fill('Email', 'asha@example.com');
  await fill('Password', 'Secret@123');
  await click('Log in');

  // the "assertion"
  if (currentUrl === '/dashboard') {
    console.log('✓ PASSED — landed on /dashboard');
  } else {
    console.log(`✗ FAILED — expected /dashboard but was ${currentUrl}`);
  }
}

loginTest();
