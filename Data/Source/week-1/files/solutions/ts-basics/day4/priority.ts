type Priority = 'P1' | 'P2' | 'P3' | 'P4';

// Return the SLA (in hours) for a bug priority
function slaHours(priority: Priority): number {
  switch (priority) {
    case 'P1':
      return 4;
    case 'P2':
      return 24;
    case 'P3':
      return 72;
    case 'P4':
      return 168;
  }
}

const priorities: Priority[] = ['P1', 'P3', 'P4'];
for (const p of priorities) {
  console.log(`${p} must be fixed within ${slaHours(p)} hours`);
}
