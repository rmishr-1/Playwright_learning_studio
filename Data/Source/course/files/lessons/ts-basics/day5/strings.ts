const firstName: string = 'Asha';
const product = "Wireless Mouse";

// Template literal: backticks + ${ } to insert values into text
const greeting = `Hello, ${firstName}! You added ${product} to the cart.`;
console.log(greeting);

// Useful string tools
console.log(product.length);              // number of characters
console.log(product.toUpperCase());       // WIRELESS MOUSE
console.log(product.includes('Mouse'));   // does it contain "Mouse"?
console.log('  padded  '.trim());         // remove spaces at both ends
