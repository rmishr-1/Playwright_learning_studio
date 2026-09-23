const isCI: boolean = false;                              // fix 1: boolean, not text
const retries: number = isCI ? 2 : 0;                     // fix 2: number on both sides
const workers: number = isCI ? 1 : 4;
const headless: boolean = true;                           // fix 3: boolean, not text
let baseURL: string | undefined;
const finalUrl: string = baseURL ?? 'http://localhost:3000';   // fix 4: the result is a string
console.log(`Retries: ${retries} | Workers: ${workers} | Headless: ${headless} | Base URL: ${finalUrl}`);
