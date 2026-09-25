function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A pretend "find a button" step that fails for unknown buttons
async function findButton(name: string): Promise<string> {
  await sleep(100);
  if (name !== 'Log in') {
    throw new Error(`Button "${name}" not found`);   // stop and report a problem
  }
  return `<button>${name}</button>`;
}

try {
  const button = await findButton('Log in');
  console.log(`Found: ${button}`);
  await findButton('Sign up');                       // this one throws…
  console.log('This line is skipped');
} catch (error) {
  // …so the program jumps here. error has the type unknown: check it first.
  if (error instanceof Error) {
    console.log(`Caught: ${error.message}`);
  }
} finally {
  console.log('Clean-up always runs');               // runs whether it failed or not
}

console.log('The program carries on');
