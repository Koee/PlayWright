import { test, expect, Page } from '@playwright/test';

test.describe('Checkout Flow Automation - All Websites', () => {
    // Configuration for test data
    const testCustomer = {
        name: 'Nguyễn Văn A',
        phone: '0989336674'
    };

    const tuixedoiWebsites = [
        'tuoixanhnhanhngon',
        'tegianoitro',
        'danongdichthuc',
        'hangthietyeu',
        'nhanquocdan',
        'thegioiphaidep'
    ];

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

        const tabText = websiteName === siWebsite ? 'Chọn thùng' : 'Túi đôi';
        const selectors = [
            `text=${tabText}`,
            `text=${tabText.toUpperCase()}`,
            `text=${tabText.toLowerCase()}`,
            `button:has-text("${tabText}")`,
            `a:has-text("${tabText}")`,
            `[class*="tab"]:has-text("${tabText}")`
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

        const success = await clickElement(
            page,
            ['button:has-text("+")'],
            'Clicking first "+" button',
            { visibilityTimeout: 5000, clickTimeout: 10000, waitAfter: 500 }
        );

        if (!success) {
            console.warn('⚠️ First "+" button not found, continuing...');
        }
    }

    async function addFirstProductToCart(page: Page) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 1: Try to load all products
        const viewMoreSelectors = ['button:has-text("Xem thêm")', 'button:has-text("xem thêm")'];
        await clickElement(page, viewMoreSelectors, 'Clicking "Xem thêm" button', {
            visibilityTimeout: 5000,
            clickTimeout: 10000,
            waitAfter: 5000
        });

        // Step 2: Click on product category/card
        const productCardSelectors = [
            '.flex-shrink-0.bg-white.rounded-lg.border-2.cursor-pointer',
            '[class*="category"]',
            '[class*="product-card"]',
            '[class*="product-item"]'
        ];
        await clickElement(page, productCardSelectors, 'Clicking product card', {
            visibilityTimeout: 5000,
            clickTimeout: 10000,
            waitAfter: 5000
        });

        // Step 3: Click add to cart button
        const addCartSelectors = [
            'button:has-text("Thêm")',
            'button:has-text("THÊM")',
            'button:has-text("Mua ngay")',
            'button:has-text("MUA NGAY")',
            '.add-to-cart',
            '[data-action="add-to-cart"]',
            'button[class*="add"]',
            'button[class*="them"]',
            'button:has-text("Đặt hàng")',
            'button:has-text("ĐẶT HÀNG")'
        ];

        const success = await clickElement(page, addCartSelectors, 'Adding product to cart', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitAfter: 1000
        });

        if (!success) {
            throw new Error('Could not find add to cart button');
        }
    }

    async function proceedToCheckout(page: Page) {
        const selectors = [
            'text=Đặt hàng',
            'text=Giỏ hàng',
            'text=Xem giỏ hàng',
            'text=Mua hàng',
            '.cart-button',
            '.checkout-button',
            'button:has-text("Tiếp tục")'
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
            'text=Xác nhận thanh toán',
            'text=Thanh toán',
            'text=Tiếp tục',
            'text=Chuyển đến thanh toán',
            '.checkout-btn',
            'button:has-text("Xác nhận")'
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
            'input[name*="name"]',
            'input[placeholder*="tên"]',
            'input[placeholder*="Tên"]',
            'input#name',
            'input#customer_name',
            'input[placeholder*="Họ tên"]',
            'input[placeholder*="họ tên"]'
        ];

        await fillInput(page, nameSelectors, customer.name, 'Name');

        const phoneSelectors = [
            'input[name*="phone"]',
            'input[placeholder*="điện thoại"]',
            'input[placeholder*="Điện thoại"]',
            'input[placeholder*="số điện thoại"]',
            'input#phone',
            'input#customer_phone',
            'input[placeholder*="Số điện thoại"]'
        ];

        await fillInput(page, phoneSelectors, customer.phone, 'Phone');
    }

    async function completeOrder(page: Page) {
        const selectors = [
            'text=Xác nhận',
            'text=Hoàn tất',
            'text=Đặt hàng',
            'text=Thanh toán',
            '.confirm-btn',
            '.complete-order-btn',
            'button:has-text("Xác nhận")'
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
        await page.waitForTimeout(2000);

        const invoiceSelectors = [
            'text=Hóa đơn chi tiết',
            'text=📄 Hóa đơn',
            '.popup',
            '.modal',
            '.invoice',
            '.order-success',
            'text=In hóa đơn',
            'button:has-text("In hóa đơn")',
            'button:has-text("in hóa đơn")',
            '[class*="invoice"]',
            '[class*="invoice-detail"]'
        ];

        for (const selector of invoiceSelectors) {
            try {
                const invoiceElement = page.locator(selector).first();
                if (await invoiceElement.isVisible({ timeout: 3000 })) {
                    const screenshotPath = `screenshots/${testInfo.project.name}_invoice.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`✅ Invoice screenshot saved to: ${screenshotPath}`);

                    // Try to click print button
                    const printSelectors = ['button:has-text("In")', 'button:has-text("IN")', '.print-btn'];
                    await clickElement(page, printSelectors, 'Clicking print button', {
                        visibilityTimeout: 2000,
                        clickTimeout: 5000,
                        waitAfter: 500
                    });

                    return;
                }
            } catch (e) {
                continue;
            }
        }

        const finalScreenshot = `screenshots/${testInfo.project.name}_final.png`;
        await page.screenshot({ path: finalScreenshot, fullPage: true });
        console.log(`⚠️ No invoice popup found, final screenshot saved to: ${finalScreenshot}`);
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

            console.log('Step 4: Adding first product to cart...');
            await addFirstProductToCart(page);

            console.log('Step 5: Proceeding to checkout...');
            await proceedToCheckout(page);

            console.log('Step 6: Confirming payment...');
            await confirmPayment(page);

            console.log('Step 7: Filling customer information...');
            await fillCustomerInfo(page, testCustomer);

            console.log('Step 8: Completing order...');
            await completeOrder(page);

            console.log('Step 9: Capturing invoice...');
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