// Values read from the page — always text
const itemCountText = '4';
const unitPriceText = '250';
const totalText = '1000';

// Convert to numbers
const itemCount = Number(itemCountText);
const unitPrice = Number(unitPriceText);
const pageTotal = Number(totalText);

// Calculate and compare
const expectedTotal = itemCount * unitPrice;
console.log(`Expected total: ${expectedTotal}`);
console.log(`Page total: ${pageTotal}`);
console.log(`Totals match: ${pageTotal === expectedTotal}`);
