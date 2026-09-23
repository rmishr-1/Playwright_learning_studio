// default import (no braces) + named imports (with braces)
import settings, { buildEmail, formatDuration } from './helpers.ts';

const users = ['Asha', 'Ravi'];

for (let i = 0; i < users.length; i++) {
  console.log(buildEmail(users[i], i + 1));
}
console.log(buildEmail('Meera', 3, 'test.org'));

console.log(`Open ${settings.baseUrl}/login`);
console.log(`Default timeout: ${formatDuration(settings.defaultTimeout)}`);
console.log(`Quick action: ${formatDuration(250)}`);
