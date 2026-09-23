const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let calls = 0;
async function flakyCheck(): Promise<string> {
  calls++;
  await wait(50);
  if (calls < 3) {
    throw new Error('Service unavailable');
  }
  return `OK on call ${calls}`;
}

// TODO: write retry() here

async function main(): Promise<void> {
  const result = await retry(flakyCheck, 3);
  console.log(`Result: ${result}`);
}
main();
