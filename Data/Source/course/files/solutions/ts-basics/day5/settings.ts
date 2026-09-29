const isCI: boolean = false;                 // fix 1: a boolean, not text
const retries = isCI ? 2 : 0;
const workers = isCI ? 1 : 4;
const headless: boolean = !isCI;             // fix 2: set it once instead of reassigning a const
const baseUrl = 'http://localhost:3000';     // fix 3: text needs quotes
console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${baseUrl}`);   // fix 4: baseUrl, not baseURL
