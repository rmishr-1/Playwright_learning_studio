// The same program, fixed
const baseUrl = 'https://shop.example.com';
const stagingUrl = 'https://staging.shop.example.com';   // a second const instead of reassigning

let attempts = 0;
console.log(attempts);                                    // used after it's declared

const secretToken = 'abc123';                             // declared outside the block
{
  console.log(`Inside the block: ${secretToken}`);
}
console.log(`Outside the block: ${secretToken}`);
console.log(baseUrl, stagingUrl);
