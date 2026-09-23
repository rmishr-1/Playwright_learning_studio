// const: a value that never changes
const baseUrl = 'https://shop.example.com';

// let: a value that will change
let loginAttempts = 0;
loginAttempts = loginAttempts + 1;   // first attempt
loginAttempts = loginAttempts + 1;   // second attempt

console.log('Testing', baseUrl);
console.log('Login attempts:', loginAttempts);

// Uncomment the next line and run `npm run check -- day5/variables.ts`:
// baseUrl = 'https://other.example.com';   // ❌ Cannot assign to 'baseUrl' because it is a constant
