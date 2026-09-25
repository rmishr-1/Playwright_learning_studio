// Turn price text from a page, like '₹1,499', into the number 1499
function parsePrice(text: string): number {
  const cleaned = text.trim().replace('₹', '').replaceAll(',', '');
  return Number(cleaned);
}

// Build a test email address. domain has a default value.
function buildEmail(name: string, id: number, domain: string = 'example.com'): string {
  return `${name.toLowerCase()}.${id}@${domain}`;
}

// Show a duration in readable form. Two different return statements.
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;           // return ends the function here…
  }
  return `${ms / 1000} s`;       // …so this line only runs for 1000 ms or more
}

// A function that does something but gives nothing back: void
function logStep(step: number, action: string): void {
  console.log(`Step ${step}: ${action}`);
}

// Calling the functions
const price = parsePrice(' ₹1,499 ');
console.log(price + 1);                               // a real number now
console.log(parsePrice('₹12,450') > 10000);
console.log(buildEmail('Asha', 1));                   // uses the default domain
console.log(buildEmail('Ravi', 2, 'test.org'));       // overrides it
console.log(formatDuration(450), '|', formatDuration(2500));
logStep(1, 'Open the login page');
