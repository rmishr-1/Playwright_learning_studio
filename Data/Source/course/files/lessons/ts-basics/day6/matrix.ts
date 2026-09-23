// Only these three browser names are allowed
type BrowserName = 'chromium' | 'firefox' | 'webkit';

// The browsers we test on
const browsers: BrowserName[] = ['chromium', 'firefox'];
browsers.push('webkit');                        // add one more

// Login credentials as a tuple: [email, password]
const validLogin: [string, string] = ['asha@example.com', 'Secret@123'];
const [email, password] = validLogin;          // unpack the tuple into two variables

// Pages to check
const pagesToCheck: string[] = ['/home', '/products', '/cart'];

const runsNeeded = browsers.length * pagesToCheck.length;

console.log(`Browsers: ${browsers.join(', ')}`);
console.log(`Logging in as ${email} (password has ${password.length} characters)`);
console.log(`First page: ${pagesToCheck[0]}, last page: ${pagesToCheck[pagesToCheck.length - 1]}`);
console.log(`Total page checks: ${runsNeeded}`);
