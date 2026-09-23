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

// Try an async action up to maxAttempts times
async function retry(action: () => Promise<string>, maxAttempts: number): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();                                        // success → leave immediately
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${(error as Error).message}`);
    }
  }
  throw new Error(`Gave up after ${maxAttempts} attempts`);         // every attempt failed
}

async function main(): Promise<void> {
  const result = await retry(flakyCheck, 3);
  console.log(`Result: ${result}`);
}
main();
