const baseUrl = 'https://shop.example.com';
const category = 'Laptops';
const brand = 'Acme Tech';
const page = 2;
const sortBy = 'price';

// 1. URL-friendly pieces
const brandSlug = brand.toLowerCase().replace(' ', '-');   // 'acme-tech'
const categorySlug = category.toLowerCase();                // 'laptops'

// 2 + 3. Build the URL and the title with template literals
const url = `${baseUrl}/c/${categorySlug}?brand=${brandSlug}&page=${page}&sort=${sortBy}`;
const title = `[P${page}] ${category} by ${brand}, sorted by ${sortBy}`;

// 4. Print
console.log(url);
console.log(title);
