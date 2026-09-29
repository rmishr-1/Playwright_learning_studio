// The shape of one registration test case
type Registration = {
  fullName: string;
  email: string;
  age: number;
  country: string;
  acceptsTerms: boolean;
  phone?: string;              // optional: some users leave it empty
};

const newCustomer: Registration = {
  fullName: 'Meera Iyer',
  email: 'meera.iyer@example.com',
  age: 27,
  country: 'India',
  acceptsTerms: true,
};

// Read properties with a dot (or square brackets)
console.log(`Name: ${newCustomer.fullName}`);
console.log(`Email: ${newCustomer['email']}`);

// Change a property: the object is const, but its contents can change
newCustomer.age = 28;
console.log(`Age next year: ${newCustomer.age}`);

// An optional property that wasn't given is undefined
console.log(`Phone: ${newCustomer.phone}`);
console.log(`Phone to type: ${newCustomer.phone ?? '(leave empty)'}`);

// Destructuring: take out the properties you need
const { fullName, country } = newCustomer;
console.log(`${fullName} lives in ${country}`);
