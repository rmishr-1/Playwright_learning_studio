// A type mistake that Node.js does NOT notice
const price: number = '499';
const quantity: number = 2;
console.log('Total:', price * quantity);
console.log('Price + 1:', price + 1);
