const smokePages: string[] = ['/', '/products', '/cart', '/account'];

for (let i = 0; i < smokePages.length; i++) {
  const page = smokePages[i];
  const note = page === '/account' ? ' (login needed)' : '';
  console.log(`Step ${i + 1}: open ${page}${note}`);
}

console.log(`${smokePages.length} pages in the smoke checklist`);
