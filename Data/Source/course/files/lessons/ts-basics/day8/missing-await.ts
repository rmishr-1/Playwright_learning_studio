function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function click(label: string): Promise<void> {
  await sleep(200);                               // clicking takes a moment
  console.log(`  clicked "${label}"`);
}

// 1. Without await: the program doesn't wait for the click
console.log('WITHOUT await:');
click('Log in');                                  // ❌ no await
console.log('  checking the dashboard   <- too early!');
await sleep(300);                                 // (give the forgotten click time to finish)

// 2. With await: each step finishes before the next starts
console.log('WITH await:');
await click('Log in');                            // ✅
console.log('  checking the dashboard   <- right order');

// 3. forEach doesn't wait for async callbacks
console.log('forEach:');
const pages: string[] = ['home', 'cart'];
pages.forEach(async (page) => {
  await sleep(100);
  console.log(`  checked ${page}`);
});
console.log('  all pages checked?     <- printed first!');
await sleep(200);

// 4. for...of with await does wait
console.log('for...of:');
for (const page of pages) {
  await sleep(100);
  console.log(`  checked ${page}`);
}
console.log('  all pages checked      <- right order');
