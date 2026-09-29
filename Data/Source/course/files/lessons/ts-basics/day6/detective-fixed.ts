// The same test data, fixed
type Product = {
  name: string;
  price: number;
  inStock: boolean;
  discount?: number;
};
type BrowserName = 'chromium' | 'firefox' | 'webkit';

const keyboard: Product = { name: 'Mechanical Keyboard', price: 2499, inStock: true };
const mouse: Product = { name: 'Wireless Mouse', price: 799, inStock: false, discount: 10 };

const browsers: BrowserName[] = ['chromium', 'firefox'];
browsers.push('webkit');

const login: [string, string] = ['asha@example.com', '12345'];

const sizes: number[] = [38, 40, 42];
sizes.push(44);

console.log(`${keyboard.name}: ₹${keyboard.price}, in stock: ${keyboard.inStock}`);
console.log(`${mouse.name}: ₹${mouse.price}, discount: ${mouse.discount ?? 0}%`);
console.log(`Browsers: ${browsers.length}, login: ${login[0]}, sizes: ${sizes.join('/')}`);
