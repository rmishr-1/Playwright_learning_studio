// Convert text from the page to a number before comparing
const badgeText = '3';
const expectedItems = 3;
const badgeNumber = Number(badgeText);            // '3' → 3

console.log(badgeNumber === expectedItems);       // now both are numbers
console.log(typeof badgeText, typeof badgeNumber);

// Conversions you'll need when reading prices and counts
console.log(Number('1499') + 1);                  // a real number: adds
console.log(Number('₹1,499'));                    // not a plain number: NaN
console.log(String(expectedItems) + ' items');    // number → text
