const testId: string = 'TC-205';          // fix 1: closing quote
const didPass: boolean = true;            // fix 2: a boolean, not text
const duration: number = 3.5;
console.log('Test: ' + testId);           // fix 3: lowercase console
console.log('Passed: ' + didPass);        // fix 4: didPass, with a capital P
console.log('Duration: ' + duration + ' seconds');
