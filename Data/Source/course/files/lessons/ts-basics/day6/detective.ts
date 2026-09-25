// Five type mistakes in test data. Check this file and read each error.
type Product = {
  name: string;
  price: number;
  inStock: boolean;
  discount?: number;
};
type BrowserName = 'chromium' | 'firefox' | 'webkit';

const keyboard: Product = {
  name: 'Mechanical Keyboard',
  price: '2499',
  inStock: true,
};

const mouse: Product = {
  name: 'Wireless Mouse',
  price: 799,
};

const browsers: BrowserName[] = ['chromium', 'firefox'];
browsers.push('safari');

const login: [string, string] = ['asha@example.com', 12345];

const sizes: number[] = [38, 40, 42];
sizes.push('44');
