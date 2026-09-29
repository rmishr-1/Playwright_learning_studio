const summaryText = 'Items: 3 | Total: ₹12,450 | Status: Shipped';

// Cut into the three parts
const parts = summaryText.split(' | ');           // ['Items: 3', 'Total: ₹12,450', 'Status: Shipped']

// Take the value after ': ' in each part
const itemsText = parts[0].split(': ')[1];        // '3'
const totalText = parts[1].split(': ')[1];        // '₹12,450'
const status = parts[2].split(': ')[1];           // 'Shipped'

// Convert to numbers
const items = Number(itemsText);
const total = Number(totalText.replace('₹', '').replaceAll(',', ''));

console.log(`Items: ${items}`);
console.log(`Total: ${total}`);
console.log(`Status: ${status}`);
console.log(`Average item price: ${total / items}`);
