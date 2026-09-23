// timeout has a DEFAULT value; tag is OPTIONAL (may be undefined)
function describeTest(title: string, timeout: number = 30000, tag?: string): string {
  const tagText = tag ? ` ${tag}` : '';        // add the tag only if one was given
  return `${title}${tagText} (timeout ${timeout / 1000}s)`;
}

console.log(describeTest('Login works'));
console.log(describeTest('Checkout completes', 60000));
console.log(describeTest('Search returns results', 30000, '@smoke'));
