// The same three loops, fixed
const browsers: string[] = ['chromium', 'firefox', 'webkit'];

for (let i = 0; i < browsers.length; i++) {
  console.log(`Browser ${i}: ${browsers[i]}`);
}

for (const browser of browsers) {
  console.log(`Testing on ${browser}`);
}

const status: string = 'failed';
switch (status) {
  case 'failed':
    console.log('Investigate');
    break;
  case 'passed':
    console.log('All good');
    break;
}
