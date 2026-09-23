const statusCode = 404;

// Checked from top to bottom — the FIRST true condition wins, the rest are skipped
if (statusCode >= 200 && statusCode < 300) {
  console.log('Success');
} else if (statusCode >= 400 && statusCode < 500) {
  console.log('Client error — check the request');
} else if (statusCode >= 500) {
  console.log('Server error — raise a bug');
} else {
  console.log('Something else');
}

// A condition can use a truthy/falsy value directly
const couponCode = '';
if (!couponCode) {
  console.log('No coupon applied');
}
