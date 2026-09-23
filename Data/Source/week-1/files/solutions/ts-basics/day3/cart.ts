// Inputs
const unitPrice = 1299;
const quantity = 3;
const discountPercent = 10;

// Calculations
const subtotal = unitPrice * quantity;                      // 3897
const discount = (subtotal * discountPercent) / 100;        // 389.7
const afterDiscount = subtotal - discount;                  // 3507.3
const shipping = afterDiscount >= 3000 ? 0 : 99;            // free above 3000
const totalToPay = afterDiscount + shipping;

// Output
console.log(`Subtotal: ${subtotal}`);
console.log(`Discount: ${discount}`);
console.log(`After discount: ${afterDiscount}`);
console.log(`Shipping: ${shipping}`);
console.log(`Total to pay: ${totalToPay.toFixed(2)}`);
