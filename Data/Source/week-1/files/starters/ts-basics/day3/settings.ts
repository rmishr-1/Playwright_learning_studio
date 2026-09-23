const isCI: boolean = 'false';
const retries: number = isCI ? 2 : '0';
const workers: number = isCI ? 1 : 4;
const headless: boolean = 'true';
let baseURL: string | undefined;
const finalUrl: number = baseURL ?? 'http://localhost:3000';
console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${finalUrl}`);
