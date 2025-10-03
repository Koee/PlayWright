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