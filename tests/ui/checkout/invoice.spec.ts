import { test } from '@playwright/test';
import { completeCheckoutFlow } from '../../../steps/checkout.steps';
import { QR_READY_TIMEOUT_MS } from '../../../config/test.config';

test.describe('Checkout Flow Automation - All Websites', () => {
    test('should complete checkout and capture invoice @checkout @smoke', async ({ page }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS);
        await completeCheckoutFlow(page, testInfo);
    });
});
