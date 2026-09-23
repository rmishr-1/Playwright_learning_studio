const baseUrl = 'https://shop.example.com';
const category = 'Laptops & Tablets';
const page = 2;
const sortBy: 'price' | 'rating' = 'price';

// 1. Make a slug: lowercase → remove & → split into words → drop empty words → join with -
const slug = category
  .toLowerCase()
  .replace('&', '')
  .split(' ')
  .filter((word) => word !== '')
  .join('-');

// 2. Build the URL with a template literal
const url = `${baseUrl}/c/${slug}?page=${page}&sort=${sortBy}`;

// 3. Build the test title
const title = `[P${page}] ${category} sorted by ${sortBy}`;

// 4. Print
console.log(url);
console.log(title);
