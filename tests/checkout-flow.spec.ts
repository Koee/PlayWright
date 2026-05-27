import { test, expect, Page } from '@playwright/test';

test.describe('Checkout Flow Automation - All Websites', () => {
    // Configuration for test data
    const testCustomer = {
        name: 'Nguyễn Văn A',
        phone: '0989336674'
    };

    // List of websites that use "túi đôi" tab (all except si.timdaythay.com)
    const tuixedoiWebsites = [
        'tuoixanhnhanhngon',
        'tegianoitro',
        'danongdichthuc',
        'hangthietyeu',
        'nhanquocdan',
        'thegioiphaidep'
    ];

    // Website that uses "chọn thùng" tab
    const siWebsite = 'si';

    // Helper function to click on the appropriate tab
    async function selectTab(page: Page, websiteName: string) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        let tabText: string;
        if (websiteName === siWebsite) {
            tabText = 'Chọn thùng';
        } else {
            tabText = 'Túi đôi';
        }

        console.log(`Clicking on tab: "${tabText}" for website: ${websiteName}`);

        // Try different case variations
        const tabSelectors = [
            `text=${tabText}`,
            `text=${tabText.toUpperCase()}`,
            `text=${tabText.toLowerCase()}`,
            `button:has-text("${tabText}")`,
            `a:has-text("${tabText}")`,
            `[class*="tab"]:has-text("${tabText}")`
        ];

        for (const selector of tabSelectors) {
            try {
                const tab = page.locator(selector).first();
                if (await tab.isVisible({ timeout: 5000 })) {
                    await tab.click({ timeout: 10000 });
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(2000);
                    console.log(`Successfully clicked tab with selector: ${selector}`);
                    return;
                }
            } catch (e) {
                continue;
            }
        }

        throw new Error(`Could not find tab "${tabText}" on ${websiteName}`);
    }

    // Helper function to add first product to cart
    async function addFirstProductToCart(page: Page) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // First, try to click "Xem thêm ... sản phẩm" button to load all products
        try {
            const viewMoreBtn = page.locator('button:has-text("Xem thêm"), button:has-text("xem thêm")').first();
            if (await viewMoreBtn.isVisible({ timeout: 5000 })) {
                await viewMoreBtn.click();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(5000);
            }
        } catch (e) {
            console.log('No "Xem thêm" button found, continuing with existing products');
        }

        // Try to find category cards or product cards
        try {
            const categoryCard = page.locator('.flex-shrink-0.bg-white.rounded-lg.border-2.cursor-pointer, [class*="category"], [class*="product-card"], [class*="product-item"]').first();
            if (await categoryCard.isVisible({ timeout: 5000 })) {
                await categoryCard.click({ timeout: 10000 });
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(5000);
            }
        } catch (e) {
            console.log('No category card found, trying other selectors');
        }

        // Now look for "Thêm" or "Mua ngay" button
        const addCartSelectors = [
            'button:has-text("Thêm"), button:has-text("THÊM")',
            'button:has-text("Mua ngay"), button:has-text("MUA NGAY")',
            '.add-to-cart, [data-action="add-to-cart"]',
            'button[class*="add"]',
            'button[class*="them"]',
            'button:has-text("Đặt hàng"), button:has-text("ĐẶT HÀNG")'
        ];

        for (const selector of addCartSelectors) {
            try {
                const addBtn = page.locator(selector).first();
                if (await addBtn.isVisible({ timeout: 3000 })) {
                    await addBtn.click({ timeout: 10000 });
                    await page.waitForTimeout(1000);
                    console.log('Clicked add to cart button with selector:', selector);
                    return;
                }
            } catch (e) {
                continue;
            }
        }

        throw new Error('Could not find add to cart button');
    }

    // Helper function to add product by clicking the "+" button
    async function clickAddProductButton(page: Page) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        console.log('Step: Looking for "+" button to increment product quantity...');

        // Strategy 1: Find product rows and click "+" button within them
        try {
            // Look for product item containers with quantity controls
            const productRows = page.locator(
                '[class*="product"], [class*="item"], [class*="row"], tr, .cart-item, [data-testid*="product"]'
            );
            
            const rowCount = await productRows.count();
            console.log(`Found ${rowCount} potential product rows`);

            if (rowCount > 0) {
                // Get the first product row
                const firstRow = productRows.first();
                
                // Try to find "+" button within this row
                const plusBtnInRow = firstRow.locator('button:has-text("+")')
                    .or(firstRow.locator('button[aria-label*="thêm"]'))
                    .or(firstRow.locator('button[aria-label*="add"]'))
                    .or(firstRow.locator('[class*="increment"]'))
                    .first();

                if (await plusBtnInRow.isVisible({ timeout: 3000 })) {
                    await plusBtnInRow.click({ timeout: 10000 });
                    await page.waitForTimeout(500);
                    console.log('✅ Clicked "+" button within product row');
                    return;
                }
            }
        } catch (e) {
            console.log('Strategy 1 failed, trying next approach...');
        }

        // Strategy 2: Look for all visible "+" buttons on page
        try {
            const allPlusButtons = page.locator('button:has-text("+")');
            const btnCount = await allPlusButtons.count();
            
            if (btnCount > 0) {
                console.log(`Found ${btnCount} "+" button(s) on page`);
                
                // Try each button until one works
                for (let i = 0; i < Math.min(btnCount, 3); i++) {
                    try {
                        const btn = allPlusButtons.nth(i);
                        if (await btn.isVisible({ timeout: 2000 })) {
                            await btn.click({ timeout: 10000 });
                            await page.waitForTimeout(500);
                            console.log(`✅ Clicked "+" button #${i + 1}`);
                            return;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        } catch (e) {
            console.log('Strategy 2 failed, trying next approach...');
        }

        // Strategy 3: Look for button with specific styling/classes
        try {
            const styledButtons = page.locator(
                'button[style*="rgb"], button[style*="background"], ' +
                'button[class*="btn"], button[class*="add"], button[class*="increment"]'
            );
            
            const count = await styledButtons.count();
            if (count > 0) {
                // Find one with "+" text
                for (let i = 0; i < count; i++) {
                    try {
                        const btn = styledButtons.nth(i);
                        const text = await btn.textContent();
                        if (text?.includes('+')) {
                            if (await btn.isVisible({ timeout: 2000 })) {
                                await btn.click({ timeout: 10000 });
                                await page.waitForTimeout(500);
                                console.log('✅ Clicked "+" button by styling');
                                return;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        } catch (e) {
            console.log('Strategy 3 failed');
        }

        // Log warning instead of throwing - button might not exist on all pages
        console.warn('⚠️ "+" (add product) button not found, continuing checkout without incrementing quantity...');
        return;
    }

    // Helper function to proceed to checkout
    async function proceedToCheckout(page: Page) {
        const checkoutSelectors = [
            'text=Đặt hàng',
            'text=Giỏ hàng',
            'text=Xem giỏ hàng',
            'text=Mua hàng',
            '.cart-button',
            '.checkout-button',
            'button:has-text("Tiếp tục")'
        ];

        for (const selector of checkoutSelectors) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.isVisible({ timeout: 3000 })) {
                    await btn.click({ timeout: 10000 });
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(1000);
                    console.log('Clicked checkout button with selector:', selector);
                    return;
                }
            } catch (e) {
                continue;
            }
        }

        throw new Error('Could not proceed to checkout');
    }

    // Helper function to confirm payment step
    async function confirmPayment(page: Page) {
        const confirmSelectors = [
            'text=Xác nhận thanh toán',
            'text=Thanh toán',
            'text=Tiếp tục',
            'text=Chuyển đến thanh toán',
            '.checkout-btn',
            'button:has-text("Xác nhận")'
        ];

        for (const selector of confirmSelectors) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.isVisible({ timeout: 3000 })) {
                    await btn.click({ timeout: 10000 });
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(1000);
                    console.log('Clicked confirm payment button with selector:', selector);
                    return;
                }
            } catch (e) {
                continue;
            }
        }

        throw new Error('Could not confirm payment');
    }

    // Helper function to fill customer information
    async function fillCustomerInfo(page: Page, customer: { name: string; phone: string }) {
        // Fill name
        const nameSelectors = [
            'input[name*="name"]',
            'input[placeholder*="tên"]',
            'input[placeholder*="Tên"]',
            'input#name',
            'input#customer_name',
            'input[placeholder*="Họ tên"]',
            'input[placeholder*="họ tên"]'
        ];

        let nameFilled = false;
        for (const selector of nameSelectors) {
            try {
                const nameInput = page.locator(selector).first();
                if (await nameInput.isVisible({ timeout: 3000 })) {
                    await nameInput.fill(customer.name, { timeout: 10000 });
                    console.log('Filled name using selector:', selector);
                    nameFilled = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!nameFilled) {
            throw new Error('Could not find name input field');
        }

        // Fill phone
        const phoneSelectors = [
            'input[name*="phone"]',
            'input[placeholder*="điện thoại"]',
            'input[placeholder*="Điện thoại"]',
            'input[placeholder*="số điện thoại"]',
            'input#phone',
            'input#customer_phone',
            'input[placeholder*="Số điện thoại"]'
        ];

        let phoneFilled = false;
        for (const selector of phoneSelectors) {
            try {
                const phoneInput = page.locator(selector).first();
                if (await phoneInput.isVisible({ timeout: 3000 })) {
                    await phoneInput.fill(customer.phone, { timeout: 10000 });
                    console.log('Filled phone using selector:', selector);
                    phoneFilled = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!phoneFilled) {
            throw new Error('Could not find phone input field');
        }
    }

    // Helper function to complete order
    async function completeOrder(page: Page) {
        const completeSelectors = [
            'text=Xác nhận',
            'text=Hoàn tất',
            'text=Đặt hàng',
            'text=Thanh toán',
            '.confirm-btn',
            '.complete-order-btn',
            'button:has-text("Xác nhận")'
        ];

        for (const selector of completeSelectors) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.isVisible({ timeout: 3000 })) {
                    await btn.click({ timeout: 10000 });
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(3000);
                    console.log('Clicked complete order button with selector:', selector);
                    return;
                }
            } catch (e) {
                continue;
            }
        }

        throw new Error('Could not complete order');
    }

    // Helper function to print invoice (capture invoice details)
    async function printInvoice(page: Page, testInfo: any) {
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
                    await page.screenshot({
                        path: screenshotPath,
                        fullPage: true
                    });
                    console.log(`Invoice screenshot saved to: ${screenshotPath}`);

                    // Try to click print button if exists
                    try {
                        const printBtn = page.locator('button:has-text("In"), button:has-text("IN"), .print-btn').first();
                        if (await printBtn.isVisible({ timeout: 2000 })) {
                            await printBtn.click({ timeout: 5000 });
                            console.log('Clicked print button');
                        }
                    } catch (e) {
                        console.log('No print button found or clicked');
                    }

                    return invoiceElement;
                }
            } catch (e) {
                continue;
            }
        }

        console.log('No invoice popup found, taking final screenshot');
        const finalScreenshot = `screenshots/${testInfo.project.name}_final.png`;
        await page.screenshot({ path: finalScreenshot, fullPage: true });
        console.log(`Final screenshot saved to: ${finalScreenshot}`);
        return null;
    }

    // Main test that runs for all websites
    test('complete checkout flow', async ({ page }, testInfo) => {
        const websiteName = testInfo.project.name;
        console.log(`\n========== Starting checkout flow for: ${websiteName} ==========`);

        try {
            // Step 1: Navigate to homepage
            console.log('Step 1: Navigating to homepage...');
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);

            // Step 2: Select appropriate tab based on website
            console.log('Step 2: Selecting tab...');
            await selectTab(page, websiteName);

            // Step 3: Click "+" button to add product
            console.log('Step 3: Clicking "+" button to add product...');
            await clickAddProductButton(page);

            // Step 4: Add first product to cart
            console.log('Step 4: Adding first product to cart...');
            await addFirstProductToCart(page);

            // Step 5: Proceed to checkout (click "Đặt hàng")
            console.log('Step 5: Proceeding to checkout...');
            await proceedToCheckout(page);

            // Step 6: Confirm payment (click "Xác nhận thanh toán")
            console.log('Step 6: Confirming payment...');
            await confirmPayment(page);

            // Step 7: Fill customer information
            console.log('Step 7: Filling customer information...');
            await fillCustomerInfo(page, testCustomer);

            // Step 8: Complete order (click "Xác nhận")
            console.log('Step 8: Completing order...');
            await completeOrder(page);

            // Step 9: Print invoice (capture invoice details)
            console.log('Step 9: Printing/capturing invoice...');
            await printInvoice(page, testInfo);

            console.log(`========== Checkout flow completed successfully for: ${websiteName} ==========\n`);

        } catch (error) {
            console.error(`Error during checkout for ${websiteName}:`, error);
            const errorScreenshot = `screenshots/${websiteName}_error.png`;
            await page.screenshot({ path: errorScreenshot, fullPage: true });
            console.log(`Error screenshot saved to: ${errorScreenshot}`);
            throw error;
        }
    });
});