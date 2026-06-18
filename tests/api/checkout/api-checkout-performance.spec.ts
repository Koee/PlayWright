import { test } from '@playwright/test';
import {
    assertAllApiOrdersCreated,
    createCheckoutOrdersByDetectedApiBatch,
    detectCheckoutOrderApiRequest,
    applyCheckoutApiAuthHeader,
    resolveCheckoutApiAuth,
    exportCheckoutApiPerformanceReport,
} from '../../../steps/checkout-api-performance.steps';
import {
    API_PERFORMANCE_CHECKOUT_BATCH_SIZE,
    API_PERFORMANCE_CHECKOUT_ORDER_COUNT,
    QR_READY_TIMEOUT_MS,
} from '../../../config/test.config';

test.describe('API Checkout Performance - All Websites', () => {
    // Flow guest/no-login: website cho phep mua truc tiep, khong can token.
    // UI chi dung de detect request dat hang that, sau do tao don bang API theo batch.
    // Run:
    // npx playwright test tests/api/checkout/api-checkout-performance.spec.ts --grep "@api-performance-guest" --project=si
    test(`should create ${API_PERFORMANCE_CHECKOUT_ORDER_COUNT} guest checkout orders by detected API batch @checkout @api-performance-guest`, async ({ page }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS + API_PERFORMANCE_CHECKOUT_ORDER_COUNT * 3000);

        const detectedOrderApi = await detectCheckoutOrderApiRequest(page, testInfo, 'guest');
        const results = await createCheckoutOrdersByDetectedApiBatch(
            page.context().request,
            detectedOrderApi,
            API_PERFORMANCE_CHECKOUT_ORDER_COUNT,
            API_PERFORMANCE_CHECKOUT_BATCH_SIZE,
        );

        await exportCheckoutApiPerformanceReport(
            testInfo,
            'guest',
            detectedOrderApi,
            results,
            API_PERFORMANCE_CHECKOUT_ORDER_COUNT,
            API_PERFORMANCE_CHECKOUT_BATCH_SIZE,
        );
        assertAllApiOrdersCreated(results, API_PERFORMANCE_CHECKOUT_ORDER_COUNT);
    });

    // Flow login/with-token: website bat buoc dang nhap truoc khi dat hang.
    // Env can co: CHECKOUT_API_LOGIN_URL, CHECKOUT_API_LOGIN_BODY, CHECKOUT_API_TOKEN_PATH.
    // Mac dinh tao 200 don voi batch 20 request/luc de tranh mo nhieu UI gay treo may.
    // Run:
    // npx playwright test tests/api/checkout/api-checkout-performance.spec.ts --grep "@api-performance-login" --project=si
    test(`should create ${API_PERFORMANCE_CHECKOUT_ORDER_COUNT} login checkout orders by detected API batch @checkout @api-performance-login`, async ({ page }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS + API_PERFORMANCE_CHECKOUT_ORDER_COUNT * 3000);

        const authHeader = await resolveCheckoutApiAuth(page.context().request, 'login');
        const detectedOrderApi = applyCheckoutApiAuthHeader(
            await detectCheckoutOrderApiRequest(page, testInfo, 'login'),
            authHeader,
        );
        const results = await createCheckoutOrdersByDetectedApiBatch(
            page.context().request,
            detectedOrderApi,
            API_PERFORMANCE_CHECKOUT_ORDER_COUNT,
            API_PERFORMANCE_CHECKOUT_BATCH_SIZE,
        );

        await exportCheckoutApiPerformanceReport(
            testInfo,
            'login',
            detectedOrderApi,
            results,
            API_PERFORMANCE_CHECKOUT_ORDER_COUNT,
            API_PERFORMANCE_CHECKOUT_BATCH_SIZE,
        );
        assertAllApiOrdersCreated(results, API_PERFORMANCE_CHECKOUT_ORDER_COUNT);
    });
});
