const codes: number[] = [200, 201, 301, 404, 500, 503];
let errors = 0;

for (const code of codes) {
  let category: string;
  if (code >= 200 && code < 300) {
    category = 'success';
  } else if (code >= 300 && code < 400) {
    category = 'redirect';
  } else if (code >= 400 && code < 500) {
    category = 'client error';
  } else {
    category = 'server error';
  }

  if (code >= 400) {
    errors++;
  }
  console.log(`${code} -> ${category}`);
}

console.log(`Errors: ${errors}`);
