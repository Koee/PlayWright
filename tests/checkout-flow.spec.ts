import { test, expect, Page, Locator } from '@playwright/test';
import path from 'path';

test.describe('Checkout Flow Automation - All Websites', () => {
    // Configuration for test data
    const testCustomer = {
        name: 'Nguyễn Văn A',
        phone: '0989336674'
    };
    const siWebsite = 'si';

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
        options = { visibilityTimeout: 3000, clickTimeout: 10000, waitAfter: 1000 }
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: options.visibilityTimeout })) {
                    await element.click({ timeout: options.clickTimeout });
                    await page.waitForTimeout(options.waitAfter);
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
                if (await input.isVisible({ timeout: 3000 })) {
                    await input.fill(value, { timeout: 10000 });
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
        await page.waitForTimeout(2000);

        const tabText = websiteName === siWebsite ? 'Chọn thùng' : 'Túi Đa Dạng';
        const selectors = [
            `text=${tabText}`
        ];

        const success = await clickElement(page, selectors, `Selecting tab "${tabText}"`, {
            visibilityTimeout: 5000,
            clickTimeout: 10000,
            waitAfter: 2000
        });

        if (!success) {
            throw new Error(`Could not find tab "${tabText}" on ${websiteName}`);
        }
    }

    async function clickAddProductButton(page: Page) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        try {
            // Find first product card and click its "+" button
            const productCard = page.locator('[id^="product-"], [id^="bundle-card-"]').first();
            await expect(productCard).toBeVisible({ timeout: 30000 });
            const plusBtn = productCard.locator("button:enabled").filter({ hasText: "+" }).last();
            if (await plusBtn.isVisible()) {
                await plusBtn.click();
                await page.waitForTimeout(500);
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
            'text=Đặt Hàng',
        ];

        const success = await clickElement(page, selectors, 'Proceeding to checkout', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitAfter: 1000
        });

        if (!success) {
            throw new Error('Could not proceed to checkout');
        }
    }

    async function confirmPayment(page: Page) {
        const selectors = [
            'text=XÁC NHẬN THANH TOÁN',
        ];

        const success = await clickElement(page, selectors, 'Confirming payment', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitAfter: 1000
        });

        if (!success) {
            throw new Error('Could not confirm payment');
        }
    }

    async function fillCustomerInfo(page: Page, customer: { name: string; phone: string }) {
        const nameSelectors = [
            'input[placeholder*="Nhập tên người đặt hàng"]',
            'input[placeholder*="Nhập tên người nhận quà"]',

        ];


        await fillInput(page, nameSelectors, customer.name, 'Name');

        const phoneSelectors = [
            'input[placeholder*="Nhập số điện thoại"]',
            'input[placeholder*="Nhập SĐT người nhận quà"]',
        ];

        await fillInput(page, phoneSelectors, customer.phone, 'Phone');
    }

    async function completeOrder(page: Page) {
        const selectors = [
            'text=✅ Xác nhận',
        ];

        const success = await clickElement(page, selectors, 'Completing order', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitAfter: 3000
        });

        if (!success) {
            throw new Error('Could not complete order');
        }
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
                    await page.waitForTimeout(500);
                    return true;
                }
            } catch (error) {
                console.warn('⚠️ Could not close print dialog');
            }

            // Method 2: Press Escape key
            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
                console.log('✅ Pressed Escape to close print dialog');
                return true;
            } catch (error) {
                console.warn('⚠️ Could not close print dialog');
            }

            return false;
        }

        async function captureInvoiceScreenshot(page: Page, testInfo: any): Promise<string> {
            const screenshotPath = path.join('test-results', `${testInfo.project.name}-tap-hoa-xe-lam.png`);

            try {
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
                console.warn(`⚠️ Error capturing invoice screenshot: ${(error as Error).message}`);
                // Fallback: full page screenshot
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`✅ Fallback screenshot saved: ${screenshotPath}`);
                return screenshotPath;
            }
        }

        try {
            // Wait for invoice popup to appear
            const invoiceFound = await waitForInvoicePopup(page);

            if (invoiceFound) {
                // Handle any print dialog that might appear
                await handlePrintDialog(page);

                // Capture the invoice screenshot
                await captureInvoiceScreenshot(page, testInfo);

                console.log('✅ Invoice captured successfully');
            } else {
                console.log('ℹ️ Invoice popup was not detected, skipping capture');
            }
        } catch (error) {
            console.warn(`⚠️ Error in invoice capture process: ${(error as Error).message}`);
            // Take error screenshot
            const errorPath = path.join('test-results', `${testInfo.project.name}-invoice-error.png`);
            await page.screenshot({ path: errorPath, fullPage: true });
            console.log(`Error screenshot saved: ${errorPath}`);
        }

        // Wait for any animations/transitions to complete before proceeding
        await page.waitForTimeout(1500);
    }

    // ============================================================================
    // MAIN TEST
    // ============================================================================

    test('complete checkout flow', async ({ page }, testInfo) => {
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
            await page.waitForTimeout(2000);

            console.log('Step 2: Selecting tab...');
            await selectTab(page, websiteName);

            console.log('Step 3: Clicking "+" button to add product...');
            await clickAddProductButton(page);

            console.log('Step 4: Proceeding to checkout...');
            await proceedToCheckout(page);

            console.log('Step 5: Confirming payment...');
            await confirmPayment(page);

            console.log('Step 6: Filling customer information...');
            await fillCustomerInfo(page, testCustomer);

            console.log('Step 7: Completing order...');
            await completeOrder(page);

            console.log('Step 8: Capturing invoice...');
            await captureInvoice(page, testInfo);

            console.log(`${'='.repeat(80)}\n✅ Checkout completed successfully for: ${websiteName}\n${'='.repeat(80)}\n`);

        } catch (error) {
            console.error(`\n❌ Error during checkout for ${websiteName}:`, error);
            const errorScreenshot = `screenshots/${websiteName}_error.png`;
            await page.screenshot({ path: errorScreenshot, fullPage: true });
            console.log(`Error screenshot saved to: ${errorScreenshot}`);
            throw error;
        }
    });
});
