const maxChecks: number = 5;
const statusOnEachCheck: string[] = ['Pending', 'Pending', 'Processing', 'Shipped'];

let checks = 0;
let status = '';

while (checks < maxChecks && status !== 'Shipped') {
  status = statusOnEachCheck[checks] ?? 'Pending';
  checks++;
  console.log(`Check ${checks}: ${status}`);
}

console.log(status === 'Shipped' ? `Shipped after ${checks} checks` : `Still not shipped after ${checks} checks`);
