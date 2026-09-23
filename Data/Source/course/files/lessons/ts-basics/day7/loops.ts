const results = ['pass', 'pass', 'skip', 'fail', 'pass'];

// continue: skip the rest of THIS round, go to the next item
for (const result of results) {
  if (result === 'skip') {
    continue;
  }
  console.log('Counted:', result);
}

// break: stop the whole loop immediately
for (let i = 0; i < results.length; i++) {
  if (results[i] === 'fail') {
    console.log(`First failure at position ${i}`);
    break;
  }
}
