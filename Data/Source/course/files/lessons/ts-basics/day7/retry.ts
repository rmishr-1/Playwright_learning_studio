// Retry a flaky check until it succeeds, but never more than maxAttempts times
const maxAttempts: number = 5;
const serverReplies: string[] = ['timeout', 'timeout', 'ok'];   // what happens on each attempt

let attempt = 0;
let succeeded = false;

while (attempt < maxAttempts) {
  const reply = serverReplies[attempt] ?? 'ok';   // past the end of the list? assume 'ok'
  attempt++;
  console.log(`Attempt ${attempt}: ${reply}`);
  if (reply === 'ok') {
    succeeded = true;
    break;                                        // stop looping: we're done
  }
}

console.log(succeeded ? `Succeeded after ${attempt} attempts` : `Gave up after ${maxAttempts} attempts`);

// do...while: the body always runs at least once
let pagesVisited = 0;
do {
  pagesVisited++;
  console.log(`Visited page ${pagesVisited}`);
} while (pagesVisited < 1);
