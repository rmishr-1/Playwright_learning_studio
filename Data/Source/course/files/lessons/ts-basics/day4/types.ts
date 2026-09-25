// Annotated types — written by us
const testCaseId: string = 'TC-101';
const durationInSeconds: number = 4.2;
const passed: boolean = true;

// Inferred types — TypeScript works them out from the values
const browser = 'chromium';
const retries = 0;
const isHeadless = false;

// typeof tells us the type while the program runs
console.log(testCaseId, '->', typeof testCaseId);
console.log(durationInSeconds, '->', typeof durationInSeconds);
console.log(passed, '->', typeof passed);
console.log(browser, '->', typeof browser);
console.log(retries, '->', typeof retries);
console.log(isHeadless, '->', typeof isHeadless);
