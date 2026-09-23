// A type alias describes the shape of an object once, so we can reuse it
type User = {
  name: string;
  email: string;
  age: number;
  isAdmin: boolean;
  phone?: string;          // ? = optional property (may be missing)
};

const testUser: User = {
  name: 'Asha Verma',
  email: 'asha@example.com',
  age: 29,
  isAdmin: false,
};

console.log(testUser.name);        // read a property with a dot
console.log(testUser['email']);    // or with square brackets
testUser.age = 30;                 // change a property
console.log(testUser);
console.log(testUser.phone);       // optional and not set → undefined
