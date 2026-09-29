const isCI: boolean = 'false';
const retries = isCI ? 2 : 0;
const workers = isCI ? 1 : 4;
const headless: boolean = true;
headless = !isCI;
const baseUrl = http://localhost:3000;
console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${baseURL}`);
