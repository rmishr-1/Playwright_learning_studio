const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function click(label: string): Promise<void> {
  await wait(200);                     // clicking takes a moment
  console.log(`   clicked "${label}"`);
}

async function withoutAwait(): Promise<void> {
  console.log('WITHOUT await:');
  click('Log in');                     // ❌ no await — we don't wait for the click
  console.log('   checking the dashboard…   ← too early!');
}

async function withAwait(): Promise<void> {
  console.log('WITH await:');
  await click('Log in');               // ✅ wait until the click is done
  console.log('   checking the dashboard…   ← correct order');
}

async function main(): Promise<void> {
  await withoutAwait();
  await wait(300);                     // let the forgotten click finish printing
  await withAwait();
}

main();
