type Product = {
  name: string;
  price: number;
  inStock: boolean;
};

const keyboard: Product = {
  name: 'Mechanical Keyboard',
  price: '2499',            // bug 1
  inStock: 'yes',           // bug 2
};

const quantity: number = 2;
const maxQuantity = 5;
maxQuantity = 10;           // bug 3

let browser: 'chromium' | 'firefox' | 'webkit' = 'chrome';   // bug 4

const total: string = keyboard.price * quantity;             // bug 5
console.log(`Total for ${quantity}: ${total}`);
