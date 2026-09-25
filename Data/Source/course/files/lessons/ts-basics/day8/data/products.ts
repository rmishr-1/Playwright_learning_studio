// Test data, shared by any test file that imports it
export type Product = { name: string; price: number; inStock: boolean };

export const products: Product[] = [
  { name: 'Monitor', price: 8999, inStock: true },
  { name: 'Webcam', price: 2499, inStock: false },
  { name: 'Headset', price: 1799, inStock: true },
];
