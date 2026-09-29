// Text read from an order page (page text often has stray spaces)
const priceText = '  ₹1,499 ';
const orderUrl = 'https://shop.example.com/orders/10452?tab=details';

// Clean the price: remove the currency symbol and every comma, then convert
const cleaned = priceText.trim().replace('₹', '').replaceAll(',', '');
const price = Number(cleaned);
console.log(`Cleaned: "${cleaned}" = ${price} (${typeof price})`);
console.log(`With 18% tax: ${(price * 1.18).toFixed(2)}`);

// Split text into an array of parts
const parts = orderUrl.split('/');
console.log(parts);
const orderId = parts[4].split('?')[0];            // '10452?tab=details' → '10452'
console.log(`Order id: ${orderId}`);

// A value that may be missing
let coupon: string | undefined;                    // no coupon applied yet
console.log(`Coupon: ${coupon ?? 'none'}`);
coupon = 'WELCOME10';
console.log(`Coupon: ${coupon ?? 'none'}`);
