// Turn text into a whole-number quantity, or throw an error
function parseQuantity(text: string): number {
  const quantity = Number(text);
  if (Number.isNaN(quantity)) {
    throw new Error(`Not a number: "${text}"`);
  }
  if (quantity < 1) {
    throw new Error(`Quantity must be at least 1, got ${quantity}`);
  }
  return quantity;
}

const inputs: string[] = ['2', 'abc', '0', '5'];
let total = 0;

for (const input of inputs) {
  try {
    const quantity = parseQuantity(input);
    total += quantity;
    console.log(`OK: ${quantity}`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Rejected: ${error.message}`);
    }
  }
}
console.log(`Total quantity: ${total}`);
