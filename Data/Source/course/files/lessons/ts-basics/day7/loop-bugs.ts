// Three loop bugs. Run this file and compare the output with the comments.
const browsers: string[] = ['chromium', 'firefox', 'webkit'];

// Intended: print each browser once, numbered 0 to 2
for (let i = 0; i <= browsers.length; i++) {
  console.log(`Browser ${i}: ${browsers[i]}`);
}

// Intended: print the browser NAMES
for (const browser in browsers) {
  console.log(`Testing on ${browser}`);
}

// Intended: a failed test prints only "Investigate"
const status: string = 'failed';
switch (status) {
  case 'failed':
    console.log('Investigate');
  case 'passed':
    console.log('All good');
    break;
}
