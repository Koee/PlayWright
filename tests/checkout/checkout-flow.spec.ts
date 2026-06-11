import { test } from '@playwright/test';
import { completeCheckoutFlow } from '../../steps/checkout.steps';

test.describe('Checkout Flow Automation - All Websites', () => {
    test('complete checkout flow', async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await completeCheckoutFlow(page, testInfo);
    });
});