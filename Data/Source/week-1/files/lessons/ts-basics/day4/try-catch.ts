const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function findElement(name: string): Promise<string> {
  await wait(100);
  if (name !== 'Log in') {
    throw new Error(`Element "${name}" not found`);   // reject the Promise with an error
  }
  return `<button>${name}</button>`;
}

async function main(): Promise<void> {
  try {
    const found = await findElement('Log in');
    console.log('Found:', found);
    await findElement('Sign up');                      // this one fails…
    console.log('This line is skipped');
  } catch (error) {
    console.log('Caught:', (error as Error).message);  // …so we jump here
  } finally {
    console.log('Clean-up always runs');               // runs whether it failed or not
  }
}

main();
