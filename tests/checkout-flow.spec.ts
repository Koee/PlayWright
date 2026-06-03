/// <reference types="node" />
import { test, expect, Page, Locator } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { appendErrorReport } from './utils/error-report';
import * as dialogHandler from './utils/dialog-handler';

test.describe('Checkout Flow Automation - All Websites', () => {
    // Configuration for test data (loaded from .env via dotenv in playwright.config.ts)
    const testCustomer = {
        name: process.env.TEST_CUSTOMER_NAME || `Test Customer ${Date.now()}`,
        phone: process.env.TEST_CUSTOMER_PHONE || `09${Date.now().toString().slice(-8)}`
    };
    const siWebsite = 'si';

    function getProjectHomeUrl(testInfo: { project: { use: { baseURL?: string } } }) {
        const baseURL = testInfo.project.use.baseURL?.trim();
        return baseURL || '/';
    }

    function getUrlSearchParams(url: string) {
        try {
            return new URL(url).searchParams;
        } catch {
            return new URL(url, 'http://localhost').searchParams;
        }
    }

    async function warnIfHomepageQueryWasDropped(page: Page, homeUrl: string) {
        const expectedParams = getUrlSearchParams(homeUrl);
        if ([...expectedParams].length === 0) {
            return;
        }

        const currentParams = getUrlSearchParams(page.url());
        const droppedParams = [...expectedParams].filter(([key, value]) => currentParams.get(key) !== value);
        if (droppedParams.length > 0) {
            const expectedQuery = expectedParams.toString();
            console.warn(`Homepage query was not preserved after load. Expected query: ${expectedQuery}. Current URL: ${page.url()}`);
        }
    }

    // Helper to build data-testid selector. Use stable test ids in app when possible.
    const tid = (id: string) => `[data-testid="${id}"]`;

    // Recommended data-testid mapping for frontend implementation.
    const testIds = {
        tabSite: (site: string) => `tab-${site}`,
        tabText: (tabText: string) => `tab-${tabText}`,
        proceedToCheckout: 'proceed-to-checkout',
        btnProceed: 'btn-proceed',
        inputName: 'input-name',
        inputRecipientName: 'input-recipient-name',
        inputPhone: 'input-phone',
        inputRecipientPhone: 'input-recipient-phone',
        confirmOrder: 'confirm-order',
        invoiceError: 'invoice-error',
        invoicePopup: 'invoice-popup',
    };

    const invoiceErrorRegex = /Lỗi lấy đơn hàng|Quota exceeded|Read requests|sheets\.googleapis\.com|project_number|Không thể tải dữ liệu|Internal server error/i;
    const invoiceContentRegex = /Hóa đơn chi tiết|Hoá đơn chi tiết|Thông tin đơn hàng|Xác nhận đơn hàng|Mã đơn hàng|Chi tiết đơn hàng/i;
    const invoiceDetailTitleRegex = /H\u00f3a \u0111\u01a1n chi ti\u1ebft|Ho\u00e1 \u0111\u01a1n chi ti\u1ebft/i;
    const invoiceMeaningfulContentRegex = /M\u00e3 \u0111\u01a1n h\u00e0ng|Chi ti\u1ebft \u0111\u01a1n h\u00e0ng|Th\u00f4ng tin \u0111\u01a1n h\u00e0ng|Kh\u00e1ch h\u00e0ng|S\u1ed1 \u0111i\u1ec7n tho\u1ea1i|S\u1ea3n ph\u1ea9m|T\u1ed5ng ti\u1ec1n|Th\u00e0nh ti\u1ec1n|Order|Customer|Phone|Product|Total/i;
    const invoiceFooterRegex = /C\u1ea2M \u01a0N QU\u00dd KH\u00c1CH|C\u1ea3m \u01a1n qu\u00fd kh\u00e1ch|H\u1eb9n g\u1eb7p l\u1ea1i/i;


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
        options = { visibilityTimeout: 3000, clickTimeout: 5000, waitForNav: true },
        dialogTracker?: dialogHandler.DialogTracker
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: options.visibilityTimeout })) {
                    await element.click({ timeout: options.clickTimeout });
                    // Wait for navigation/network to settle instead of fixed timeout
                    if (options.waitForNav) {
                        // Add timeout to prevent hanging when a JS dialog (alert/confirm/prompt) blocks execution
                        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                    }
                    if (dialogTracker) {
                        const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                        await dialogHandler.waitAndHandleDialog(page, dialogTracker, context, 500);
                    }
                    console.log(`✅ ${actionName} - Selector: ${selector}`);
                    return true;
                }
            } catch (e) {
                if (dialogTracker) {
                    const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                    await dialogHandler.checkAndHandleDialog(page, dialogTracker, context);
                }
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

    async function selectTab(page: Page, websiteName: string, dialogTracker?: dialogHandler.DialogTracker) {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });

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
                        if (dialogTracker) {
                            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'select-tab-click', 500);
                        }
                        console.log(`✅ Selecting tab "${tabText}" - Selector: ${selector} (attempt ${attempt})`);
                        return;
                    }
                } catch (e) {
                    if (dialogTracker) {
                        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'select-tab-click');
                    }
                    // try next selector
                }
            }
            // if not found yet, try again (no fixed sleep, rely on selector timeouts)
        }

        // If still not found, capture diagnostic screenshot (if page still open) and throw detailed error
        const errorPath = path.join('test-results', 'err-screenshots', `${websiteName}-tab-not-found.png`);
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

    async function clickAddProductButton(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
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
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                if (dialogTracker) {
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'add-product-click', 500);
                }
                console.log('✅ Clicked "+" button in first product card');
                return;
            }
        } catch (e) {
            console.warn('⚠️ Could not click "+" button in product card:', e);
        }

        console.warn('⚠️ "+" button not found in product list, continuing...');
        return;
    }


    async function proceedToCheckout(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        const selectors = [
            tid(testIds.proceedToCheckout),
            tid(testIds.btnProceed),
            'text=Đặt Hàng',
        ];

        const success = await clickElement(page, selectors, 'Proceeding to checkout', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: true
        }, dialogTracker);

        if (!success) {
            throw new Error('Could not proceed to checkout');
        }
    }

    async function confirmPayment(page: Page, dialogTracker: dialogHandler.DialogTracker) {
        // First, check if a dialog is already blocking the page (from a previous step)
        // If a dialog appeared during proceedToCheckout, it will be caught here
        const shortEvalTimeout = 500;
        let pageIsBlockedByDialog = false;
        try {
            await Promise.race([
                page.evaluate(() => 1 + 1),
                page.waitForTimeout(shortEvalTimeout).then(() => {
                    throw new Error('page.evaluate timed out');
                }),
            ]);
        } catch {
            // page.evaluate will fail if a native dialog is blocking JavaScript execution
            pageIsBlockedByDialog = true;
        }

        if (pageIsBlockedByDialog) {
            // A dialog is blocking the page. Handle it via the dialog tracker.
            console.warn('⚠️ Page appears to be blocked by a browser dialog. Handling...');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'confirm-payment-precheck');
            // If the tracker did not catch the dialog, still capture the blocked state before failing.
            const timestamp = Date.now();
            const errorPath = path.join('test-results', 'err-screenshots', `confirm-payment-page-blocked-${timestamp}.png`);
            await dialogHandler.captureFailureState(page, errorPath);
            throw new Error(`Page was blocked by a dialog and could not recover. Screenshot: ${errorPath}`);
        }

        // No dialog blocking — proceed normally
        // After clicking "Đặt Hàng", the page JS event loop may be busy/hung,
        // causing Playwright operations (click, evaluate, filter) to hang.
        // Strategy: schedule the click asynchronously via setTimeout so evaluate
        // returns immediately, then wait for the click to fire.
        await page.waitForTimeout(2000);
        console.log(`ℹ️ Current URL after checkout: ${page.url()}`);

        // Use page.evaluate with setTimeout to schedule the click asynchronously.
        // This returns immediately even if the page is stuck in a busy state.
        const findBtnScript = `
            (() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.textContent && btn.textContent.includes('XÁC NHẬN THANH TOÁN')) {
                        // Schedule click asynchronously so evaluate returns immediately
                        setTimeout(() => {
                            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }, 100);
                        return true;
                    }
                }
                return false;
            })()
        `;
        let found = false;
        try {
            // Run in page context but don't wait for the setTimeout result
            found = await page.evaluate(findBtnScript);
        } catch (e) {
            console.warn(`⚠️ page.evaluate failed: ${(e as Error).message}`);
        }

        // Wait a moment for the click to be processed
        await page.waitForTimeout(500);

        if (found) {
            console.log(`✅ Confirming payment - Click dispatched on "XÁC NHẬN THANH TOÁN"`);
        } else {
            throw new Error('Could not find "XÁC NHẬN THANH TOÁN" button');
        }

        // Check if a JavaScript dialog (alert/confirm/prompt) was triggered by the click
        if (await dialogHandler.waitForTrackedDialog(page, dialogTracker, 1500)) {
            const { message, type, screenshotPath } = await dialogHandler.captureAndDismissDialog(page, dialogTracker, 'confirm-payment-alert');
            throw new Error(`Payment warning dialog (${type}): ${message}. Screenshot: ${screenshotPath}`);
        }

        // 2) Check for DOM-based warning/error popup elements
        const warningPopupSelectors = [
            'text=Có lỗi xảy ra',
            'text=Tổng tiền không hợp lệ',
        ];

        for (const sel of warningPopupSelectors) {
            try {
                if (await page.locator(sel).first().isVisible({ timeout: 300 })) {
                    const timestamp = Date.now();
                    const errorPath = path.join('test-results', 'err-screenshots', `confirm-payment-popup-${timestamp}.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                    await page.screenshot({ path: errorPath, fullPage: true }).catch(() => { });
                    console.warn(`⚠️ Payment confirmation warning popup detected — screenshot saved: ${errorPath}`);
                    throw new Error(`Payment confirmation warning popup detected (selector: "${sel}")`);
                }
            } catch (e) {
                if ((e as Error).message.includes('Payment confirmation warning popup detected')) {
                    throw e;
                }
                continue;
            }
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

            if (nameVisible) {
                break;
            }
        }

        if (!nameVisible) {
            // Timeout waiting for customer info popup - throw error
            const errorPath = path.join('test-results', 'err-screenshots', 'customer-info-popup-not-found.png');
            await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
            if (!page.isClosed()) {
                await page.screenshot({ path: errorPath, fullPage: true }).catch(() => { });
            }
            throw new Error(`Could not find customer info popup or input fields. See screenshot: ${errorPath}`);
        }

        // Now fill the name and phone fields

        // Fill name
        const nameFilled = await fillInput(page, nameSelectors, customer.name, 'Name');
        if (!nameFilled) throw new Error(`Could not fill name for ${customer.name}`);

        // Fill phone
        const phoneFilled = await fillInput(page, phoneSelectors, customer.phone, 'Phone');
        if (!phoneFilled) throw new Error(`Could not fill phone for ${customer.phone}`);
    }

    async function completeOrder(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        const selectors = [
            tid(testIds.confirmOrder),
            'text=Xác nhận',
        ];

        const success = await clickElement(page, selectors, 'Completing order', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: true
        }, dialogTracker);

        if (!success) {
            throw new Error('Could not complete order');
        }
    }

    async function waitForInvoicePopup(page: Page, initialUrl?: string, timeoutMs = 7000) {
        // Wait for invoice popup to appear within reasonable time
        const popupSelectors = [
            tid(testIds.invoicePopup),
            'role=dialog',
            'text=Thông tin đơn hàng',
            'text=Xác nhận đơn hàng',
            '[class*="invoice"]',
            'text=Mã đơn hàng',
            'text=Chi tiết đơn hàng',
            'text=Hóa đơn',
        ];

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            for (const selector of popupSelectors) {
                try {
                    const locator = page.locator(selector).first();
                    if (await locator.isVisible({ timeout: 250 }).catch(() => false)) {
                        console.log(`✅ Invoice popup detected: ${selector}`);
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // Check if the page navigated to a new URL (e.g., invoice detail page)
            const currentUrl = page.url();
            if (initialUrl && currentUrl && currentUrl !== initialUrl) {
                console.log(`ℹ️ Page navigated to: ${currentUrl}. Treating as invoice page.`);
                return true;
            }

            const bodyText = await page.locator('body').innerText({ timeout: 250 }).catch(() => '');
            if (invoiceContentRegex.test(bodyText)) {
                console.log('✅ Invoice content detected in page body');
                return true;
            }

            await page.waitForTimeout(500).catch(() => { });
        }

        return false;
    }

    async function openInvoiceDetailPopupIfAvailable(page: Page): Promise<boolean> {
        const hasVisibleDetailIframe = async () => page.evaluate(() => {
            return Array.from(document.querySelectorAll('iframe')).some((frame) => {
                const src = frame.getAttribute('src') || '';
                const rect = frame.getBoundingClientRect();
                return /order\.html|code=/.test(src) && rect.width > 40 && rect.height > 40;
            });
        }).catch(() => false);

        if (await hasVisibleDetailIframe()) {
            console.log('Invoice detail iframe is already open.');
            return true;
        }

        const detailButton = page
            .locator('button, [role="button"]')
            .filter({ hasText: /In\s+(h[oó]a|hoá)\s+đơn\s+chi\s+tiết/i })
            .last();

        if (!await detailButton.isVisible({ timeout: 1500 }).catch(() => false)) {
            return false;
        }

        await detailButton.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        try {
            await detailButton.click({ timeout: 5000 });
        } catch (error) {
            if (await hasVisibleDetailIframe()) {
                console.log('Invoice detail iframe opened before the detail button click completed.');
                return true;
            }
            throw error;
        }
        await page.waitForTimeout(1000);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        console.log('Invoice detail button clicked.');
        return true;
    }

    async function findInvoiceCapturePage(page: Page, initialUrl: string) {
        const context = page.context();

        const candidatePages = context.pages()
            .filter(candidate => !candidate.isClosed())
            .reverse();

        for (const candidate of candidatePages) {
            await candidate.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => { });
            if (await waitForInvoicePopup(candidate, candidate === page ? initialUrl : undefined)) {
                return candidate;
            }
        }

        const newPage = await context.waitForEvent('page', { timeout: 1000 }).catch(() => null);
        if (newPage && !newPage.isClosed()) {
            await newPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => { });
            await newPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => { });
            if (await waitForInvoicePopup(newPage)) {
                return newPage;
            }
            return newPage;
        }

        return page;
    }

    async function findInvoiceDetailPopup(page: Page): Promise<Locator | null> {
        const candidates = page
            .locator('div, section, article, [role="dialog"], [class*="modal"], [class*="popup"]')
            .filter({ has: page.getByText(invoiceDetailTitleRegex) });

        const count = Math.min(await candidates.count().catch(() => 0), 80);
        let best: { locator: Locator; area: number } | null = null;

        for (let index = 0; index < count; index++) {
            const candidate = candidates.nth(index);
            if (!await candidate.isVisible({ timeout: 250 }).catch(() => false)) {
                continue;
            }

            const box = await candidate.boundingBox().catch(() => null);
            if (!box || box.width < 240 || box.height < 160) {
                continue;
            }

            const area = box.width * box.height;
            if (!best || area < best.area) {
                best = { locator: candidate, area };
            }
        }

        return best?.locator ?? null;
    }

    async function screenshotVisibleElement(locator: Locator, screenshotPath: string): Promise<void> {
        await locator.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        await locator.screenshot({
            path: screenshotPath,
            animations: "disabled",
            timeout: 5000,
        });
    }

    async function getInvoicePopupText(popup: Locator): Promise<string> {
        return popup.evaluate((element) => {
            const root = element as HTMLElement;
            const parts = [root.innerText || root.textContent || ''];

            for (const frame of Array.from(root.querySelectorAll('iframe'))) {
                try {
                    parts.push(frame.contentDocument?.body?.innerText || '');
                } catch {
                    // Cross-origin iframe text is not readable from the parent document.
                }
            }

            return parts.join('\n');
        }).catch(() => '');
    }

    async function captureInvalidInvoiceTarget(
        locator: Locator,
        testInfo: any,
        reason: 'error' | 'missing-content',
        preferredPath?: string,
    ): Promise<string> {
        const errorPath = preferredPath
            ?? path.join('test-results', 'err-screenshots', `${testInfo.project.name}-invoice-popup-${reason}-${Date.now()}.png`);
        await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
        await screenshotVisibleElement(locator, errorPath).catch(async () => {
            await screenshotFullElement(locator, errorPath).catch(() => { });
        });
        console.warn(`Invoice target rejected for ${reason}. Screenshot saved: ${errorPath}`);
        return errorPath;
    }

    async function validateInvoicePassTarget(locator: Locator, testInfo: any): Promise<boolean> {
        const targetText = await getInvoicePopupText(locator);
        if (invoiceErrorRegex.test(targetText)) {
            await captureInvalidInvoiceTarget(locator, testInfo, 'error');
            return false;
        }

        if (!invoiceMeaningfulContentRegex.test(targetText)) {
            await captureInvalidInvoiceTarget(locator, testInfo, 'missing-content');
            return false;
        }

        return true;
    }

    async function scrollInvoicePopupToFooter(popup: Locator): Promise<boolean> {
        for (let attempt = 0; attempt < 8; attempt++) {
            const hasFooter = await popup.evaluate((element, footerPattern) => {
                const regex = new RegExp(footerPattern, 'i');
                const root = element as HTMLElement;
                const text = root.innerText || root.textContent || '';

                if (regex.test(text)) {
                    return true;
                }

                for (const frame of Array.from(root.querySelectorAll('iframe'))) {
                    try {
                        const frameText = frame.contentDocument?.body?.innerText || '';
                        if (regex.test(frameText)) {
                            return true;
                        }
                    } catch {
                        // Cross-origin iframes are handled by frame locators elsewhere.
                    }
                }

                const scrollTargets = [
                    root,
                    ...Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => {
                        const style = window.getComputedStyle(node);
                        return /(auto|scroll)/.test(`${style.overflow}${style.overflowY}`) && node.scrollHeight > node.clientHeight + 4;
                    }),
                ];

                for (const target of scrollTargets) {
                    target.scrollTop = target.scrollHeight;
                }

                for (const frame of Array.from(root.querySelectorAll('iframe'))) {
                    try {
                        frame.contentWindow?.scrollTo(0, frame.contentDocument?.body?.scrollHeight || 0);
                    } catch {
                        // ignore
                    }
                }

                return false;
            }, invoiceFooterRegex.source).catch(() => false);

            if (hasFooter) {
                return true;
            }

            await popup.page().waitForTimeout(250).catch(() => { });
        }

        return false;
    }

    async function screenshotInvoicePopupFullContent(popup: Locator, screenshotPath: string): Promise<void> {
        await popup.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        await scrollInvoicePopupToFooter(popup);

        const cloneMarker = await popup.evaluate((element) => {
            const root = element as HTMLElement;
            const marker = `pw-invoice-clone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const wrapper = document.createElement('div');
            const clone = root.cloneNode(true) as HTMLElement;
            const rootWidth = Math.ceil(Math.max(root.scrollWidth, root.offsetWidth, root.clientWidth, root.getBoundingClientRect().width));

            wrapper.setAttribute('data-pw-invoice-clone-root', marker);
            wrapper.style.cssText = [
                'position:absolute',
                'top:0',
                'left:0',
                'z-index:2147483647',
                'background:#ffffff',
                'padding:16px',
                `width:${rootWidth + 32}px`,
                'box-sizing:border-box',
            ].join(';');

            clone.setAttribute('data-pw-invoice-clone-target', marker);
            clone.style.position = 'static';
            clone.style.inset = 'auto';
            clone.style.transform = 'none';
            clone.style.width = `${rootWidth}px`;
            clone.style.height = 'auto';
            clone.style.maxHeight = 'none';
            clone.style.overflow = 'visible';
            clone.style.overflowY = 'visible';

            for (const node of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
                const style = window.getComputedStyle(node);
                if (/(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`)) {
                    node.style.height = 'auto';
                    node.style.maxHeight = 'none';
                    node.style.overflow = 'visible';
                    node.style.overflowY = 'visible';
                }
                if (style.position === 'fixed') {
                    node.style.position = 'static';
                    node.style.inset = 'auto';
                    node.style.transform = 'none';
                }
            }

            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            const cloneHeight = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight, clone.clientHeight));
            clone.style.height = `${cloneHeight}px`;
            document.documentElement.style.minHeight = `${cloneHeight + 32}px`;
            document.body.style.minHeight = `${cloneHeight + 32}px`;
            window.scrollTo(0, 0);

            return marker;
        }).catch(() => null);

        if (cloneMarker) {
            try {
                await popup.locator(`[data-pw-invoice-clone-target="${cloneMarker}"]`).screenshot({
                    path: screenshotPath,
                    animations: "disabled",
                    timeout: 10000,
                });
                return;
            } finally {
                await popup.evaluate((element, marker) => {
                    document.querySelector(`[data-pw-invoice-clone-root="${marker}"]`)?.remove();
                    document.documentElement.style.minHeight = '';
                    document.body.style.minHeight = '';
                }, cloneMarker).catch(() => { });
            }
        }

        const styleState = await popup.evaluate((element) => {
            const root = element as HTMLElement;
            const marker = `pw-invoice-full-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const nodes = [
                root,
                ...Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => {
                    const style = window.getComputedStyle(node);
                    return /(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`) || node.tagName.toLowerCase() === 'iframe';
                }),
            ];

            return nodes.map((node, index) => {
                const id = `${marker}-${index}`;
                const previous = {
                    height: node.style.height,
                    maxHeight: node.style.maxHeight,
                    overflow: node.style.overflow,
                    overflowY: node.style.overflowY,
                    marker: node.getAttribute('data-pw-invoice-full-id'),
                };
                const iframe = node instanceof HTMLIFrameElement ? node : null;
                const iframeHeight = iframe?.contentDocument
                    ? Math.max(
                        iframe.contentDocument.documentElement.scrollHeight,
                        iframe.contentDocument.body?.scrollHeight || 0,
                        iframe.offsetHeight,
                    )
                    : 0;
                const fullHeight = Math.max(node.scrollHeight, node.offsetHeight, node.clientHeight, iframeHeight);

                node.setAttribute('data-pw-invoice-full-id', id);
                node.style.height = `${fullHeight}px`;
                node.style.maxHeight = 'none';
                node.style.overflow = 'visible';
                node.style.overflowY = 'visible';
                node.scrollTop = 0;

                try {
                    iframe?.contentWindow?.scrollTo(0, 0);
                } catch {
                    // ignore
                }

                return { id, previous };
            });
        });

        try {
            await popup.screenshot({
                path: screenshotPath,
                animations: "disabled",
                timeout: 5000,
            });
        } finally {
            await popup.evaluate((element, state) => {
                for (const item of state as Array<{ id: string; previous: Record<string, string | null> }>) {
                    const node = document.querySelector(`[data-pw-invoice-full-id="${item.id}"]`) as HTMLElement | null;
                    if (!node) {
                        continue;
                    }
                    node.style.height = item.previous.height || '';
                    node.style.maxHeight = item.previous.maxHeight || '';
                    node.style.overflow = item.previous.overflow || '';
                    node.style.overflowY = item.previous.overflowY || '';
                    if (item.previous.marker) {
                        node.setAttribute('data-pw-invoice-full-id', item.previous.marker);
                    } else {
                        node.removeAttribute('data-pw-invoice-full-id');
                    }
                }
            }, styleState).catch(() => { });
        }
    }

    async function captureInvoiceDetailPopup(page: Page, testInfo: any, passScreenshotPath: string): Promise<string | null> {
        const popup = await findInvoiceDetailPopup(page);
        if (!popup) {
            return null;
        }

        await page.waitForTimeout(500);
        const popupText = await getInvoicePopupText(popup);
        const hasInvoiceError = invoiceErrorRegex.test(popupText);
        const hasMeaningfulContent = invoiceMeaningfulContentRegex.test(popupText);
        const targetDir = hasInvoiceError || !hasMeaningfulContent
            ? path.join('test-results', 'err-screenshots')
            : path.dirname(passScreenshotPath);
        const targetPath = hasInvoiceError || !hasMeaningfulContent
            ? path.join(targetDir, `${testInfo.project.name}-invoice-popup-error-${Date.now()}.png`)
            : passScreenshotPath;

        await fs.mkdir(targetDir, { recursive: true }).catch(() => { });
        try {
            if (hasInvoiceError || !hasMeaningfulContent) {
                await screenshotVisibleElement(popup, targetPath);
            } else {
                const hasFooter = invoiceFooterRegex.test(popupText) || await scrollInvoicePopupToFooter(popup);
                if (!hasFooter) {
                    console.warn('Invoice detail footer was not detected before capture; continuing with full popup content screenshot');
                }
                await screenshotInvoicePopupFullContent(popup, targetPath);
            }
        } catch (error) {
            console.warn(`Could not capture invoice detail popup element: ${(error as Error).message}`);
            return '';
        }

        if (hasInvoiceError || !hasMeaningfulContent) {
            console.warn(`Invoice detail popup has no usable order content. Screenshot saved: ${targetPath}`);
            return '';
        }

        console.log(`Invoice detail popup screenshot captured: ${targetPath}`);
        return targetPath;
    }

    async function captureInvoiceDetailFrame(page: Page, testInfo: any, screenshotPath: string): Promise<string | null> {
        const frames = page.frames().slice().reverse();

        for (const frame of frames) {
            const frameUrl = frame.url();
            const body = frame.locator('body').first();
            const frameText = await body.innerText({ timeout: 1000 }).catch(() => '');
            const looksLikeDetailFrame = /order\.html|code=/.test(frameUrl)
                || invoiceDetailTitleRegex.test(frameText)
                || invoiceContentRegex.test(frameText);

            if (!looksLikeDetailFrame) {
                continue;
            }

            if (invoiceErrorRegex.test(frameText)) {
                const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-invoice-frame-error-${Date.now()}.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                await screenshotVisibleElement(body, errorPath).catch(async () => {
                    await screenshotFullElement(body, errorPath).catch(() => { });
                });
                console.warn(`Invoice detail frame has an error. Screenshot saved: ${errorPath}`);
                return '';
            }

            if (!invoiceMeaningfulContentRegex.test(frameText)) {
                continue;
            }

            const marker = `pw-invoice-frame-clone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const snapshot = await frame.evaluate(() => {
                const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                    .map((node) => node.outerHTML)
                    .join('\n');
                const width = Math.ceil(Math.max(
                    document.documentElement.scrollWidth,
                    document.body.scrollWidth,
                    document.documentElement.clientWidth,
                    document.body.clientWidth,
                ));
                const height = Math.ceil(Math.max(
                    document.documentElement.scrollHeight,
                    document.body.scrollHeight,
                    document.documentElement.offsetHeight,
                    document.body.offsetHeight,
                ));

                return {
                    styles,
                    html: document.body.innerHTML,
                    width,
                    height,
                };
            });

            await page.evaluate(({ marker, snapshot }) => {
                const wrapper = document.createElement('div');
                wrapper.setAttribute('data-pw-invoice-frame-clone', marker);
                wrapper.style.cssText = [
                    'position:absolute',
                    'top:0',
                    'left:0',
                    'z-index:2147483647',
                    'background:#ffffff',
                    'padding:20px',
                    `width:${snapshot.width + 40}px`,
                    'box-sizing:border-box',
                ].join(';');
                wrapper.innerHTML = `
                    ${snapshot.styles}
                    <div data-pw-invoice-frame-content="${marker}" style="background:#fff;width:${snapshot.width}px;min-height:${snapshot.height}px;overflow:visible;">
                        ${snapshot.html}
                    </div>
                `;
                document.body.appendChild(wrapper);
                document.documentElement.style.minHeight = `${snapshot.height + 40}px`;
                document.body.style.minHeight = `${snapshot.height + 40}px`;
                window.scrollTo(0, 0);
            }, { marker, snapshot });

            try {
                await page.locator(`[data-pw-invoice-frame-clone="${marker}"]`).screenshot({
                    path: screenshotPath,
                    animations: "disabled",
                    timeout: 10000,
                });
            } finally {
                await page.evaluate((marker) => {
                    document.querySelector(`[data-pw-invoice-frame-clone="${marker}"]`)?.remove();
                    document.documentElement.style.minHeight = '';
                    document.body.style.minHeight = '';
                }, marker).catch(() => { });
            }
            console.log(`Invoice detail iframe screenshot captured: ${screenshotPath}`);
            return screenshotPath;
        }

        return null;
    }

    async function captureInvoiceErrorState(page: Page, testInfo: any) {
        const invoicePopup = await findInvoiceDetailPopup(page);
        if (invoicePopup) {
            const popupText = await getInvoicePopupText(invoicePopup);
            if (invoiceErrorRegex.test(popupText)) {
                const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-invoice-popup-error.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                await screenshotVisibleElement(invoicePopup, errorPath).catch(() => { });
                console.log(`Invoice detail popup error detected. Screenshot saved: ${errorPath}`);
                return true;
            }
        }

        // Check for error indicators on the page
        const errorSelectors = [
            tid(testIds.invoiceError),
            '[class*="error"]',
            'text=Có lỗi xảy ra',
            'text=Không thể tải dữ liệu',
        ];

        for (const selector of errorSelectors) {
            try {
                const locator = page.locator(selector).first();
                if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
                    const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-invoice-error.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                    const errorTarget = await findInvoiceDetailPopup(page);
                    if (errorTarget) {
                        await screenshotVisibleElement(errorTarget, errorPath).catch(() => { });
                    } else {
                        await locator.screenshot({ path: errorPath, animations: "disabled", timeout: 5000 }).catch(() => { });
                    }
                    console.log(`⚠️ Invoice error detected: ${selector}. Screenshot saved: ${errorPath}`);
                    return true;
                }
            } catch {
                continue;
            }
        }

        // Check URL for error patterns
        const currentUrl = page.url();
        if (currentUrl && (currentUrl.includes('error') || currentUrl.includes('Error'))) {
            console.warn(`⚠️ Invoice URL contains 'error': ${currentUrl}`);
            return true;
        }

        return false;
    }

    async function handlePrintDialog(page: Page) {
        // Try to wait a bit for print dialog to show, then press Escape to dismiss
        try {
            await page.waitForTimeout(1000);
            // Listen for new pages (popups) that might be the print dialog
            page.on('popup', async (popup) => {
                try {
                    await popup.close();
                    console.log('✅ Print dialog popup closed');
                } catch {
                    // ignore if already closed
                }
            });
            // Attempt to dismiss any print dialog if it's a DOM-based one
            const printCloseBtn = page.locator('button:has-text("Close"), button:has-text("Hủy"), button[aria-label="Close"]').first();
            if (await printCloseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await printCloseBtn.click();
                console.log('✅ Print dialog dismissed');
            }
        } catch {
            // ignore
        }
    }

    async function screenshotFullElement(locator: Locator, screenshotPath: string): Promise<void> {
        const styleState = await locator.evaluate((element) => {
            const nodes = [element as HTMLElement];
            let parent = element.parentElement;
            const marker = `pw-fullshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;

            while (parent && nodes.length < 6) {
                const style = window.getComputedStyle(parent);
                if (/(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`)) {
                    nodes.push(parent);
                }
                parent = parent.parentElement;
            }

            return nodes.map((node, index) => {
                const id = `${marker}-${index}`;
                const previous = {
                    height: node.style.height,
                    maxHeight: node.style.maxHeight,
                    overflow: node.style.overflow,
                    overflowY: node.style.overflowY,
                    marker: node.getAttribute('data-pw-fullshot-id'),
                };
                node.setAttribute('data-pw-fullshot-id', id);
                node.style.height = `${Math.max(node.scrollHeight, node.offsetHeight)}px`;
                node.style.maxHeight = 'none';
                node.style.overflow = 'visible';
                node.style.overflowY = 'visible';
                return { id, previous };
            });
        });

        try {
            await locator.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
            await locator.screenshot({
                path: screenshotPath,
                animations: "disabled",
                timeout: 5000,
            });
        } finally {
            await locator.evaluate((element, state) => {
                for (const item of state as Array<{ id: string; previous: Record<string, string | null> }>) {
                    const node = document.querySelector(`[data-pw-fullshot-id="${item.id}"]`) as HTMLElement | null;
                    if (!node) {
                        continue;
                    }
                    node.style.height = item.previous.height || '';
                    node.style.maxHeight = item.previous.maxHeight || '';
                    node.style.overflow = item.previous.overflow || '';
                    node.style.overflowY = item.previous.overflowY || '';
                    if (item.previous.marker) {
                        node.setAttribute('data-pw-fullshot-id', item.previous.marker);
                    } else {
                        node.removeAttribute('data-pw-fullshot-id');
                    }
                }
            }, styleState).catch(() => { });
        }
    }

    async function captureLargestInvoiceContainer(page: Page, testInfo: any, screenshotPath: string): Promise<string | null> {
        const candidates = page
            .locator('div, section, article, main, [role="dialog"]')
            .filter({ has: page.getByText(invoiceContentRegex) });

        const count = Math.min(await candidates.count().catch(() => 0), 60);
        let best: { locator: Locator; area: number; contentHeight: number } | null = null;
        const viewport = page.viewportSize();
        const viewportArea = viewport ? viewport.width * viewport.height : Number.MAX_SAFE_INTEGER;

        for (let index = 0; index < count; index++) {
            const candidate = candidates.nth(index);
            if (!await candidate.isVisible({ timeout: 250 }).catch(() => false)) {
                continue;
            }

            const box = await candidate.boundingBox().catch(() => null);
            if (!box || box.width < 240 || box.height < 160) {
                continue;
            }

            if (box.width * box.height > viewportArea * 0.9) {
                continue;
            }

            const contentHeight = await candidate.evaluate((element) => {
                const htmlElement = element as HTMLElement;
                return Math.max(htmlElement.scrollHeight, htmlElement.offsetHeight, htmlElement.clientHeight);
            }).catch(() => box.height);
            const area = box.width * Math.max(box.height, contentHeight);
            if (!best || area > best.area || (area === best.area && contentHeight > best.contentHeight)) {
                best = { locator: candidate, area, contentHeight };
            }
        }

        if (!best) {
            return null;
        }

        if (!await validateInvoicePassTarget(best.locator, testInfo)) {
            return '';
        }

        await screenshotFullElement(best.locator, screenshotPath);
        console.log(`✅ Invoice container screenshot captured: ${screenshotPath}`);
        return screenshotPath;
    }

    async function captureProcessingState(page: Page, testInfo: any, context: string): Promise<string | null> {
        if (page.isClosed()) {
            return null;
        }

        const processingRegex = /\u0110ang x\u1eed l\u00fd|Dang xu ly|Processing|loading|\u0110ang t\u1ea3i|Dang tai/i;
        const processingLocator = page
            .locator('button, [role="button"], [role="dialog"], form, section, article, main, div')
            .filter({ hasText: processingRegex })
            .first();

        if (!await processingLocator.isVisible({ timeout: 750 }).catch(() => false)) {
            return null;
        }

        const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-processing-stuck-${context}.png`);
        await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });

        await processingLocator.evaluate((element) => {
            document.querySelector('[data-pw-processing-capture="true"]')?.removeAttribute('data-pw-processing-capture');
            const target = element.closest('[role="dialog"], form, section, article, main, [class*="modal"], [class*="popup"], [class*="checkout"], [class*="order"]') || element;
            target.setAttribute('data-pw-processing-capture', 'true');
        }).catch(() => { });

        const captureTarget = page.locator('[data-pw-processing-capture="true"]').first();
        try {
            if (await captureTarget.isVisible({ timeout: 500 }).catch(() => false)) {
                await screenshotFullElement(captureTarget, errorPath);
            } else {
                await processingLocator.screenshot({ path: errorPath, animations: "disabled", timeout: 5000 });
            }
            console.warn(`âš ï¸ Processing state captured: ${errorPath}`);
            return errorPath;
        } catch (error) {
            console.warn(`âš ï¸ Could not capture processing state: ${(error as Error).message}`);
            return null;
        } finally {
            await page.locator('[data-pw-processing-capture="true"]').evaluate((element) => {
                element.removeAttribute('data-pw-processing-capture');
            }).catch(() => { });
        }
    }

    async function captureInvoiceScreenshot(page: Page, testInfo: any) {
        const screenshotDir = path.join('test-results', 'pass-screenshots');
        // Use a friendly filename with timestamp to avoid collisions
        const timestamp = Date.now();
        const screenshotPath = path.join(screenshotDir, `${testInfo.project.name}-invoice-${timestamp}.png`);

        console.log(`📸 Attempting to capture invoice screenshot: ${screenshotPath}`);
        await fs.mkdir(screenshotDir, { recursive: true });

        if (page.isClosed()) {
            console.warn('⚠️ Page is closed; cannot capture invoice screenshot');
            return '';
        }

        const invoiceDetailFrameResult = await captureInvoiceDetailFrame(page, testInfo, screenshotPath).catch((error) => {
            console.warn(`Could not capture invoice detail iframe: ${(error as Error).message}`);
            return null;
        });
        if (invoiceDetailFrameResult !== null) {
            return invoiceDetailFrameResult;
        }

        const invoiceDetailPopupResult = await captureInvoiceDetailPopup(page, testInfo, screenshotPath);
        if (invoiceDetailPopupResult !== null) {
            return invoiceDetailPopupResult;
        }

        const largestContainerResult = await captureLargestInvoiceContainer(page, testInfo, screenshotPath).catch(() => null);
        if (largestContainerResult !== null) {
            return largestContainerResult;
        }

        // Try to find the invoice popup and take a targeted screenshot of it
        const popupSelectors = [
            tid(testIds.invoicePopup),
            'role=dialog',
            'text=Thông tin đơn hàng',
            'text=Xác nhận đơn hàng',
            '[class*="invoice"]',
        ];

        for (const selector of popupSelectors) {
            try {
                const popupLocator = page.locator(selector).first();
                if (await popupLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
                    // Wait for any animations to finish
                    await page.waitForTimeout(500);

                    // Try to take a screenshot of just the popup element
                    try {
                        if (!await validateInvoicePassTarget(popupLocator, testInfo)) {
                            return '';
                        }
                        await screenshotVisibleElement(popupLocator, screenshotPath);
                        console.log(`✅ Invoice popup screenshot captured: ${screenshotPath}`);
                        return screenshotPath;
                    } catch (elementError) {
                        console.warn(`⚠️ Could not take popup element screenshot: ${(elementError as Error).message}`);
                        // Fall through to full page screenshot
                    }
                }
            } catch {
                continue;
            }
        }

        // If popup not found or element screenshot failed, take a full page screenshot
        if (!page.isClosed()) {
            console.log('ℹ️ Taking full page screenshot as fallback...');
            try {
                // Check for iframe-based invoice
                const invoiceModal = page.frameLocator('iframe[class*="invoice"]').locator('body').first();
                if (await invoiceModal.isVisible({ timeout: 2000 }).catch(() => false)) {
                    if (!await validateInvoicePassTarget(invoiceModal, testInfo)) {
                        return '';
                    }
                    await screenshotFullElement(invoiceModal, screenshotPath);
                    console.log(`✅ Invoice iframe screenshot captured: ${screenshotPath}`);
                    return screenshotPath;
                }
            } catch (iframeError) {
                console.warn(`⚠️ Could not take iframe screenshot: ${(iframeError as Error).message}`);
            }

            // Also try locating the last iframe on the page (invoice often opens in an iframe)
            try {
                const iframes = page.frames();
                if (iframes.length > 1) {
                    const lastFrame = iframes[iframes.length - 1];
                    const body = lastFrame.locator('body');
                    if (await body.isVisible({ timeout: 1000 }).catch(() => false)) {
                        if (!await validateInvoicePassTarget(body, testInfo)) {
                            return '';
                        }
                        await screenshotFullElement(body, screenshotPath);
                        console.log(`✅ Invoice iframe body screenshot captured: ${screenshotPath}`);
                        return screenshotPath;
                    }
                }
            } catch (frameError) {
                console.warn(`⚠️ Could not take frame screenshot: ${(frameError as Error).message}`);
            }

            // Try screenshot of modal-like containers
            try {
                const modalContainer = page.locator('[class*="modal"], [class*="popup"], [class*="overlay"]')
                    .filter({ has: page.locator("iframe") })
                    .last();

                if (!await modalContainer.isVisible({ timeout: 1000 }).catch(() => false)) {
                    throw new Error('invoice modal/iframe container is not visible');
                }
                if (!await validateInvoicePassTarget(modalContainer, testInfo)) {
                    return '';
                }
                await modalContainer.scrollIntoViewIfNeeded({ timeout: 1000 });
                await screenshotVisibleElement(modalContainer, screenshotPath);

                console.log(`✅ Invoice popup screenshot saved with popup dimensions: ${screenshotPath}`);
                return screenshotPath;
            } catch (fallbackError) {
                console.warn(`⚠️ Could not take invoice popup screenshot: ${(fallbackError as Error).message}`);
                // Ultimate fallback: full page screenshot
                try {
                    if (await captureInvoiceErrorState(page, testInfo)) {
                        console.log('[WARN] Invoice error detected during full-page fallback, skipping pass screenshot');
                        return '';
                    }

                    if (await captureProcessingState(page, testInfo, 'invoice-fallback')) {
                        console.log('[WARN] Processing state detected during invoice fallback, skipping pass screenshot');
                        return '';
                    }

                    console.warn('[WARN] No invoice popup/container target found; skipping pass full-page screenshot');
                    return '';
                } catch (ultimateError) {
                    console.warn(`⚠️ Could not take any fallback screenshot: ${(ultimateError as Error).message}`);
                }
            }
        } else {
            console.warn('⚠️ Page is closed; cannot take fallback screenshot');
        }
        return '';
    }

    async function checkEarlyPageErrors(page: Page, testInfo: any) {
        try {
            const errorText = await page.textContent('body').catch(() => '');
            if (errorText && invoiceErrorRegex.test(errorText)) {
                console.warn(`⚠️ Early page error detected: ${errorText.slice(0, 200)}`);
                const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-early-error.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: true });
                return errorPath;
            }
        } catch (e) {
            console.warn(`⚠️ Could not check early page error: ${(e as Error).message}`);
        }
        return null;
    }

    async function checkAndCaptureApiError(page: Page, testInfo: any, stepName: string) {
        try {
            // Check for API error on current page
            const pageText = await page.textContent('body').catch(() => '');
            if (pageText && invoiceErrorRegex.test(pageText)) {
                console.warn(`⚠️ API error detected at step "${stepName}"`);
                const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-api-error-${stepName}.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: true });
                console.log(`⚠️ API error screenshot saved: ${errorPath}`);
                return errorPath;
            }
        } catch (e) {
            console.warn(`⚠️ Could not check API error for step "${stepName}": ${(e as Error).message}`);
        }
        return null;
    }

    async function captureInvoice(page: Page, testInfo: any): Promise<string> {
        // Pre-check: if page is already closed, skip everything
        if (page.isClosed()) {
            throw new Error('Page is closed before invoice capture, cannot capture invoice');
        }

        console.log('⏳ Waiting for invoice popup to appear (up to 7 seconds)...');
        const initialUrl = page.url();

        // Wait for page to settle first instead of fixed timeout
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
        } catch {
            // continue anyway
        }

        try {
            const invoicePage = await findInvoiceCapturePage(page, initialUrl);

            if (invoicePage !== page) {
                console.log(`ℹ️ Invoice appears to be on a separate page: ${invoicePage.url()}`);
            }

            // Wait for invoice popup to appear
            const invoiceFound = await waitForInvoicePopup(invoicePage, invoicePage === page ? initialUrl : undefined, 1000);

            if (invoiceFound) {
                await openInvoiceDetailPopupIfAvailable(invoicePage);
                // Handle any print dialog that might appear
                await handlePrintDialog(invoicePage);

                // If the invoice detail page shows an error, capture that state first.
                const errorCaptured = await captureInvoiceErrorState(invoicePage, testInfo);
                if (errorCaptured) {
                    throw new Error('Invoice detail error detected after completing order');
                } else {
                    // Capture the invoice screenshot
                    const processingPath = await captureProcessingState(invoicePage, testInfo, 'invoice-wait');
                    if (processingPath) {
                        throw new Error(`Processing state did not finish after completing order. Screenshot: ${processingPath}`);
                    }

                    const screenshotResult = await captureInvoiceScreenshot(invoicePage, testInfo);
                    if (screenshotResult) {
                        console.log('✅ Invoice captured successfully');
                        return screenshotResult;
                    } else {
                        throw new Error('Invoice screenshot could not be captured after completing order');
                    }
                }
            } else {
                const errorCaptured = await captureInvoiceErrorState(invoicePage, testInfo);
                if (errorCaptured) {
                    throw new Error('Invoice detail error detected even though popup was not detected');
                } else {
                    const processingPath = await captureProcessingState(invoicePage, testInfo, 'invoice-wait');
                    if (processingPath) {
                        throw new Error(`Processing state did not finish after completing order. Screenshot: ${processingPath}`);
                    }

                    const screenshotResult = await captureInvoiceScreenshot(invoicePage, testInfo);
                    if (screenshotResult) {
                        console.log('ℹ️ Invoice popup was not detected, but current invoice state was captured.');
                        return screenshotResult;
                    } else {
                        throw new Error('Invoice popup was not detected and no invoice screenshot was captured');
                    }
                }
            }
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.warn(`⚠️ Error in invoice capture process: ${errorMsg}`);

            // Check if error is due to closed page
            if (/Screenshot:\s*[^\r\n]+/.test(errorMsg)) {
                console.warn('âš ï¸ Error already has a targeted screenshot; skipping invoice full-page error screenshot');
            } else if (errorMsg.includes('has been closed') || errorMsg.includes('Target page') || page.isClosed()) {
                console.warn('⚠️ Page/context closed during invoice capture; skipping error screenshot');
            } else {
                const errorPath = path.join('test-results', 'err-screenshots', `${testInfo.project.name}-invoice-error.png`);
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
            throw error;
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
                window.print = () => {
                    console.log('Print called, preventing default behavior');
                    window.dispatchEvent(new CustomEvent('printRequested'));
                };
            });

            // -------------------------------------------------------
            // SET UP GLOBAL DIALOG TRACKER (alert/confirm/prompt)
            // This must be done BEFORE any step that could trigger a dialog.
            // The handler is synchronous — it stores the dialog reference
            // without dismissing it, so we can capture a CDP screenshot.
            // -------------------------------------------------------
            const dialogTracker = dialogHandler.setupDialogTracker(page);

            const homeUrl = getProjectHomeUrl(testInfo);
            console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
            await page.goto(homeUrl);
            // Wait for page to be fully interactive instead of fixed timeout
            await page.waitForLoadState('domcontentloaded');
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
                console.warn('Page did not reach networkidle during initial load, continuing with DOM-ready state.');
            });
            await warnIfHomepageQueryWasDropped(page, homeUrl);

            // Check for dialog that might have appeared during navigation
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'page-load');

            // PRIORITY CHECK: Detect API errors at page load before proceeding
            console.log('⏳ Checking for early page load errors...');
            const earlyError = await checkEarlyPageErrors(page, testInfo);
            if (earlyError) {
                throw new Error('API error detected at initial page load - unable to proceed with test');
            }
            console.log('✅ No early page errors detected, continuing...');

            console.log('Step 2: Selecting tab...');
            await selectTab(page, websiteName, dialogTracker);
            // Check for API errors after selecting tab
            let apiError = await checkAndCaptureApiError(page, testInfo, 'select-tab');
            if (apiError) throw new Error('API error detected after selecting tab');
            // Check for dialog that might have appeared during tab selection
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'select-tab');

            console.log('Step 3: Clicking "+" button to add product...');
            await clickAddProductButton(page, dialogTracker);
            // Check for API errors after adding product
            apiError = await checkAndCaptureApiError(page, testInfo, 'add-product');
            if (apiError) throw new Error('API error detected after adding product');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'add-product');

            console.log('Step 4: Proceeding to checkout...');
            await proceedToCheckout(page, dialogTracker);
            // Check for API errors after proceeding to checkout
            apiError = await checkAndCaptureApiError(page, testInfo, 'proceed-checkout');
            if (apiError) throw new Error('API error detected during checkout');
            // Check for dialog that might have appeared during proceed to checkout
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'proceed-checkout');

            console.log('Step 5: Confirming payment...');
            await confirmPayment(page, dialogTracker);
            // Check for API errors after confirming payment
            apiError = await checkAndCaptureApiError(page, testInfo, 'confirm-payment');
            if (apiError) throw new Error('API error detected after confirming payment');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'confirm-payment');

            console.log('Step 6: Filling customer information...');
            await fillCustomerInfo(page, testCustomer);
            // Check for API errors after filling customer info
            apiError = await checkAndCaptureApiError(page, testInfo, 'fill-info');
            if (apiError) throw new Error('API error detected after filling customer information');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'fill-info');

            console.log('Step 7: Completing order...');
            await completeOrder(page, dialogTracker);
            // Check for API errors after completing order
            apiError = await checkAndCaptureApiError(page, testInfo, 'complete-order');
            if (apiError) throw new Error('API error detected after completing order');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'complete-order');

            console.log('Step 8: Capturing invoice...');
            const invoiceScreenshotPath = await captureInvoice(page, testInfo);
            await expect(
                invoiceScreenshotPath,
                `Invoice screenshot should be captured for ${websiteName}`
            ).toBeTruthy();

            console.log(`${'='.repeat(80)}\n✅ Checkout completed successfully for: ${websiteName}\n${'='.repeat(80)}\n`);

        } catch (error) {
            console.error(`\n❌ Error during checkout for ${websiteName}:`, error);

            // Use absolute path for screenshot inside test-results/err-screenshots folder
            const errorScreenshot = path.resolve(process.cwd(), 'test-results', 'err-screenshots', `${websiteName}_error.png`);
            let screenshotSaved = false;
            let screenshotPathForReport: string | undefined;
            const errorMessage = (error as Error).message || '';
            const existingScreenshot = errorMessage.match(/Screenshot:\s*([^\r\n]+)/)?.[1]?.trim();

            if (existingScreenshot) {
                const existingScreenshotPath = path.resolve(process.cwd(), existingScreenshot);
                screenshotSaved = await fs.access(existingScreenshotPath).then(() => true).catch(() => false);
                screenshotPathForReport = existingScreenshot;
            }

            if (!screenshotSaved && !page.isClosed()) {
                try {
                    await dialogHandler.captureFailureState(page, errorScreenshot);
                    screenshotSaved = await fs.access(errorScreenshot).then(() => true).catch(() => false);
                    if (screenshotSaved) {
                        console.log(`Error screenshot saved to: ${errorScreenshot}`);
                    } else {
                        await fs.mkdir(path.dirname(errorScreenshot), { recursive: true });
                        // Try CDP screenshot first (captures native dialogs if any are still showing)
                        try {
                            const cdpSession = await page.context().newCDPSession(page);
                            const { data } = await cdpSession.send('Page.captureScreenshot', {
                                format: 'png',
                                fromSurface: true,
                            });
                            const buffer = Buffer.from(data, 'base64');
                            await fs.writeFile(errorScreenshot, buffer);
                            console.log(`✅ Error screenshot saved (CDP) to: ${errorScreenshot}`);
                        } catch (cdpError) {
                            // Fallback to regular screenshot
                            await page.screenshot({ path: errorScreenshot, fullPage: true });
                            console.log(`✅ Error screenshot saved (fallback) to: ${errorScreenshot}`);
                        }
                        screenshotSaved = true;
                    }
                    // Use relative path from project root for the report (more portable)
                    screenshotPathForReport = screenshotPathForReport || path.join('test-results', 'err-screenshots', `${websiteName}_error.png`);
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
