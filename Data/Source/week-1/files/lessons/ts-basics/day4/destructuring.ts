interface TestContext {
  page: string;
  browserName: string;
  retry: number;
}

const context: TestContext = { page: 'Page#1', browserName: 'firefox', retry: 0 };

// Long way
const page1 = context.page;

// Destructuring: pull out the properties you need, by name
const { page, browserName } = context;
console.log(page1, page, browserName);

// Destructuring directly in a function's parameter list
function runTest({ page, browserName }: TestContext): void {
  console.log(`Running on ${browserName} with ${page}`);
}
runTest(context);
