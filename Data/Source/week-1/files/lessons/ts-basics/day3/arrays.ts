// An array of strings. Two ways to write the type: string[] or Array<string>
const browsers: string[] = ['chromium', 'firefox', 'webkit'];

console.log(browsers[0]);        // first item — counting starts at 0!
console.log(browsers[2]);        // third item
console.log(browsers.length);    // how many items

browsers.push('msedge');         // add an item at the end
console.log(browsers);
console.log(browsers.includes('firefox'));   // is "firefox" in the list?

const retryDelays: number[] = [1000, 2000, 4000];
console.log(retryDelays[1]);
