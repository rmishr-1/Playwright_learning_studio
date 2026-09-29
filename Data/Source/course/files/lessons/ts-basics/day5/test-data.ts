// Test data for a registration test
const firstName = 'Meera';
const lastName = 'Iyer';
const email = '  Meera.Iyer@Example.com  ';   // typed by a user, with extra spaces and capitals
const age: number = 27;
const acceptsTerms = true;

// Values built from the test data
const fullName = `${firstName} ${lastName}`;
const cleanEmail = email.trim().toLowerCase();          // what a good app should store
const expectedWelcome = `Welcome, ${firstName}!`;
const profileUrl = `https://shop.example.com/users/${cleanEmail}`;

// Print a summary
console.log(`Full name: ${fullName} (${fullName.length} characters)`);
console.log(`Clean email: ${cleanEmail}`);
console.log(`Adult: ${age >= 18}`);
console.log(`Terms accepted: ${acceptsTerms}`);
console.log(`Expected message: ${expectedWelcome}`);
console.log(`Profile page: ${profileUrl}`);
