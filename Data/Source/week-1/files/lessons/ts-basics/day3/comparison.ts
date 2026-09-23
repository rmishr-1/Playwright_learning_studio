const expectedCount: number = 3;   // e.g. how many items we expect in the cart
const actualCount: number = 3;     // e.g. how many items the page shows
const fromTextBox = '3';           // text from an input box is always a string!

console.log(actualCount === expectedCount);    // same value, same type
console.log(actualCount > 5);
console.log(actualCount !== 0);

// Why we avoid == : it converts types behind your back
console.log(fromTextBox == (actualCount as any));    // loose: '3' becomes 3 → true
console.log(fromTextBox === (actualCount as any));   // strict: string vs number → false
