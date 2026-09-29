// The shape of one product
type Product = {
  name: string;
  price: number;
  badge?: string;     // optional
};

const products: Product[] = [
  { name: 'Monitor', price: 8999, badge: 'Bestseller' },
  { name: 'Webcam', price: 2499 },
  { name: 'Headset', price: 1799, badge: 'New' },
];

const first = products[0];
const second = products[1];
const last = products[products.length - 1];

console.log(`${products.length} products`);
console.log(`First: ${first.name} - ₹${first.price} [${first.badge ?? 'no badge'}]`);
console.log(`Second: ${second.name} - ₹${second.price} [${second.badge ?? 'no badge'}]`);
console.log(`Last: ${last.name} - ₹${last.price} [${last.badge ?? 'no badge'}]`);
