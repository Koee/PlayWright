import { Browser, BrowserContext, TestInfo } from '@playwright/test';
import { completeCheckoutFlow } from './checkout.steps';

export type CheckoutOrderResult =
    | { runLabel: string; status: 'passed' }
    | { runLabel: string; status: 'failed'; message: string };

/**
 * Tao label theo so thu tu don hang.
 * Label nay duoc gan vao ten screenshot/report de moi lan dat hang co artifact rieng.
 */
export function buildOrderRunLabel(orderIndex: number) {
    return `order-${String(orderIndex).padStart(2, '0')}`;
}

/**
 * Tao context rieng cho tung don de khong dung chung cookie/localStorage.
 */
export async function createCheckoutOrderContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
    return browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        permissions: testInfo.project.use.permissions,
    });
}

/**
 * Chay mot lan dat hang doc lap va tu cleanup context cua order do.
 */
export async function completeIsolatedCheckoutOrder(
    browser: Browser,
    testInfo: TestInfo,
    orderIndex: number,
    labelPrefix?: string,
): Promise<CheckoutOrderResult> {
    const baseLabel = buildOrderRunLabel(orderIndex);
    const runLabel = labelPrefix ? `${labelPrefix}-${baseLabel}` : baseLabel;
    const orderContext = await createCheckoutOrderContext(browser, testInfo);
    const orderPage = await orderContext.newPage();

    try {
        await completeCheckoutFlow(orderPage, testInfo, { runLabel });
        return { runLabel, status: 'passed' };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { runLabel, status: 'failed', message };
    } finally {
        await orderContext.close().catch((error) => {
            console.warn(`WARN Could not close checkout context for ${runLabel}: ${(error as Error).message}`);
        });
    }
}

/**
 * Chay dat hang lan luot, phu hop khi tester can kiem tra flow on dinh tung don.
 */
export async function completeCheckoutOrdersSequentially(
    browser: Browser,
    testInfo: TestInfo,
    orderCount: number,
): Promise<CheckoutOrderResult[]> {
    const results: CheckoutOrderResult[] = [];

    for (let orderIndex = 1; orderIndex <= orderCount; orderIndex++) {
        results.push(await completeIsolatedCheckoutOrder(browser, testInfo, orderIndex));
    }

    return results;
}

/**
 * Chay dat hang dong thoi bang nhieu context/page rieng trong cung mot browser.
 * Dung lai ham nay cho cac test performance khac de khong can sua flow checkout performance.
 */
export async function completeCheckoutOrdersConcurrently(
    browser: Browser,
    testInfo: TestInfo,
    orderCount: number,
    labelPrefix = 'performance',
): Promise<CheckoutOrderResult[]> {
    const orderIndexes = Array.from({ length: orderCount }, (_, index) => index + 1);

    return Promise.all(
        orderIndexes.map(orderIndex => completeIsolatedCheckoutOrder(browser, testInfo, orderIndex, labelPrefix))
    );
}

export function getCheckoutOrderFailures(results: CheckoutOrderResult[]) {
    return results
        .filter((result): result is { runLabel: string; status: 'failed'; message: string } => result.status === 'failed')
        .map(result => `${result.runLabel}: ${result.message}`);
}
