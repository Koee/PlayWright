/// <reference types="node" />
import { expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { clickElement, fillInput, fillVisibleInputs, firstVisibleLocator } from '../helpers/element-actions';
import * as dialogHandler from '../helpers/dialog-handler';
import { tid, testIds } from '../../constants/testIds';
import { textRegexSelector, viLabels, viRegex } from '../../constants/vietnamese';

const siWebsite = 'si';

export type CheckoutCustomer = {
    name: string;
    phone: string;
};

export class CheckoutPage {
    constructor(
        private readonly page: Page,
        private readonly dialogTracker?: dialogHandler.DialogTracker
    ) { }

    async selectTab(websiteName: string) {
        return selectTab(this.page, websiteName, this.dialogTracker);
    }

    async clickAddProductButton() {
        return clickAddProductButton(this.page, this.dialogTracker);
    }

    async proceedToCheckout() {
        return proceedToCheckout(this.page, this.dialogTracker);
    }

    async confirmPayment() {
        if (!this.dialogTracker) {
            throw new Error('Dialog tracker is required before confirming payment');
        }
        return confirmPayment(this.page, this.dialogTracker);
    }

    async fillCustomerInfo(customer: CheckoutCustomer) {
        return fillCustomerInfo(this.page, customer, this.dialogTracker);
    }

    async completeOrder() {
        return completeOrder(this.page, this.dialogTracker);
    }
}
    async function selectTab(page: Page, websiteName: string, dialogTracker?: dialogHandler.DialogTracker) {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });

        const tabText = websiteName === siWebsite ? viLabels.box : viLabels.versatileBag;
        const tabRegex = websiteName === siWebsite ? viRegex.box : viRegex.versatileBag;

        const roleLocators = [
            page.getByRole('tab', { name: tabRegex }).first(),
            page.getByRole('button', { name: tabRegex }).first(),
        ];
        for (const locator of roleLocators) {
            if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
                await locator.click({ timeout: 5000 });
                if (dialogTracker) {
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'select-tab-click', 500);
                }
                console.log(`Selected tab "${tabText}" by role locator`);
                return;
            }
        }

        // Prefer data-testid if available, then role/button, then text fallback
        const selectors = [
            tid(testIds.tabSite(websiteName)),
            tid(testIds.tabText(tabText)),
            `button:has-text("${tabText}")`,
            textRegexSelector(tabRegex),
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
                        console.log(`Selected tab "${tabText}" - Selector: ${selector} (attempt ${attempt})`);
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
                console.warn(`Could not find tab "${tabText}" - saved screenshot: ${errorPath}`);
            } catch (screenshotError) {
                console.warn(`Could not save tab-not-found screenshot: ${(screenshotError as Error).message}`);
            }
        } else {
            console.warn('Page is closed; cannot capture tab-not-found screenshot');
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
                console.log('Clicked "+" button in first product card');
                return;
            }
        } catch (e) {
            console.warn('Could not click "+" button in product card:', e);
        }

        console.warn('"+" button not found in product list, continuing...');
        return;
    }


    async function proceedToCheckout(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        const selectors = [
            tid(testIds.proceedToCheckout),
            tid(testIds.btnProceed),
            textRegexSelector(viRegex.order),
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
            console.warn('Page appears to be blocked by a browser dialog. Handling...');
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'confirm-payment-precheck');
            // If the tracker did not catch the dialog, still capture the blocked state before failing.
            const timestamp = Date.now();
            const errorPath = path.join('test-results', 'err-screenshots', `confirm-payment-page-blocked-${timestamp}.png`);
            await dialogHandler.captureFailureState(page, errorPath);
            throw new Error(`Page was blocked by a dialog and could not recover. Screenshot: ${errorPath}`);
        }

        // No dialog blocking - proceed normally.
        // After clicking "Đặt Hàng", the page JS event loop may be busy/hung,
        // causing Playwright operations (click, evaluate, filter) to hang.
        // Strategy: schedule the click asynchronously via setTimeout so evaluate
        // returns immediately, then wait for the click to fire.
        await page.waitForTimeout(2000);
        console.log(`Current URL after checkout: ${page.url()}`);

        // Use page.evaluate with setTimeout to schedule the click asynchronously.
        // This returns immediately even if the page is stuck in a busy state.
        const found = await page.evaluate((confirmPaymentPattern) => {
            const confirmPaymentRegex = new RegExp(confirmPaymentPattern, 'i');
            return (() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.textContent && confirmPaymentRegex.test(btn.textContent)) {
                        // Schedule click asynchronously so evaluate returns immediately
                        setTimeout(() => {
                            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }, 100);
                        return true;
                    }
                }
                return false;
            })();
        }, viRegex.confirmPayment.source).catch((e) => {
            console.warn(`page.evaluate failed: ${(e as Error).message}`);
            return false;
        });

        // Wait a moment for the click to be processed
        await page.waitForTimeout(500);

        if (found) {
            console.log(`Confirming payment - Click dispatched on "${viLabels.confirmPayment}"`);
        } else {
            throw new Error(`Could not find "${viLabels.confirmPayment}" button`);
        }

        // Check if a JavaScript dialog (alert/confirm/prompt) was triggered by the click
        if (await dialogHandler.waitForTrackedDialog(page, dialogTracker, 1500)) {
            const { message, type, screenshotPath } = await dialogHandler.captureAndDismissDialog(page, dialogTracker, 'confirm-payment-alert');
            throw new Error(`Payment warning dialog (${type}): ${message}. Screenshot: ${screenshotPath}`);
        }

        // 2) Check for DOM-based warning/error popup elements
        const warningPopupSelectors = [
            textRegexSelector(viRegex.genericError),
            textRegexSelector(viRegex.invalidTotal),
        ];

        for (const sel of warningPopupSelectors) {
            try {
                if (await page.locator(sel).first().isVisible({ timeout: 300 })) {
                    const timestamp = Date.now();
                    const errorPath = path.join('test-results', 'err-screenshots', `confirm-payment-popup-${timestamp}.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                    await page.screenshot({ path: errorPath, fullPage: true }).catch(() => { });
                    console.warn(`Payment confirmation warning popup detected - screenshot saved: ${errorPath}`);
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

    async function fillCustomerInfo(
        page: Page,
        customer: { name: string; phone: string },
        dialogTracker?: dialogHandler.DialogTracker
    ) {
        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'fill-info-precheck');
        }

        const nameSelectors = [
            tid(testIds.inputName),
            tid(testIds.inputRecipientName),
            `input[placeholder*="Nhập tên người đặt hàng"]`,
            `input[placeholder*="Nhập tên người nhận quà"]`,
            `input[placeholder*="Nháº­p tÃªn ngÆ°á»i Ä‘áº·t hÃ ng"]`,
            `input[placeholder*="Nháº­p tÃªn ngÆ°á»i nháº­n quÃ "]`,
        ];

        const phoneSelectors = [
            tid(testIds.inputPhone),
            tid(testIds.inputRecipientPhone),
            `input[placeholder*="Nhập số điện thoại"]`,
            `input[placeholder*="Nhập SĐT người nhận quà"]`,
            `input[placeholder*="Nháº­p sá»‘ Ä‘iá»‡n thoáº¡i"]`,
            `input[placeholder*="Nháº­p SÄT ngÆ°á»i nháº­n quÃ "]`,
        ];

        const nameLocators = [
            page.getByRole('textbox', { name: viRegex.customerNamePlaceholder }),
            ...nameSelectors.map((selector) => page.locator(selector)),
        ];
        const phoneLocators = [
            page.getByRole('textbox', { name: viRegex.phonePlaceholder }),
            ...phoneSelectors.map((selector) => page.locator(selector)),
        ];

        const visibleName = await firstVisibleLocator(nameLocators, 12000, page, dialogTracker, 'fill-info-wait-input');
        if (!visibleName) {
            // Timeout waiting for customer info popup - throw error
            const errorPath = path.join('test-results', 'err-screenshots', 'customer-info-popup-not-found.png');
            await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
            if (!page.isClosed()) {
                await page.screenshot({ path: errorPath, fullPage: true }).catch(() => { });
            }
            throw new Error(`Could not find customer info popup or input fields. See screenshot: ${errorPath}`);
        }

        const filledNames = await fillVisibleInputs(nameLocators, customer.name, 'Name', page, dialogTracker);
        if (filledNames === 0) {
            const nameFilled = await fillInput(page, nameSelectors, customer.name, 'Name', dialogTracker);
            if (!nameFilled) throw new Error(`Could not fill name for ${customer.name}`);
        }

        const filledPhones = await fillVisibleInputs(phoneLocators, customer.phone, 'Phone', page, dialogTracker);
        if (filledPhones === 0) {
            const phoneFilled = await fillInput(page, phoneSelectors, customer.phone, 'Phone', dialogTracker);
            if (!phoneFilled) throw new Error(`Could not fill phone for ${customer.phone}`);
        }
    }

    async function completeOrder(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        const selectors = [
            tid(testIds.confirmOrder),
            textRegexSelector(viRegex.confirm),
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


