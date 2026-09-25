// Add up prices and apply an optional discount (in percent)
function calculateTotal(prices: number[], discountPercent: number = 0): number {
  let total = 0;
  for (const price of prices) {
    total += price;
  }
  return total - (total * discountPercent) / 100;
}

const cart: number[] = [499, 1299, 202];
console.log(`Total: ${calculateTotal(cart)}`);
console.log(`With 10% off: ${calculateTotal(cart, 10)}`);
console.log(`Empty cart: ${calculateTotal([])}`);
