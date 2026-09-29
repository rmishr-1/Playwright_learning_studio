// Check candidate passwords against the sign-up rules
const candidates: string[] = ['Secret@123', 'short1A', 'alllowercase1', 'NoDigitsHere', ''];

for (const password of candidates) {
  if (password === '') {
    console.log('(empty) -> skipped: nothing to check');
    continue;                                  // jump straight to the next password
  }

  // Look at each character once
  let hasDigit = false;
  let hasUpper = false;
  for (const ch of password) {
    if ('0123456789'.includes(ch)) {
      hasDigit = true;
    } else if (ch !== ch.toLowerCase()) {     // only upper-case letters change when lower-cased
      hasUpper = true;
    }
  }

  // Collect every rule that fails
  const problems: string[] = [];
  if (password.length < 8) {
    problems.push('at least 8 characters');
  }
  if (!hasDigit) {
    problems.push('a digit');
  }
  if (!hasUpper) {
    problems.push('an upper-case letter');
  }

  const verdict = problems.length === 0 ? 'valid' : `needs ${problems.join(', ')}`;
  console.log(`${password} -> ${verdict}`);
}
