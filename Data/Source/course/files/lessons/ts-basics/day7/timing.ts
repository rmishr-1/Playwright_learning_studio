// Page-load times measured by a performance check (milliseconds)
const loadTimesMs: number[] = [420, 1850, 5200];

// for...of: run the block once for each value in the list
for (const timeMs of loadTimesMs) {
  // if / else if / else: the first condition that is true wins
  let rating: string;
  if (timeMs < 1000) {
    rating = 'fast';
  } else if (timeMs < 3000) {
    rating = 'acceptable';
  } else {
    rating = 'too slow';
  }
  console.log(`${timeMs} ms: ${rating}`);
}

// switch: choose an action for each result status
type Status = 'passed' | 'failed' | 'skipped' | 'timedOut';
const statuses: Status[] = ['passed', 'failed', 'timedOut', 'skipped'];

for (const status of statuses) {
  switch (status) {
    case 'passed':
      console.log('passed: nothing to do');
      break;
    case 'failed':
    case 'timedOut':                          // two cases share one block
      console.log(`${status}: open the trace and investigate`);
      break;
    default:                                   // anything not listed above
      console.log(`${status}: check why it was skipped`);
  }
}
