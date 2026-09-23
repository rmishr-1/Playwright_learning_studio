// Business rule: 8+ characters, at least one digit, at least one uppercase letter
function validatePassword(password: string): string[] {
  const problems: string[] = [];

  if (password.length < 8) {
    problems.push('too short');
  }
  if (!/[0-9]/.test(password)) {          // /[0-9]/ = "any digit" pattern
    problems.push('needs a digit');
  }
  if (!/[A-Z]/.test(password)) {          // /[A-Z]/ = "any uppercase letter" pattern
    problems.push('needs an uppercase letter');
  }
  return problems;                        // an empty list means the password is valid
}

// Test data: each case says what we EXPECT
type PasswordCase = {
  input: string;
  shouldBeValid: boolean;
};

const cases: PasswordCase[] = [
  { input: 'Secret123', shouldBeValid: true },
  { input: 'short1A', shouldBeValid: false },
  { input: 'alllowercase1', shouldBeValid: false },
  { input: 'NoDigitsHere', shouldBeValid: false },
  { input: 'Valid2Password', shouldBeValid: true },
];

let passed = 0;
for (const testCase of cases) {
  const problems = validatePassword(testCase.input);
  const isValid = problems.length === 0;
  const ok = isValid === testCase.shouldBeValid;          // did reality match the expectation?
  if (ok) {
    passed++;
  }
  const details = isValid ? 'valid' : problems.join(', ');
  console.log(`${ok ? '✓' : '✗'} "${testCase.input}" → ${details}`);
}

console.log(`${passed}/${cases.length} cases behaved as expected`);
