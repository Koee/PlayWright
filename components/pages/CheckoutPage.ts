/// <reference types="node" />
import { expect, Locator, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { clickElement, fillInput, fillVisibleInputs, firstVisibleLocator, waitForConditionPoll, waitForDomReady } from '../helpers/element-actions';
import * as dialogHandler from '../helpers/dialog-handler';
import { tid, testIds } from '../../constants/testIds';
import { textRegexSelector, viLabels, viRegex } from '../../constants/vietnamese';
import { productCardSelector } from '../../constants/selectors';
import { ORDER_RESULT_TIMEOUT_MS, PRODUCT_READY_TIMEOUT_MS, SHORT_WAIT_MS, UI_READY_TIMEOUT_MS } from '../../config/test.config';
import { isBlockingPageError, throwIfBlockingPageError, waitForPromiseOrBlockingPageError } from '../helpers/page-error';

const siWebsite = 'si';

// Customer payload shape used by checkout.steps.ts.
export type CheckoutCustomer = {
    name: string;
    phone: string;
};

/**
 * Page object cho checkout flow.
 * Class nay gom cac action UI chinh: chon tab, them san pham, checkout, dien thong tin va hoan tat don.
 */
export class CheckoutPage {
    /**
     * Khoi tao CheckoutPage voi Playwright page va dialog tracker dung de bat alert/confirm trong flow.
     */
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
    /**
     * Chon tab san pham phu hop theo website.
     * Uu tien role locator, sau do fallback sang test id/text selector.
     */
    async function selectTab(page: Page, websiteName: string, dialogTracker?: dialogHandler.DialogTracker) {
        await waitForDomReady(page);

        // Checkout flow selects Chon Thung for "si"; other sites use Tui Da Dang.
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

        // Tab selector priority: data-testid, exact button text, then regex text fallback.
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

        // Tab-not-found error screenshot file name and save location.
        const errorPath = path.join('test-results', 'report', 'err', `${websiteName}-tab-not-found.png`);
        if (!page.isClosed()) {
            try {
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await dialogHandler.captureFocusedFailureState(page, errorPath, [
                    page.getByRole('tablist'),
                    page.locator('[data-testid^="tab-"]').first().locator('..'),
                    page.locator('body'),
                ]);
                console.warn(`Could not find tab "${tabText}" - saved screenshot: ${errorPath}`);
            } catch (screenshotError) {
                console.warn(`Could not save tab-not-found screenshot: ${(screenshotError as Error).message}`);
            }
        } else {
            console.warn('Page is closed; cannot capture tab-not-found screenshot');
        }

        throw new Error(`Could not find tab "${tabText}" on ${websiteName}. See screenshot: ${errorPath}`);
    }

    /**
     * Tim product card dau tien va bam nut "+" de dua san pham vao checkout flow.
     */
    async function clickAddProductButton(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        await waitForDomReady(page);
        await waitForPromiseOrBlockingPageError(
            page,
            page.locator(productCardSelector).first().waitFor({ state: 'visible', timeout: PRODUCT_READY_TIMEOUT_MS }),
            'checkout-product-ready',
            PRODUCT_READY_TIMEOUT_MS,
            [page.locator(productCardSelector).first()],
            dialogTracker
        );

        try {
            // Product add action: first visible product card, then its "+" button.
            const productCard = page.locator(productCardSelector).first();
            await expect(productCard, 'First product card should be visible before adding product').toBeVisible({ timeout: PRODUCT_READY_TIMEOUT_MS });
            const plusBtn = productCard.locator("button:enabled").filter({ hasText: "+" }).last();
            if (await plusBtn.isVisible()) {
                await plusBtn.click();
                await waitForCheckoutActionReady(page, dialogTracker);
                if (dialogTracker) {
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'add-product-click', SHORT_WAIT_MS);
                }
                console.log('Clicked "+" button in first product card');
                return;
            }
        } catch (e) {
            console.warn('Could not click "+" button in product card:', e);
        }

        // Add-product failure screenshot file name.
        const errorPath = path.join('test-results', 'report', 'err', `add-product-button-not-found-${Date.now()}.png`);
        await dialogHandler.captureFocusedFailureState(page, errorPath, [
            page.locator(productCardSelector).first(),
            page.locator('body'),
        ]);
        throw new Error(`Could not add product because no usable "+" button was found. Screenshot: ${errorPath}`);
    }

    /**
     * Doi UI sau khi them san pham cho toi khi nut dat hang/checkout san sang.
     */
    async function waitForCheckoutActionReady(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        await Promise.any([
            waitForPromiseOrBlockingPageError(
                page,
                page.getByRole('button', { name: viRegex.order }).waitFor({ state: 'visible', timeout: UI_READY_TIMEOUT_MS }),
                'checkout-action-ready-order',
                UI_READY_TIMEOUT_MS,
                [],
                dialogTracker
            ),
            waitForPromiseOrBlockingPageError(
                page,
                page.locator(tid(testIds.proceedToCheckout)).waitFor({ state: 'visible', timeout: UI_READY_TIMEOUT_MS }),
                'checkout-action-ready-proceed-testid',
                UI_READY_TIMEOUT_MS,
                [],
                dialogTracker
            ),
            waitForPromiseOrBlockingPageError(
                page,
                page.locator(tid(testIds.btnProceed)).waitFor({ state: 'visible', timeout: UI_READY_TIMEOUT_MS }),
                'checkout-action-ready-proceed-button',
                UI_READY_TIMEOUT_MS,
                [],
                dialogTracker
            ),
        ]).catch(async (error) => {
            if (error instanceof AggregateError && error.errors.some(isBlockingPageError)) {
                throw error.errors.find(isBlockingPageError);
            }
            if (isBlockingPageError(error)) {
                throw error;
            }
            await throwIfBlockingPageError(page, 'checkout-action-ready');
        });
    }


    /**
     * Bam nut di toi checkout/dat hang bang nhieu selector fallback.
     */
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

    /**
     * Xac nhan thanh toan/dat hang tren popup man hinh checkout.
     * Ham nay co xu ly truong hop dialog native chan page.evaluate.
     */
    async function confirmPayment(page: Page, dialogTracker: dialogHandler.DialogTracker) {
        // First, check if a dialog is already blocking the page (from a previous step)
        // If a dialog appeared during proceedToCheckout, it will be caught here
        const shortEvalTimeout = SHORT_WAIT_MS;
        let pageIsBlockedByDialog = false;
        try {
            await Promise.race([
                page.evaluate(() => 1 + 1),
                waitForConditionPoll(page, shortEvalTimeout).then(() => {
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
            // Native-dialog-blocked failure screenshot file name.
            const timestamp = Date.now();
            const errorPath = path.join('test-results', 'report', 'err', `confirm-payment-page-blocked-${timestamp}.png`);
            await dialogHandler.captureFailureState(page, errorPath);
            throw new Error(`Page was blocked by a dialog and could not recover. Screenshot: ${errorPath}`);
        }

        // No dialog blocking - proceed normally. Some pages do heavy work after this
        // click, so dispatch it from a browser macro-task and let evaluate return first.
        console.log(`Current URL after checkout: ${page.url()}`);

        const found = await page.evaluate((confirmPaymentPattern) => {
            const confirmPaymentRegex = new RegExp(confirmPaymentPattern, 'i');
            const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
                .filter((button) => {
                    const rect = button.getBoundingClientRect();
                    const style = window.getComputedStyle(button);
                    return Boolean(button.textContent && confirmPaymentRegex.test(button.textContent))
                        && rect.width > 0
                        && rect.height > 0
                        && style.visibility !== 'hidden'
                        && style.display !== 'none'
                        && style.pointerEvents !== 'none'
                        && !button.disabled
                        && button.getAttribute('aria-disabled') !== 'true';
                });

            const button = buttons.at(-1);
            if (!button) {
                return false;
            }

            window.setTimeout(() => {
                button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }, 0);
            return true;
        }, viRegex.confirmPayment.source).catch((e) => {
            console.warn(`page.evaluate failed: ${(e as Error).message}`);
            return false;
        });

        if (found) {
            console.log(`Confirming payment - Click dispatched on "${viLabels.confirmPayment}"`);
        } else {
            const errorPath = path.join('test-results', 'report', 'err', `confirm-payment-button-not-found-${Date.now()}.png`);
            await dialogHandler.captureFocusedFailureState(page, errorPath, [
                page.getByRole('button', { name: viRegex.confirmPayment }).last(),
                page.locator('button').filter({ hasText: viRegex.confirmPayment }).last(),
                page.locator('body'),
            ]);
            throw new Error(`Could not find a usable "${viLabels.confirmPayment}" button. Screenshot: ${errorPath}`);
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
                    const errorPath = path.join('test-results', 'report', 'err', `confirm-payment-popup-${timestamp}.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                    await dialogHandler.captureFocusedFailureState(page, errorPath, [
                        page.locator(sel).first(),
                        page.getByRole('dialog'),
                        page.locator('body'),
                    ]).catch(() => { });
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

    /**
     * Dien thong tin khach hang vao form, co fallback khi input nam trong popup/section khac nhau.
     */
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
        ];

        const phoneSelectors = [
            tid(testIds.inputPhone),
            tid(testIds.inputRecipientPhone),
            `input[placeholder*="Nhập số điện thoại"]`,
            `input[placeholder*="Nhập SĐT người nhận quà"]`,
        ];

        const nameLocators = [
            page.getByRole('textbox', { name: viRegex.customerNamePlaceholder }),
            ...nameSelectors.map((selector) => page.locator(selector)),
        ];
        const phoneLocators = [
            page.getByRole('textbox', { name: viRegex.phonePlaceholder }),
            ...phoneSelectors.map((selector) => page.locator(selector)),
        ];

        const popupLocators = getCustomerInfoPopupLocators(page);
        const visibleName = await revealFirstInput(nameLocators, 12000, page, dialogTracker, 'fill-info-wait-input');
        if (!visibleName) {
            const errorPath = path.join('test-results', 'report', 'err', 'customer-info-popup-not-found.png');
            if (!page.isClosed()) {
                await dialogHandler.captureFocusedFailureState(page, errorPath, [
                    ...popupLocators,
                    page.locator('input').first(),
                    page.locator('body'),
                ]).catch(() => { });
            }
            throw new Error(`Could not find customer info popup or input fields. See screenshot: ${errorPath}`);
        }

        const filledNames = await fillVisibleInputs(nameLocators, customer.name, 'Name', page, dialogTracker);
        if (filledNames === 0) {
            const nameFilled = await fillInput(page, nameSelectors, customer.name, 'Name', dialogTracker);
            if (!nameFilled) throw new Error(`Could not fill name for ${customer.name}`);
        }

        await revealFirstInput(phoneLocators, 5000, page, dialogTracker, 'fill-phone-wait-input');
        const filledPhones = await fillVisibleInputs(phoneLocators, customer.phone, 'Phone', page, dialogTracker);
        if (filledPhones === 0) {
            const phoneFilled = await fillInput(page, phoneSelectors, customer.phone, 'Phone', dialogTracker);
            if (!phoneFilled) throw new Error(`Could not fill phone for ${customer.phone}`);
        }
    }

    function getCustomerInfoPopupLocators(page: Page): Locator[] {
        return [
            page.getByRole('dialog').filter({ hasText: viRegex.customerInfo }),
            page.locator('[role="dialog"]').filter({ hasText: viRegex.customerInfo }),
            page.locator('section, article, div').filter({ hasText: viRegex.customerInfo }).filter({ has: page.locator('img, canvas, input, button') }),
        ];
    }

    /**
     * Mo/reveal khu vuc form de input dau tien co the visible va fill duoc.
     */
    async function revealFirstInput(
        locators: Locator[],
        timeoutMs: number,
        page: Page,
        dialogTracker: dialogHandler.DialogTracker | undefined,
        dialogContext: string
    ): Promise<Locator | null> {
        const visible = await firstVisibleLocator(locators, Math.min(timeoutMs, 4000), page, dialogTracker, dialogContext);
        if (visible) {
            return visible;
        }

        const deadline = Date.now() + Math.max(timeoutMs - 4000, 1000);
        while (Date.now() < deadline) {
            await throwIfBlockingPageError(page, dialogContext, [
                page.getByRole('dialog'),
                page.locator('body'),
            ]);

            if (dialogTracker) {
                await dialogHandler.waitAndHandleDialog(page, dialogTracker, dialogContext, 250);
            }

            for (const locator of locators) {
                const count = await locator.count().catch(() => 0);
                for (let index = 0; index < count; index++) {
                    const candidate = locator.nth(index);
                    const attached = await candidate.elementHandle().catch(() => null);
                    if (!attached) {
                        continue;
                    }

                    await candidate.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                    if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
                        return candidate;
                    }
                }
            }

            await scrollLikelyCustomerInfoContainers(page);
            const afterScroll = await firstVisibleLocator(locators, 1000, page, dialogTracker, dialogContext);
            if (afterScroll) {
                return afterScroll;
            }
        }

        return null;
    }

    /**
     * Scroll cac container co kha nang chua form thong tin khach hang.
     */
    async function scrollLikelyCustomerInfoContainers(page: Page) {
        await page.evaluate((customerInfoPattern) => {
            const customerInfoRegex = new RegExp(customerInfoPattern, 'i');
            const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
                .filter((element) => {
                    const rect = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    const canScroll = element.scrollHeight > element.clientHeight + 8;
                    const visible = rect.width > 180 && rect.height > 120;
                    const scrollable = /(auto|scroll)/i.test(style.overflowY);
                    const looksRelevant = customerInfoRegex.test(element.textContent || '') || element.querySelector('input, textarea');
                    return canScroll && visible && (scrollable || looksRelevant);
                })
                .sort((a, b) => {
                    const aHasInput = a.querySelector('input, textarea') ? 1 : 0;
                    const bHasInput = b.querySelector('input, textarea') ? 1 : 0;
                    return bHasInput - aHasInput || b.clientHeight - a.clientHeight;
                });

            for (const element of candidates.slice(0, 3)) {
                element.scrollTop = element.scrollHeight;
            }
        }, viRegex.customerInfo.source).catch(() => { });
    }

    /**
     * Bam nut hoan tat/xac nhan cuoi va doi popup dat hang bien mat hoac invoice/order result xuat hien.
     */
    async function completeOrder(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
        const selectors = [
            tid(testIds.confirmOrder),
            textRegexSelector(viRegex.confirm),
        ];

        const confirmationPopup = await findOrderConfirmationPopup(page);
        const success = await clickElement(page, selectors, 'Completing order', {
            visibilityTimeout: 3000,
            clickTimeout: 10000,
            waitForNav: false
        }, dialogTracker);

        if (!success) {
            const errorPath = path.join('test-results', 'report', 'err', `order-confirmation-popup-click-not-found-${Date.now()}.png`);
            await captureOrderConfirmationPopup(page, confirmationPopup, errorPath);
            throw new Error(`Could not complete order. Screenshot: ${errorPath}`);
        }

        if (dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'complete-order-click', SHORT_WAIT_MS);
        }

        const completed = await waitForOrderToLeaveConfirmationPopup(page, dialogTracker, ORDER_RESULT_TIMEOUT_MS);
        if (!completed) {
            const errorPath = path.join('test-results', 'report', 'err', `order-confirmation-popup-still-open-${Date.now()}.png`);
            await captureOrderConfirmationPopup(page, confirmationPopup, errorPath);
            throw new Error(`Order confirmation popup stayed open after clicking "${viLabels.confirm}". QR/loading may still be blocking order completion. Screenshot: ${errorPath}`);
        }
    }

    /**
     * Sau khi complete order, doi UI roi khoi popup confirmation de tranh chup trang thai dang xu ly.
     */
    async function waitForOrderToLeaveConfirmationPopup(
        page: Page,
        dialogTracker: dialogHandler.DialogTracker | undefined,
        timeoutMs: number
    ): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await throwIfBlockingPageError(page, 'complete-order-wait-result', [
                page.getByRole('dialog'),
                page.locator('body'),
            ]);

            if (dialogTracker) {
                await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'complete-order-wait-result', 250);
            }

            if (await hasInvoiceOrOrderResult(page)) {
                return true;
            }

            const popup = await findOrderConfirmationPopup(page);
            if (!popup) {
                return true;
            }

            await waitForConditionPoll(page, SHORT_WAIT_MS);
        }

        return false;
    }

    /**
     * Kiem tra trang da co dau hieu invoice/order result sau khi dat hang.
     */
    async function hasInvoiceOrOrderResult(page: Page): Promise<boolean> {
        const resultLocators = [
            page.getByText(viRegex.orderCode).first(),
            page.getByText(viRegex.orderInfo).first(),
            page.getByText(viRegex.orderConfirmation).first(),
            page.getByText(viRegex.invoice).first(),
            page.locator('[data-testid*="invoice"], [class*="invoice"], iframe[src*="order"], iframe[src*="code"]').first(),
        ];

        for (const locator of resultLocators) {
            if (await locator.isVisible({ timeout: 250 }).catch(() => false)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Tim popup confirmation dang hien de theo doi trang thai dat hang.
     */
    async function findOrderConfirmationPopup(page: Page): Promise<Locator | null> {
        const candidates = [
            page.getByRole('dialog').filter({ hasText: viRegex.confirm }),
            page.locator('[role="dialog"]').filter({ hasText: viRegex.confirm }),
            page.locator('form, section, article, main, div')
                .filter({ hasText: viRegex.confirm })
                .filter({ has: page.locator('button, input, textarea') }),
        ];

        for (const candidate of candidates) {
            const count = Math.min(await candidate.count().catch(() => 0), 20);
            let best: { locator: Locator; area: number; scrollHeight: number } | null = null;
            const viewport = page.viewportSize();
            const viewportArea = viewport ? viewport.width * viewport.height : Number.MAX_SAFE_INTEGER;

            for (let index = 0; index < count; index++) {
                const locator = candidate.nth(index);
                if (!await locator.isVisible({ timeout: 250 }).catch(() => false)) {
                    continue;
                }

                const box = await locator.boundingBox().catch(() => null);
                if (!box || box.width < 260 || box.height < 140) {
                    continue;
                }

                const area = box.width * box.height;
                if (area > viewportArea * 0.95) {
                    continue;
                }

                const scrollHeight = await locator.evaluate((element) => {
                    const htmlElement = element as HTMLElement;
                    return Math.max(htmlElement.scrollHeight, htmlElement.offsetHeight, htmlElement.clientHeight);
                }).catch(() => box.height);

                if (!best || area > best.area || (area === best.area && scrollHeight > best.scrollHeight)) {
                    best = { locator, area, scrollHeight };
                }
            }

            if (best) {
                return best.locator;
            }
        }

        return null;
    }

    /**
     * Chup popup confirmation khi order bi stuck/loi de report de debug hon.
     */
    async function captureOrderConfirmationPopup(
        page: Page,
        preferredPopup: Locator | null,
        errorPath: string
    ): Promise<void> {
        await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
        const popup = preferredPopup && await preferredPopup.isVisible({ timeout: 250 }).catch(() => false)
            ? preferredPopup
            : await findOrderConfirmationPopup(page);

        if (popup) {
            await screenshotFullPopup(popup, errorPath).catch(async () => {
                await popup.screenshot({ path: errorPath, animations: 'disabled', timeout: 5000 }).catch(() => { });
            });
            return;
        }

        await dialogHandler.captureFocusedFailureState(page, errorPath, [
            page.getByRole('dialog'),
            page.locator('form').first(),
            page.locator('body'),
        ]);
    }

    async function screenshotFullPopup(locator: Locator, screenshotPath: string): Promise<void> {
        await locator.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        const styleState = await locator.evaluate((element) => {
            const root = element as HTMLElement;
            const marker = `pw-order-confirmation-full-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const nodes = [
                root,
                ...Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => {
                    const style = window.getComputedStyle(node);
                    return /(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`);
                }),
            ];

            return nodes.map((node, index) => {
                const id = `${marker}-${index}`;
                const previous = {
                    height: node.style.height,
                    maxHeight: node.style.maxHeight,
                    overflow: node.style.overflow,
                    overflowY: node.style.overflowY,
                    marker: node.getAttribute('data-pw-order-confirmation-full-id'),
                };
                const fullHeight = Math.max(node.scrollHeight, node.offsetHeight, node.clientHeight);

                node.setAttribute('data-pw-order-confirmation-full-id', id);
                node.style.height = `${fullHeight}px`;
                node.style.maxHeight = 'none';
                node.style.overflow = 'visible';
                node.style.overflowY = 'visible';
                node.scrollTop = 0;

                return { id, previous };
            });
        });

        try {
            await locator.screenshot({
                path: screenshotPath,
                animations: 'disabled',
                timeout: 8000,
            });
        } finally {
            await locator.evaluate((element, state) => {
                for (const item of state as Array<{ id: string; previous: Record<string, string | null> }>) {
                    const node = document.querySelector(`[data-pw-order-confirmation-full-id="${item.id}"]`) as HTMLElement | null;
                    if (!node) {
                        continue;
                    }

                    node.style.height = item.previous.height || '';
                    node.style.maxHeight = item.previous.maxHeight || '';
                    node.style.overflow = item.previous.overflow || '';
                    node.style.overflowY = item.previous.overflowY || '';
                    if (item.previous.marker) {
                        node.setAttribute('data-pw-order-confirmation-full-id', item.previous.marker);
                    } else {
                        node.removeAttribute('data-pw-order-confirmation-full-id');
                    }
                }
            }, styleState).catch(() => { });
        }
    }
