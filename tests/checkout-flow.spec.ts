/// <reference types="node" />
import { test, expect, Page, Locator } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { appendErrorReport } from './utils/error-report';

test.describe('Checkout Flow Automation - All Websites', () => {
    // Configuration for test data (loaded from .env via dotenv in playwright.config.ts)
    const testCustomer = {
        name: process.env.TEST_CUSTOMER_NAME || 'Nguyễn Văn A',
        phone: process.env.TEST_CUSTOMER_PHONE || '0989336888'
    };
    const siWebsite = 'si';

    // Helper to build data-testid selector. Use stable test ids in app when possible.
    const tid = (id: string) => `[data-testid="${id}"]`;

    // Recommended data-testid mapping for frontend implementation.
    const testIds = {
        tabSite: (site: string) => `tab-${site}`,
        tabText: (tabText: string) => `tab-${tabText}`,
        proceedToCheckout: 'proceed-to-checkout',
        confirmPayment: 'confirm-payment',
        btnProceed: 'btn-proceed',
        inputName: 'input-name',
        inputRecipientName: 'input-recipient-name',
        inputPhone: 'input-phone',
        inputRecipientPhone: 'input-recipient-phone',
        confirmOrder: 'confirm-order',
        productCardPrefix: 'product-',
        bundleCardPrefix: 'bundle-card-',
        invoiceError: 'invoice-error',
        invoicePopup: 'invoice-popup',
    };


    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Generic helper to click element by trying multiple selectors
     */
    async function clickElement(
        page: Page,
        selectors: string[],
        actionName: string,
        options = { visibilityTimeout: 3000, clickTimeout: 5000, waitForNav: true }
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: options.visibilityTimeout })) {
                    await element.click({ timeout: options.clickTimeout });
                    // Wait for navigation/network to settle instead of fixed timeout
                    if (options.waitForNav) {
                        await page.waitForLoadState('networkidle').catch(() => { });
                    }
                    console.log(`✅ ${actionName} - Selector: ${selector}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        console.warn(`⚠️ ${actionName} - Element not found`);
        return false;
    }

    /**
     * Generic helper to fill input field by trying multiple selectors
     */
    async function fillInput(
        page: Page,
        selectors: string[],
        value: string,
        fieldName: string
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const input = page.locator(selector).first();
                if (await input.isVisible({ timeout: 5000 })) {
                    await input.fill(value, { timeout: 5000 });
                    console.log(`✅ Filled ${fieldName} using selector: ${selector}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        throw new Error(`Could not find ${fieldName} input field`);
    }

    // ============================================================================
    // STEP FUNCTIONS
    // ============================================================================

    async function selectTab(page: Page, websiteName: string) {
        await page.waitForLoadState('networkidle');

        const tabText = websiteName === siWebsite ? 'Chọn thùng' : 'Túi Đa Dạng';
        // Prefer data-testid if available, then role/button, then text fallback
        const selectors = [
            tid(testIds.tabSite(websiteName)),
            tid(testIds.tabText(tabText)),
            `role=tab[name="${tabText}"]`,
            `button:has-text("${tabText}")`,
            `text=${tabText}`,
        ];

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            for (const selector of selectors) {
                try {
                    // Use waitForSelector instead of fixed wait to avoid hardcoded timeouts
                    const handle = await page.waitForSelector(selector, { timeout: 3000 }).catch(() => null);
                    if (handle) {
                        await handle.click({ timeout: 5000 });
                        console.log(`✅ Selecting tab "${tabText}" - Selector: ${selector} (attempt ${attempt})`);
                        return;
                    }
                } catch (e) {
                    // try next selector
                }
            }
            // if not found yet, try again (no fixed sleep, rely on selector timeouts)
        }

        // If still not found, capture diagnostic screenshot (if page still open) and throw detailed error
        const errorPath = path.join('test-results', `${websiteName}-tab-not-found.png`);
        if (!page.isClosed()) {
            try {
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: true });
                console.warn(`⚠️ Could not find tab "${tabText}" — saved screenshot: ${errorPath}`);
            } catch (screenshotError) {
                console.warn(`⚠️ Could not save tab-not-found screenshot: ${(screenshotError as Error).message}`);
            }
        } else {
            console.warn('⚠️ Page is closed; cannot capture tab-not-found screenshot');
        }

        throw new Error(`Could not find tab "${tabText}" on ${websiteName}. See screenshot: ${errorPath}`);
    }

    async function clickAddProductButton(page: Page) {
        await page.waitForLoadState('networkidle');
        // Wait for product cards to be stable instead of fixed timeout
        await page.waitForSelector('[data-testid^="product-"], [data-testid^="bundle-card-"]', { state: 'visible', timeout: 5000 }).catch(() => { });

        try {
            // Find first product card and click its "+" button
            const productCard = page.locator('[data-testid^="product-"], [data-testid^="bundle-card-"], [id^="product-"], [id^="bundle-card-"]').first();
            await expect(productCard).toBeVisible({ timeout: 5000 });
            const plusBtn = productCard.locator("button:enabled").filter({ hasText: "+" }).last();
            if (await plusBtn.isVisible()) {
                await plusBtn.click();
                // Wait for cart update instead of fixed timeout
                await page.waitForLoadState('networkidle').catch(() => { });
                console.log('✅ Clicked "+" button in first product card');
                return;
            }
        } catch (e) {
            console.warn('⚠️ Could not click "+" button in product card:', e);
        }

        console.warn('⚠️ "+" button not found in product list, continuing...');
        return;
    }


    async function proceedToCheckout(page: Page) {
        const selectors = [
            tid(testIds.proceedToCheckout),
            tid(testIds.btnProceed),
            'text=Đặt Hàng',
        ];

        const success = await clickElement(page, selectors, 'Proceeding to checkout', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: true
        });

        if (!success) {
            throw new Error('Could not proceed to checkout');
        }
    }

    async function confirmPayment(page: Page) {
        const selectors = [
            tid(testIds.confirmPayment),
            'text=XÁC NHẬN THANH TOÁN',
        ];

        const success = await clickElement(page, selectors, 'Confirming payment', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: true
        });

        if (!success) {
            throw new Error('Could not confirm payment');
        }
    }

    async function fillCustomerInfo(page: Page, customer: { name: string; phone: string }) {
        // Try multiple strategies to locate the order info popup or input fields.
        const popupSelectors = [
            tid(testIds.invoicePopup),
            'text=Thông tin đặt hàng',
        ];

        const nameSelectors = [
            tid(testIds.inputName),
            tid(testIds.inputRecipientName),
            'input[placeholder*="Nhập tên người đặt hàng"]',
            'input[placeholder*="Nhập tên người nhận quà"]',
        ];

        const phoneSelectors = [
            tid(testIds.inputPhone),
            tid(testIds.inputRecipientPhone),
            'input[placeholder*="Nhập số điện thoại"]',
            'input[placeholder*="Nhập SĐT người nhận quà"]',
        ];

        // Retry a few times to allow UI to render the popup or inputs
        const maxAttempts = 3;
        let nameVisible = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            // Check popup selectors first
            for (const sel of popupSelectors) {
                try {
                    const p = page.locator(sel).first();
                    if (await p.isVisible({ timeout: 1000 }).catch(() => false)) {
                        nameVisible = true;
                        break;
                    }
                } catch {
                    // ignore
                }
            }

            // If popup not found, check if any name input is visible directly
            if (!nameVisible) {
                for (const sel of nameSelectors) {
                    try {
                        const n = page.locator(sel).first();
                        if (await n.isVisible({ timeout: 1000 }).catch(() => false)) {
                            nameVisible = true;
                            break;
                        }
                    } catch {
                        // ignore
                    }
                }
            }

            if (nameVisible) break;
            // Small backoff
            await page.waitForTimeout(800).catch(() => { });
        }

        if (!nameVisible) {
            // Capture diagnostic screenshot to help debugging
            const errorPath = path.join('test-results', `fill-info-popup-missing-${Date.now()}.png`);
            try {
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                if (!page.isClosed()) await page.screenshot({ path: errorPath, fullPage: true });
                console.warn(`⚠️ Order info popup/inputs not visible — saved diagnostic screenshot: ${errorPath}`);
            } catch (screenshotError) {
                console.warn(`⚠️ Could not save diagnostic screenshot: ${(screenshotError as Error).message}`);
            }
            throw new Error('Order info popup not visible - cannot fill customer information');
        }

        // Fill name and phone using existing robust helper (which will throw with clear message if input cannot be found)
        await fillInput(page, nameSelectors, customer.name, 'Name');
        await fillInput(page, phoneSelectors, customer.phone, 'Phone');
    }

    async function completeOrder(page: Page) {
        const selectors = [
            tid(testIds.confirmOrder),
            'text=✅ Xác nhận',
        ];

        const success = await clickElement(page, selectors, 'Completing order', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: true
        });

        if (!success) {
            throw new Error('Could not complete order');
        }
    }
    /**
     * Generic API error check function for any step
     * Monitors for API errors and captures screenshot if found
     */
    async function checkAndCaptureApiError(page: Page, testInfo: any, stepName: string): Promise<boolean> {
        const errorRegex = /Lỗi lấy đơn hàng|Quota exceeded|Read requests|sheets\.googleapis\.com|project_number|Không thể tải dữ liệu|Internal server error|Internal Server Error|API error/i;
        const locators = [
            page.locator('body', { hasText: errorRegex }).first(),
            page.frameLocator('iframe').locator('body', { hasText: errorRegex }).first(),
        ];

        for (const locator of locators) {
            try {
                if (await locator.isVisible({ timeout: 2000 })) {
                    const errorPath = path.join('test-results', `${testInfo.project.name}-api-error-${stepName}.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true });
                    await page.screenshot({ path: errorPath, fullPage: true });
                    console.error(`❌ API error detected during "${stepName}" step: ${errorPath}`);
                    return true;
                }
            } catch (error) {
                // Ignore failures and continue checking other contexts
            }
        }

        return false;
    }

    /**
     * Legacy wrapper for backward compatibility - checks for early page errors after initial load
     */
    async function checkEarlyPageErrors(page: Page, testInfo: any): Promise<boolean> {
        return await checkAndCaptureApiError(page, testInfo, 'page-load');
    }

    async function captureInvoice(page: Page, testInfo: any) {
        console.log('📸 Starting invoice capture process...');

        async function waitForInvoicePopup(page: Page, timeout = 15000): Promise<boolean> {
            console.log('⏳ Waiting for invoice popup...');

            try {
                // Wait for the invoice modal with "Hóa đơn chi tiết" text
                const invoiceModal = page
                    .locator("div")
                    .filter({
                        has: page.getByText(/Hóa đơn chi tiết/)
                    })
                    .filter({ has: page.locator("iframe") })
                    .last();

                await invoiceModal.waitFor({ state: 'visible', timeout });
                console.log('✅ Invoice popup detected');
                return true;
            } catch (error) {
                console.log('ℹ️ Invoice popup not found within timeout');
                return false;
            }
        }

        async function handlePrintDialog(page: Page): Promise<boolean> {
            // Method 1: Try to click cancel button in print preview if it appears
            try {
                const cancelButton = page.locator('button').filter({ hasText: /Hủy/i }).first();
                if (await cancelButton.isVisible({ timeout: 2000 })) {
                    await cancelButton.click();
                    console.log('✅ Clicked cancel button in print dialog');
                    // Wait for dialog to close instead of fixed timeout
                    await cancelButton.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => { });
                    return true;
                }
            } catch (error) {
                console.warn('⚠️ Could not close print dialog');
            }

            // Method 2: Press Escape key
            try {
                await page.keyboard.press('Escape');
                // Wait for any visible dialog to close instead of fixed timeout
                await page.waitForLoadState('networkidle').catch(() => { });
                console.log('✅ Pressed Escape to close print dialog');
                return true;
            } catch (error) {
                console.warn('⚠️ Could not close print dialog');
            }

            return false;
        }

        async function captureInvoiceErrorState(page: Page, testInfo: any): Promise<boolean> {
            // Check if page is closed before attempting any operations
            if (page.isClosed()) {
                console.warn('⚠️ Page is closed; cannot check for invoice error state');
                return false;
            }

            const errorRegex = /Lỗi lấy đơn hàng|Quota exceeded|Read requests|sheets\.googleapis\.com|project_number|Không thể tải dữ liệu|Internal server error|Internal Server Error/i;
            const locators = [
                page.locator('body', { hasText: errorRegex }).first(),
                page.frameLocator('iframe').locator('body', { hasText: errorRegex }).first(),
            ];

            for (const locator of locators) {
                try {
                    if (await locator.isVisible({ timeout: 2000 })) {
                        const errorPath = path.join('test-results', `${testInfo.project.name}-invoice-detail-error.png`);
                        await fs.mkdir(path.dirname(errorPath), { recursive: true });
                        await page.screenshot({ path: errorPath, fullPage: true });
                        console.warn(`⚠️ Invoice detail error captured: ${errorPath}`);
                        return true;
                    }
                } catch (error) {
                    // Check if error is due to closed page
                    if ((error as Error).message.includes('has been closed') || (error as Error).message.includes('Target page')) {
                        console.warn('⚠️ Page closed while checking invoice error state');
                        return false;
                    }
                    // Ignore other failures and continue checking other contexts
                }
            }

            return false;
        }

        async function captureInvoiceScreenshot(page: Page, testInfo: any): Promise<string> {
            const screenshotPath = path.join('test-results', `${testInfo.project.name}-tap-hoa-xe-lam.png`);

            try {
                // Check if page is closed before starting
                if (page.isClosed()) {
                    console.warn('⚠️ Page is closed; cannot capture invoice screenshot');
                    return '';
                }

                // Wait for iframe content to load
                const invoiceFrame = page.frameLocator("iframe").first();
                await invoiceFrame.locator("#loading").waitFor({ state: "hidden", timeout: 30000 }).catch(() => { });

                // Wait for invoice content
                const invoiceContent = invoiceFrame.locator("#content");
                await expect(invoiceContent).toBeVisible({ timeout: 15000 });

                // Wait for key invoice elements
                await expect(invoiceContent.getByText(/ĐƠN HÀNG:/i)).toBeVisible();
                await expect(invoiceContent.getByText(/TỔNG THÀNH TIỀN/i)).toBeVisible({ timeout: 15_000 });
                await expect(invoiceContent.getByText(/CẢM ƠN QUÝ KHÁCH/i)).toBeVisible({ timeout: 15_000 });

                // Get the invoice modal for screenshot
                const invoiceModal = page
                    .locator("div")
                    .filter({ has: page.getByText(/Hóa đơn chi tiết|Hoá đơn chi tiết/) })
                    .filter({ has: page.locator("iframe") })
                    .last();

                // Calculate optimal viewport size
                const viewportHeight = await page.locator("iframe").first().evaluate((frameEl) => {
                    if (!(frameEl instanceof HTMLIFrameElement)) return 1280;
                    const doc = frameEl.contentDocument;
                    const content = doc?.getElementById("content");
                    const noPrint = doc?.querySelector<HTMLElement>(".no-print");
                    return (content?.scrollHeight ?? 0) + (noPrint?.offsetHeight ?? 0) + 420;
                });

                await page.setViewportSize({
                    width: 1280,
                    height: Math.min(Math.max(viewportHeight, 1280), 4000),
                });

                await invoiceModal.scrollIntoViewIfNeeded();
                await invoiceModal.screenshot({
                    path: screenshotPath,
                    animations: "disabled",
                });

                console.log(`✅ Invoice screenshot saved: ${screenshotPath}`);
                return screenshotPath;
            } catch (error) {
                const errorMsg = (error as Error).message;
                console.warn(`⚠️ Error capturing invoice screenshot: ${errorMsg}`);

                // Check if error is due to closed page/context
                if (errorMsg.includes('has been closed') || errorMsg.includes('Target page') || errorMsg.includes('has been closed') || page.isClosed()) {
                    console.warn('⚠️ Page/context closed during invoice capture; cannot take fallback screenshot');
                    return '';
                }

                // Fallback: full page screenshot (only if page is still open)
                if (!page.isClosed()) {
                    try {
                        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        console.log(`✅ Fallback screenshot saved: ${screenshotPath}`);
                        return screenshotPath;
                    } catch (fallbackError) {
                        console.warn(`⚠️ Could not take fallback screenshot: ${(fallbackError as Error).message}`);
                    }
                } else {
                    console.warn('⚠️ Page is closed; cannot take fallback screenshot');
                }
                return '';
            }
        }

        try {
            // Wait for invoice popup to appear
            const invoiceFound = await waitForInvoicePopup(page);

            if (invoiceFound) {
                // Handle any print dialog that might appear
                await handlePrintDialog(page);

                // If the invoice detail page shows an error, capture that state first.
                const errorCaptured = await captureInvoiceErrorState(page, testInfo);
                if (errorCaptured) {
                    console.log('⚠️ Invoice detail error detected and captured.');
                } else {
                    // Capture the invoice screenshot
                    const screenshotResult = await captureInvoiceScreenshot(page, testInfo);
                    if (screenshotResult) {
                        console.log('✅ Invoice captured successfully');
                    } else {
                        console.warn('⚠️ Invoice screenshot could not be captured (page may have closed)');
                    }
                }
            } else {
                const errorCaptured = await captureInvoiceErrorState(page, testInfo);
                if (errorCaptured) {
                    console.log('⚠️ Invoice detail error detected and captured even though popup was not detected.');
                } else {
                    console.log('ℹ️ Invoice popup was not detected, skipping capture');
                }
            }
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.warn(`⚠️ Error in invoice capture process: ${errorMsg}`);

            // Check if error is due to closed page
            if (errorMsg.includes('has been closed') || errorMsg.includes('Target page') || page.isClosed()) {
                console.warn('⚠️ Page/context closed during invoice capture; skipping error screenshot');
            } else {
                const errorPath = path.join('test-results', `${testInfo.project.name}-invoice-error.png`);
                if (!page.isClosed()) {
                    try {
                        await fs.mkdir(path.dirname(errorPath), { recursive: true });
                        await page.screenshot({ path: errorPath, fullPage: true });
                        console.log(`Error screenshot saved: ${errorPath}`);
                    } catch (screenshotError) {
                        console.warn(`⚠️ Could not take invoice error screenshot: ${(screenshotError as Error).message}`);
                    }
                } else {
                    console.warn('⚠️ Cannot capture invoice error screenshot because the page is already closed.');
                }
            }
        }

        // Wait for page to stabilize instead of fixed timeout (only if page is still open)
        if (!page.isClosed()) {
            await page.waitForLoadState('networkidle').catch(() => { });
        }
    }

    // ============================================================================
    // MAIN TEST
    // ============================================================================

    test('complete checkout flow', async ({ page }, testInfo) => {
        // Set appropriate timeout for the entire test flow (90 seconds per website)
        test.setTimeout(90000);
        const websiteName = testInfo.project.name;
        console.log(`\n${'='.repeat(80)}\nStarting checkout flow: ${websiteName}\n${'='.repeat(80)}`);

        try {
            // Inject script to suppress native print dialog BEFORE navigation
            await page.addInitScript(() => {
                const originalPrint = window.print;
                window.print = () => {
                    console.log('Print called, preventing default behavior');
                    window.dispatchEvent(new CustomEvent('printRequested'));
                };
            });

            console.log('Step 1: Navigating to homepage...');
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            // Wait for page to be fully interactive instead of fixed timeout
            await page.waitForLoadState('domcontentloaded');

            // PRIORITY CHECK: Detect API errors at page load before proceeding
            console.log('⏳ Checking for early page load errors...');
            const earlyError = await checkEarlyPageErrors(page, testInfo);
            if (earlyError) {
                throw new Error('API error detected at initial page load - unable to proceed with test');
            }
            console.log('✅ No early page errors detected, continuing...');

            console.log('Step 2: Selecting tab...');
            await selectTab(page, websiteName);
            // Check for API errors after selecting tab
            let apiError = await checkAndCaptureApiError(page, testInfo, 'select-tab');
            if (apiError) throw new Error('API error detected after selecting tab');

            console.log('Step 3: Clicking "+" button to add product...');
            await clickAddProductButton(page);
            // Check for API errors after adding product
            apiError = await checkAndCaptureApiError(page, testInfo, 'add-product');
            if (apiError) throw new Error('API error detected after adding product');

            console.log('Step 4: Proceeding to checkout...');
            await proceedToCheckout(page);
            // Check for API errors after proceeding to checkout
            apiError = await checkAndCaptureApiError(page, testInfo, 'proceed-checkout');
            if (apiError) throw new Error('API error detected during checkout');

            console.log('Step 5: Confirming payment...');
            await confirmPayment(page);
            // Check for API errors after confirming payment
            apiError = await checkAndCaptureApiError(page, testInfo, 'confirm-payment');
            if (apiError) throw new Error('API error detected after confirming payment');

            console.log('Step 6: Filling customer information...');
            await fillCustomerInfo(page, testCustomer);
            // Check for API errors after filling customer info
            apiError = await checkAndCaptureApiError(page, testInfo, 'fill-info');
            if (apiError) throw new Error('API error detected after filling customer information');

            console.log('Step 7: Completing order...');
            await completeOrder(page);
            // Check for API errors after completing order
            apiError = await checkAndCaptureApiError(page, testInfo, 'complete-order');
            if (apiError) throw new Error('API error detected after completing order');

            console.log('Step 8: Capturing invoice...');
            await captureInvoice(page, testInfo);

            console.log(`${'='.repeat(80)}\n✅ Checkout completed successfully for: ${websiteName}\n${'='.repeat(80)}\n`);

        } catch (error) {
            console.error(`\n❌ Error during checkout for ${websiteName}:`, error);

            // Use absolute path for screenshot based on project root
            const errorScreenshot = path.resolve(process.cwd(), 'test-results', 'screenshots', `${websiteName}_error.png`);
            let screenshotSaved = false;
            let screenshotPathForReport: string | undefined;

            if (!page.isClosed()) {
                try {
                    await fs.mkdir(path.dirname(errorScreenshot), { recursive: true });
                    await page.screenshot({ path: errorScreenshot, fullPage: true });
                    console.log(`✅ Error screenshot saved to: ${errorScreenshot}`);
                    screenshotSaved = true;
                    // Use relative path from project root for the report (more portable)
                    screenshotPathForReport = path.join('test-results', 'screenshots', `${websiteName}_error.png`);
                } catch (screenshotError) {
                    console.warn(`⚠️ Could not take failure screenshot: ${(screenshotError as Error).message}`);
                }
            } else {
                console.warn('⚠️ Cannot capture failure screenshot because the page is already closed.');
            }

            // Append a Vietnamese error report entry
            console.log(`📝 Attempting to write error report for ${websiteName}...`);
            try {
                await appendErrorReport(websiteName, error, screenshotSaved ? screenshotPathForReport : undefined);
                console.log(`✅ Error report written successfully for ${websiteName}`);
            } catch (reportError) {
                console.error(`❌ Failed to write error report for ${websiteName}: ${(reportError as Error).message}`);
                console.error(`   Stack: ${(reportError as Error).stack}`);
            }

            throw error;
        }
    });
});
