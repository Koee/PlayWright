import { test } from '@playwright/test';
import { runCopyFunctionality } from '../../../steps/copy.steps';
import { QR_READY_TIMEOUT_MS } from '../../../config/test.config';

test.describe('Copy QR Content - All Websites', () => {
    test.setTimeout(QR_READY_TIMEOUT_MS * 4);

    test('should copy generated QR content for each configured tab @copy @slow', async ({ page }, testInfo) => {
        await runCopyFunctionality(page, testInfo);
    });
});
