// Each page we want to check after a deployment
type PageCheck = {
  path: string;
  expectedTitle: string;
  critical: boolean;      // critical pages block the release if broken
};

const pages: PageCheck[] = [
  { path: '/', expectedTitle: 'Home', critical: true },
  { path: '/login', expectedTitle: 'Sign in', critical: true },
  { path: '/help', expectedTitle: 'Help centre', critical: false },
  { path: '/about', expectedTitle: 'About us', critical: false },
];

// A function that describes one check as a line of text
function describeCheck(check: PageCheck, index: number): string {
  const marker = check.critical ? '!' : ' ';                  // mark critical pages
  return `${index + 1}. [${marker}] open ${check.path} → expect title "${check.expectedTitle}"`;
}

// A function that counts how many checks are critical
function countCritical(checks: PageCheck[]): number {
  let count = 0;
  for (const check of checks) {
    if (check.critical) {
      count++;
    }
  }
  return count;
}

console.log('Smoke checklist');
for (let i = 0; i < pages.length; i++) {
  console.log(describeCheck(pages[i], i));
}
console.log(`${countCritical(pages)} of ${pages.length} checks are release-blocking`);
