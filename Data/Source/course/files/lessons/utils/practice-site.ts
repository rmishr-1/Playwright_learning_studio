import type { Page } from '@playwright/test';
import { signInPage, enrolPage } from '../tests/day9/practice-pages';

// Stands in for a real web server: answers the browser's requests to
// https://qa-academy.test with our practice pages. A real project doesn't need this —
// its tests open the real application.
export async function serveQaAcademy(page: Page): Promise<void> {
  await page.route('https://qa-academy.test/signin', (route) =>
    route.fulfill({ contentType: 'text/html', body: signInPage }));
  await page.route('https://qa-academy.test/enrol', (route) =>
    route.fulfill({ contentType: 'text/html', body: enrolPage }));
}
