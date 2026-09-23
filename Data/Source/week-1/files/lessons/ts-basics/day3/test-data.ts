// Describe the shape of our test data once
type RegistrationData = {
  fullName: string;
  email: string;
  age: number;
  country: string;
  acceptsTerms: boolean;
};

// One test-data record (like one row in a test-data sheet)
const newCustomer: RegistrationData = {
  fullName: 'Meera Iyer',
  email: 'meera.iyer@example.com',
  age: 27,
  country: 'India',
  acceptsTerms: true,
};

// Build some values from the data
const firstName = newCustomer.fullName.split(' ')[0];   // split the name at the space, take the first part
const expectedWelcome = `Welcome, ${firstName}!`;

// Print a readable summary
console.log('--- Test data: new customer ---');
console.log(`Name:    ${newCustomer.fullName}`);
console.log(`Email:   ${newCustomer.email}`);
console.log(`Adult:   ${newCustomer.age >= 18}`);
console.log(`Terms:   ${newCustomer.acceptsTerms ? 'accepted' : 'NOT accepted'}`);
console.log(`Expected message after sign-up: "${expectedWelcome}"`);
