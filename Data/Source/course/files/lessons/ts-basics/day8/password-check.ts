// One job per function: small, named, reusable checks

// Does the text contain at least one digit?
function hasDigit(text: string): boolean {
  return text.split('').some((ch) => '0123456789'.includes(ch));
}

// Does the text contain at least one upper-case letter?
function hasUpperCase(text: string): boolean {
  return text.split('').some((ch) => ch !== ch.toLowerCase());
}

// Return every rule the password breaks (an empty list = valid)
function validatePassword(password: string): string[] {
  if (password === '') {
    return ['a password'];                  // early return: nothing else to check
  }
  const problems: string[] = [];
  if (password.length < 8) {
    problems.push('at least 8 characters');
  }
  if (!hasDigit(password)) {
    problems.push('a digit');
  }
  if (!hasUpperCase(password)) {
    problems.push('an upper-case letter');
  }
  return problems;
}

// Test data: each case says what we EXPECT
type PasswordCase = { input: string; shouldBeValid: boolean };
const cases: PasswordCase[] = [
  { input: 'Secret@123', shouldBeValid: true },
  { input: 'short1A', shouldBeValid: false },
  { input: 'alllowercase1', shouldBeValid: false },
  { input: '', shouldBeValid: false },
  { input: 'Valid2Password', shouldBeValid: true },
];

let passed = 0;
for (const testCase of cases) {
  const problems = validatePassword(testCase.input);
  const isValid = problems.length === 0;
  const ok = isValid === testCase.shouldBeValid;   // did reality match the expectation?
  if (ok) {
    passed++;
  }
  const details = isValid ? 'valid' : `needs ${problems.join(', ')}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} "${testCase.input}" -> ${details}`);
}
console.log(`${passed}/${cases.length} cases behaved as expected`);
