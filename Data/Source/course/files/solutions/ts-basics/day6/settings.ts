const credentials: [string, string] = ['qa@example.com', 'Test@123'];
const settings = {
  baseUrl: 'https://staging.shop.example.com',
  browsers: ['chromium', 'webkit'],
  retries: 2,
  credentials,          // short for credentials: credentials
};

// Object destructuring: pull properties out by name
const { baseUrl, browsers, retries } = settings;
// Array destructuring: pull items out by position
const [user] = settings.credentials;

console.log(`Testing ${baseUrl} on ${browsers.length} browsers (${browsers.join(', ')})`);
console.log(`Retries: ${retries}`);
console.log(`User: ${user}`);
