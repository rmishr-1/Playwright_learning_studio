// Reusable helpers for our "tests"

// Build a unique-looking test email from a name and a number
export function buildEmail(name: string, id: number, domain: string = 'example.com'): string {
  return `${name.toLowerCase()}.${id}@${domain}`;
}

// Turn milliseconds into readable text: 1500 → "1.5s"
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${ms / 1000}s`;
}

// A default export: the main settings object of this module
const settings = {
  baseUrl: 'https://shop.example.com',
  defaultTimeout: 30000,
};
export default settings;
