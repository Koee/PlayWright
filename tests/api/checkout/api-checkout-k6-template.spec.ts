import path from 'path';
import { test } from '@playwright/test';
import {
    assertAllApiOrdersCreated,
    createCheckoutOrdersByDetectedApiBatch,
    detectCheckoutOrderApiRequest,
    exportCheckoutOrderApiTemplate,
    applyCheckoutApiAuthHeader,
    resolveCheckoutApiAuth,
    exportCheckoutApiPerformanceReport,
} from '../../../steps/checkout-api-performance.steps';
import { QR_READY_TIMEOUT_MS } from '../../../config/test.config';

test.describe('API Checkout k6 Template - All Websites', () => {
    // Flow guest/no-login: dung cho website cho phep mua truc tiep, khong can token.
    // Run:
    // npx playwright test tests/api/checkout/api-checkout-k6-template.spec.ts --grep "@api-template-guest" --project=si
    test('should prepare guest checkout order API template for k6 @checkout @api-template-guest', async ({ page }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS + 30000);

        const detectedOrderApi = await detectCheckoutOrderApiRequest(page, testInfo, 'guest');
        const smokeResults = await createCheckoutOrdersByDetectedApiBatch(
            page.context().request,
            detectedOrderApi,
            1,
            1,
        );
        await exportCheckoutApiPerformanceReport(
            testInfo,
            'guest',
            detectedOrderApi,
            smokeResults,
            1,
            1,
        );
        assertAllApiOrdersCreated(smokeResults, 1);

        await exportCheckoutOrderApiTemplate(
            detectedOrderApi,
            path.join('test-data', 'k6', `${testInfo.project.name}-guest-checkout-order-api-template.json`),
        );
    });

    // Flow login/with-token: dung cho website bat buoc dang nhap truoc khi dat hang.
    // Env can co: CHECKOUT_API_LOGIN_URL, CHECKOUT_API_LOGIN_BODY, CHECKOUT_API_TOKEN_PATH.
    // B2: Playwright API detect + smoke API dat hang, sau do export token/payload cho k6.
    // File template se nam trong test-data/k6/<project>-login-checkout-order-api-template.json.
    // Run:
    // npx playwright test tests/api/checkout/api-checkout-k6-template.spec.ts --grep "@api-template-login" --project=si
    test('should prepare login checkout order API template for k6 @checkout @api-template-login', async ({ page }, testInfo) => {
        test.setTimeout(QR_READY_TIMEOUT_MS + 30000);

        const authHeader = await resolveCheckoutApiAuth(page.context().request, 'login');
        const detectedOrderApi = applyCheckoutApiAuthHeader(
            await detectCheckoutOrderApiRequest(page, testInfo, 'login'),
            authHeader,
        );
        const smokeResults = await createCheckoutOrdersByDetectedApiBatch(
            page.context().request,
            detectedOrderApi,
            1,
            1,
        );
        await exportCheckoutApiPerformanceReport(
            testInfo,
            'login',
            detectedOrderApi,
            smokeResults,
            1,
            1,
        );
        assertAllApiOrdersCreated(smokeResults, 1);

        await exportCheckoutOrderApiTemplate(
            detectedOrderApi,
            path.join('test-data', 'k6', `${testInfo.project.name}-login-checkout-order-api-template.json`),
        );
    });
});
