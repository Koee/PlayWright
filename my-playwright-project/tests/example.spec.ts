/* viết riêng lẽ */

/* * import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
/// viết từng phần
test('basic test', async ({ page }) => {
  await page.goto('https://example.com');
  const title = await page.title();
  expect(title).toBe('Example Domain');
});
*/

/*Lệnh describe được dùng để nhóm các bài kiểm tra liên quan lại với nhau. Điều này giúp sắp xếp các bài kiểm tra tốt hơn, đặc biệt là khi bạn có số lượng lớn bài kiểm tra.*/

/*const { test, expect } = require('@playwright/test');
test.describe('Example Group', () => {
  test('first test', async ({ page }) => {
    await page.goto('https://example.com');
    const title = await page.title();
    expect(title).toBe('Example Domain');
  });

  test('second test', async ({ page }) => {
    await page.goto('https://example.com');
    const content = await page.textContent('h1');
    expect(content).toBe('Example Domain');
  });
});
*/

/**
 * Khẳng định được sử dụng để xác minh rằng ứng dụng hoạt động như mong đợi. Playwright sử dụng except cho các khẳng định. Hàm expect lấy một giá trị thực và cung cấp nhiều phương thức so khớp khác nhau để khẳng định dựa trên giá trị mong đợi
 * 
 */

/*const { test, expect } = require('@playwright/test');

test('assertion test', async ({ page }) => {
 await page.goto('https://example.com');
 const title = await page.title();
 expect(title).toBe('Example Domain');

 const content = await page.textContent('h1');
 expect(content).toBe('Example Domain');
});
 */

/*  Hook là các hàm được thực thi tại các thời điểm cụ thể trong vòng đời kiểm thử. Các hook phổ biến bao gồm beforeAll, afterAll, beforeEach và afterEach. */


const { test, expect } = require('@playwright/test');

test.describe('Example Group with Hooks', () => {
  test.beforeAll(async () => {
    console.log('Setup before all tests');
  });

  test.afterAll(async () => {
    console.log('Cleanup after all tests');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });

  test.afterEach(async ({ page }) => {
    await page.close();
  });

  test('test with hooks', async ({ page }) => {
    const title = await page.title();
    expect(title).toBe('Example Domain');
  });
});
