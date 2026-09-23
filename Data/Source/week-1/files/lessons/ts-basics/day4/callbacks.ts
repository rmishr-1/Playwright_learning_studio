// runStep receives a NAME and a FUNCTION, prints the name, then calls the function
function runStep(name: string, action: () => void): void {
  console.log(`▶ ${name}`);
  action();                       // run the function we were given
}

// Pass an arrow function directly as the second argument
runStep('Open the home page', () => {
  console.log('  …navigating to /home');
});

runStep('Search for "mouse"', () => {
  console.log('  …typing into the search box');
});
