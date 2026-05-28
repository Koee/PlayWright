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
    function getInvoiceModal(page: Page): Locator {
        return page
            .locator("div")
            .filter({ has: page.getByText(/Hóa đơn chi tiết|Hoá đơn chi tiết/) })
            .filter({ has: page.locator("iframe") })
            .last();
    }
    async function captureInvoice(page: Page, testInfo: any) {
        console.log('📸 Starting invoice capture process...');
        
        // STEP 1: Wait for and capture the first popup "TẠP HÓA XE LAM 5.0" (total amount receipt)
        let foundTotalAmountPopup = false;
        
        try {
            console.log('⏳ Waiting for "TẠP HÓA XE LAM" popup with iframe id="sizer"...');
            
            // Wait for the iframe with id="sizer" to appear (this is the popup container)
            try {
                const sizerIframe = page.locator('//*[@id="sizer"]').first();
                const iframeVisible = await sizerIframe.isVisible({ timeout: 5000 }).catch(() => false);
                
                if (iframeVisible) {
                    foundTotalAmountPopup = true;
                    console.log(`✅ Detected iframe with id="sizer" - TẠP HÓA XE LAM popup found`);
                } else {
                    // Fallback: Try to find by text content
                    const elem = page.getByText(/TẠP HÓA XE LAM/).first();
                    const textVisible = await elem.isVisible({ timeout: 3000 }).catch(() => false);
                    if (textVisible) {
                        foundTotalAmountPopup = true;
                        console.log(`✅ Detected "TẠP HÓA XE LAM 5.0" popup by text content`);
                    }
                }
            } catch (e) {
                console.log(`ℹ️ Could not detect popup using XPath: ${e.message}`);
            }

            if (foundTotalAmountPopup) {
                // Wait for popup to fully render
                await page.waitForTimeout(1000);
                
                // Take screenshot of the first popup
                const totalAmountScreenshot = path.join("test-results", `${testInfo.project.name}-tap-hoa-xe-lam.png`);
                await page.screenshot({ path: totalAmountScreenshot, fullPage: true });
                console.log(`✅ Screenshot saved: ${totalAmountScreenshot}`);

                // Find and click close button to dismiss popup
                // Priority 1: Use the specific XPath provided: //*[@id="sidebar"]//print-preview-button-strip//cr-button[2]
                let closeButtonClicked = false;
                
                const closeButtonSelectors = [
                    // Specific XPath provided - should work for this popup
                    '//*[@id="sidebar"]//print-preview-button-strip//cr-button[2]',
                    // Alternative selectors as fallback
                    'cr-button[aria-label*="Cancel"]',
                    'cr-button:nth-child(2)',
                    'print-preview-button-strip cr-button:nth-child(2)',
                    'button:has-text("X")',
                    'button:has-text("Huỷ")',
                    'button:has-text("Đóng")',
                    'button:has-text("Close")',
                    'button[aria-label*="Close"]',
                    'button[aria-label*="close"]',
                ];

                for (const closeSelector of closeButtonSelectors) {
                    try {
                        const closeBtn = page.locator(closeSelector).first();
                        const btnVisible = await closeBtn.isVisible({ timeout: 1500 }).catch(() => false);
                        if (btnVisible) {
                            await closeBtn.click({ timeout: 5000 });
                            await page.waitForTimeout(800);
                            console.log(`✅ Closed popup using selector: ${closeSelector}`);
                            closeButtonClicked = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`ℹ️ Selector failed: ${closeSelector}`);
                        // Continue to next selector
                    }
                }

                // If close button not found, try keyboard shortcuts
                if (!closeButtonClicked) {
                    console.warn(`⚠️ Could not find close button, trying ESC key`);
                    
                    try {
                        await page.press('Escape');
                        await page.waitForTimeout(500);
                        console.log(`✅ Pressed ESC to close popup`);
                        closeButtonClicked = true;
                    } catch (e) {
                        console.log(`ℹ️ ESC key did not work`);
                    }
                }

                // Alternative: Click outside the popup to close it
                if (!closeButtonClicked) {
                    try {
                        console.log(`⚠️ Trying to click outside popup to close it`);
                        await page.click('body', { position: { x: 50, y: 50 } });
                        await page.waitForTimeout(500);
                    } catch (e) {
                        console.log(`ℹ️ Clicking outside popup failed`);
                    }
                }

                console.log(`✅ "TẠP HÓA XE LAM 5.0" popup was captured and closed`);
            } else {
                console.log(`ℹ️ "TẠP HÓA XE LAM 5.0" popup not detected, proceeding to invoice details`);
            }
        } catch (e) {
            console.warn(`⚠️ Error handling first popup: ${e.message}`);
        }

        // Wait for any animations/transitions to complete before proceeding
        await page.waitForTimeout(1500);

        // STEP 2: Screenshot the "Hoá đơn chi tiết" (Invoice details) popup
        const invoiceFrame = page.frameLocator("iframe").first();
        const screenshotPath = path.join("test-results", `${testInfo.project.name}-hoa-don-chi-tiet.png`);

        await invoiceFrame.locator("#loading").waitFor({ state: "hidden", timeout: 30000 }).catch(() => { });
        const invoiceContent = invoiceFrame.locator("#content");
        await expect(invoiceContent).toBeVisible({ timeout: 30000 });
        await expect(invoiceContent.getByText(/ĐƠN HÀNG:|ORDER:/i)).toBeVisible();
        await expect(invoiceContent.getByText(/TỔNG THÀNH TIỀN|TOTAL/i)).toBeVisible({ timeout: 15000 });
        await expect(invoiceContent.getByText(/CẢM ƠN QUÝ KHÁCH|THANK YOU/i)).toBeVisible({ timeout: 15000 });
        const invoiceModal = getInvoiceModal(page);

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

        console.log(`✅ Invoice details screenshot saved to: ${screenshotPath}`);
        return screenshotPath;
    }

    // ============================================================================
    // MAIN TEST
    // ============================================================================

    test('complete checkout flow', async ({ page }, testInfo) => {
        const websiteName = testInfo.project.name;
        console.log(`\n${'='.repeat(80)}\nStarting checkout flow: ${websiteName}\n${'='.repeat(80)}`);

        try {
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
            const invoiceScreenshot = await captureInvoice(page, testInfo);

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
