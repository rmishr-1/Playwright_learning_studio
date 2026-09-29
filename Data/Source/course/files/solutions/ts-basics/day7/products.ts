type Product = { name: string; price: number; inStock: boolean };
const products: Product[] = [
  { name: 'Monitor', price: 8999, inStock: true },
  { name: 'Webcam', price: 2499, inStock: false },
  { name: 'Headset', price: 1799, inStock: true },
  { name: 'Laptop Stand', price: 1299, inStock: true },
];

const inStockNames = products.filter((product) => product.inStock).map((product) => product.name);
const firstCheap = products.find((product) => product.price < 2000);
const anyOutOfStock = products.some((product) => !product.inStock);
const allPriced = products.every((product) => product.price > 0);

console.log(`In stock: ${inStockNames.join(', ')}`);
console.log(`First under 2000: ${firstCheap?.name ?? 'none'}`);
console.log(`Any out of stock? ${anyOutOfStock}`);
console.log(`All priced? ${allPriced}`);
