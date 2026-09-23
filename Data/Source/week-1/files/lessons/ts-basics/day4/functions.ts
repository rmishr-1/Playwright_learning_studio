// name     parameters (inputs, with types)       return type
function calculatePassRate(passed: number, total: number): number {
  return (passed / total) * 100;              // return sends a value back to the caller
}

// A function that returns nothing uses the type void
function printHeader(title: string): void {
  console.log(`===== ${title} =====`);
}

// Calling (using) the functions
printHeader('Nightly run');
const rate = calculatePassRate(45, 50);       // arguments: the actual values
console.log(`Pass rate: ${rate}%`);
console.log(`Smoke pass rate: ${calculatePassRate(9, 10)}%`);
