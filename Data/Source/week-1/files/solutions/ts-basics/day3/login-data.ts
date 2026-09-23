// The shape of one login test case
type LoginCase = {
  id: string;
  username: string;
  password: string;
  shouldSucceed: boolean;
  expectedError?: string;   // only needed for failing cases
};

const validCase: LoginCase = {
  id: 'TC-01',
  username: 'standard_user',
  password: 'secret_sauce',
  shouldSucceed: true,
};

const lockedCase: LoginCase = {
  id: 'TC-02',
  username: 'locked_out_user',
  password: 'secret_sauce',
  shouldSucceed: false,
  expectedError: 'Sorry, this user has been locked out.',
};

const loginCases: LoginCase[] = [validCase, lockedCase];

console.log(`${loginCases.length} login cases`);
console.log(`${loginCases[0].id} ${loginCases[0].username} expects success: ${loginCases[0].shouldSucceed}`);
console.log(`${loginCases[1].id} ${loginCases[1].username} expects error: ${loginCases[1].expectedError}`);
