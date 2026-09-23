type Product = {
  name: string;
  price: number;
  inStock: boolean;
};

const keyboard: Product = {
  name: 'Mechanical Keyboard',
  price: 2499,              // fix 1: a number, not text
  inStock: true,            // fix 2: a boolean
};

const quantity: number = 2;
let maxQuantity = 5;        // fix 3: let, because it changes
maxQuantity = 10;

let browser: 'chromium' | 'firefox' | 'webkit' = 'chromium';   // fix 4: an allowed value

const total: number = keyboard.price * quantity;               // fix 5: the result is a number
console.log(`Total for ${quantity}: ${total}`);
console.log(`Max quantity: ${maxQuantity}, browser: ${browser}`);
