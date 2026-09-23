// Test data
const firstName: string = 'Meera';
const lastName: string = 'Iyer';
const email: string = '  Meera.Iyer@Example.com  ';   // typed with extra spaces and capitals
const itemsInCart: number = 3;

// Build the values a test would check
const fullName = `${firstName} ${lastName}`;
const cleanEmail = email.trim().toLowerCase();         // what a good app should store
const welcome = `Welcome back, ${firstName}!`;
const cartLabel = `Cart (${itemsInCart})`;
const profileUrl = `https://shop.example.com/users/${cleanEmail}`;

console.log(welcome);
console.log(cartLabel);
console.log(`Full name has ${fullName.length} characters`);
console.log(`Clean email: ${cleanEmail}`);
console.log(`Profile URL: ${profileUrl}`);
console.log(`Email looks valid: ${cleanEmail.includes('@')}`);
