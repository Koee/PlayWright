import { test } from '@playwright/test';
import { runCopyFunctionality } from '../../steps/copy.steps';

test.describe('Copy Functionality (Sao Chép - NDS) - All Websites', () => {
    test.setTimeout(360000);

    test('Copy Functionality - Sequential Tabs', async ({ page }, testInfo) => {
        await runCopyFunctionality(page, testInfo);
    });
});