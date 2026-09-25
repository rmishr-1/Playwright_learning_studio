// The shape of one login test case
type LoginCase = {
  id: string;
  username: string;
  password: string;
  shouldSucceed: boolean;
  expectedError?: string;      // only failing cases have one
};

// The whole test-data sheet: an array of LoginCase objects
const loginCases: LoginCase[] = [
  { id: 'TC-01', username: 'standard_user', password: 'secret_sauce', shouldSucceed: true },
  { id: 'TC-02', username: 'locked_out_user', password: 'secret_sauce', shouldSucceed: false,
    expectedError: 'Sorry, this user has been locked out.' },
  { id: 'TC-03', username: 'standard_user', password: 'wrong', shouldSucceed: false,
    expectedError: 'Username and password do not match.' },
];

console.log(`${loginCases.length} login cases`);

const firstCase = loginCases[0];
const lastCase = loginCases[loginCases.length - 1];
console.log(`First: ${firstCase.id} (${firstCase.username}) should succeed: ${firstCase.shouldSucceed}`);
console.log(`Last: ${lastCase.id} expects "${lastCase.expectedError}"`);
console.log(`TC-01 error: ${firstCase.expectedError ?? 'none expected'}`);

// Add one more case to the sheet
loginCases.push({ id: 'TC-04', username: '', password: '', shouldSucceed: false,
  expectedError: 'Username is required' });
console.log(`Now ${loginCases.length} cases; the newest is ${loginCases[3].id}`);
