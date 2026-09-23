// A helper that returns a Promise which finishes after `ms` milliseconds.
// (You won't write Promises by hand in Playwright — its methods return them for you.)
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Pretend browser action: takes 300 ms, then returns the page title
async function loadPage(url: string): Promise<string> {
  await wait(300);                     // pause here until 300 ms have passed
  return `Title of ${url}`;
}

async function main(): Promise<void> {
  console.log('1. Opening page…');
  const title = await loadPage('/home'); // wait for the result
  console.log(`2. Loaded: ${title}`);
  console.log('3. Now we can check the title safely');
}

main();
