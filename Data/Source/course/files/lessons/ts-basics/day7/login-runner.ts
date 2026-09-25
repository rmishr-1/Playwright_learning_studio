// A mini data-driven test: check every login case against the app's rules
type LoginCase = {
  id: string;
  username: string;
  password: string;
  shouldSucceed: boolean;
  expectedError?: string;
};

const loginCases: LoginCase[] = [
  { id: 'TC-01', username: 'standard_user', password: 'secret_sauce', shouldSucceed: true },
  { id: 'TC-02', username: 'locked_out_user', password: 'secret_sauce', shouldSucceed: false,
    expectedError: 'Sorry, this user has been locked out.' },
  { id: 'TC-03', username: 'standard_user', password: 'wrong', shouldSucceed: false,
    expectedError: 'Username and password do not match.' },
  { id: 'TC-04', username: '', password: 'secret_sauce', shouldSucceed: false,
    expectedError: 'Username is required' },
  { id: 'TC-05', username: 'standard_user', password: '', shouldSucceed: false,
    expectedError: 'Password is required.' },
];

let passed = 0;
let failed = 0;

for (const testCase of loginCases) {
  // 1. Pretend to be the app: which error would it show? (undefined = logged in)
  let actualError: string | undefined;
  if (testCase.username === '') {
    actualError = 'Username is required';
  } else if (testCase.password === '') {
    actualError = 'Password is required';
  } else if (testCase.username === 'locked_out_user') {
    actualError = 'Sorry, this user has been locked out.';
  } else if (testCase.password !== 'secret_sauce') {
    actualError = 'Username and password do not match.';
  }

  // 2. Compare what happened with what the test case expected
  const loggedIn = actualError === undefined;
  if (loggedIn === testCase.shouldSucceed && actualError === testCase.expectedError) {
    passed++;
    console.log(`PASS ${testCase.id}`);
  } else {
    failed++;
    console.log(`FAIL ${testCase.id}: expected "${testCase.expectedError ?? 'login'}", got "${actualError ?? 'login'}"`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
