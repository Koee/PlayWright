import { test } from '@playwright/test';
import {
    completeCheckoutOrdersConcurrently,
    completeCheckoutOrdersSequentially,
    getCheckoutOrderFailures,
} from '../../../steps/checkout-bulk.steps';
import {
    BULK_CHECKOUT_ORDER_COUNT,
    PERFORMANCE_CHECKOUT_ORDER_COUNT,
    QR_READY_TIMEOUT_MS,
} from '../../../config/test.config';

test.describe('Checkout Bulk Orders - All Websites', () => {
    // Chay tung don lan luot: moi don tao browser context/page rieng, xong don hien tai moi chay don tiep theo.
    // Run only sequential checkout:
    // npx playwright test tests/ui/checkout/checkout-bulk-orders.spec.ts --grep "@sequential"
    test(`should complete checkout ${BULK_CHECKOUT_ORDER_COUNT} times and capture each order result @checkout @bulk @sequential`, async ({ browser }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS * (BULK_CHECKOUT_ORDER_COUNT + 1));
        const results = await completeCheckoutOrdersSequentially(browser, testInfo, BULK_CHECKOUT_ORDER_COUNT);
        const failures = getCheckoutOrderFailures(results);

        if (failures.length > 0) {
            throw new Error([
                `${failures.length}/${BULK_CHECKOUT_ORDER_COUNT} checkout orders failed.`,
                ...failures,
            ].join('\n'));
        }
    });

    // Chay performance dong thoi: tao nhieu browser context/page rieng va submit nhieu don cung mot luc.
    // Run only concurrent performance checkout:
    // npx playwright test tests/ui/checkout/checkout-bulk-orders.spec.ts --grep "@performance"
    test(`should submit ${PERFORMANCE_CHECKOUT_ORDER_COUNT} checkout orders at the same time @checkout @bulk @performance`, async ({ browser }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS * (PERFORMANCE_CHECKOUT_ORDER_COUNT + 1));

        const results = await completeCheckoutOrdersConcurrently(browser, testInfo, PERFORMANCE_CHECKOUT_ORDER_COUNT);
        const failures = getCheckoutOrderFailures(results);

        if (failures.length > 0) {
            throw new Error([
                `${failures.length}/${PERFORMANCE_CHECKOUT_ORDER_COUNT} concurrent checkout orders failed.`,
                ...failures,
            ].join('\n'));
        }
    });
});
