import { test } from '@playwright/test';

test.beforeAll(async () => {
  console.log('beforeAll  - once, before the first test in this file');
});

test.beforeEach(async () => {
  console.log('  beforeEach - before every test');
});

test.afterEach(async () => {
  console.log('  afterEach  - after every test, passed or failed');
});

test.afterAll(async () => {
  console.log('afterAll   - once, after the last test in this file');
});

test('first test', async () => {
  console.log('    first test');
});

test.describe('a group', () => {
  test.beforeEach(async () => {
    console.log('    group beforeEach - only for tests in this group, after the outer one');
  });

  test('second test', async () => {
    console.log('      second test');
  });
});
