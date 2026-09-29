// A pretend browser. Like Playwright's, every action takes time and returns a Promise.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let currentUrl = 'about:blank';

async function goto(url: string): Promise<void> {
  await sleep(150);                       // loading a page takes a while
  currentUrl = url;
  console.log(`goto ${url}`);
}

async function fill(field: string, value: string): Promise<void> {
  await sleep(50);
  console.log(`fill ${field} = ${value}`);
}

async function click(button: string): Promise<void> {
  await sleep(100);
  if (button === 'Log in') {
    currentUrl = '/dashboard';           // clicking Log in opens the dashboard
  }
  console.log(`click ${button}`);
}

async function getUrl(): Promise<string> {
  await sleep(10);
  return currentUrl;                      // async functions can give back a value too
}

// The "test": each step waits for the one before it
console.log('TEST: user can log in');
await goto('/login');
await fill('Email', 'asha@example.com');
await fill('Password', 'Secret@123');
await click('Log in');

const url = await getUrl();               // await unwraps Promise<string> into a string
console.log(url === '/dashboard' ? 'PASSED: on /dashboard' : `FAILED: on ${url}`);
