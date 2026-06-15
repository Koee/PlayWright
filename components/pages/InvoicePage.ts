/// <reference types="node" />
import { Locator, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { tid, testIds } from '../../constants/testIds';
import { textRegexSelector, viRegex } from '../../constants/vietnamese';
import * as dialogHandler from '../helpers/dialog-handler';
import { waitForConditionPoll, waitForDomReady } from '../helpers/element-actions';
import { SHORT_WAIT_MS, UI_READY_TIMEOUT_MS } from '../../config/test.config';
import { blockingPageErrorRegex, isBlockingPageError, throwIfBlockingPageError, waitForPromiseOrBlockingPageError } from '../helpers/page-error';

const invoiceErrorRegex = blockingPageErrorRegex;
const invoiceContentRegex = /Hóa\s+đơn\s+chi\s+tiết|Hoá\s+đơn\s+chi\s+tiết|Thông\s+tin\s+đơn\s+hàng|Xác\s+nhận\s+đơn\s+hàng|Mã\s+đơn\s+hàng|Chi\s+tiết\s+đơn\s+hàng|Hoa\s+don\s+chi\s+tiet|Thong\s+tin\s+don\s+hang|Xac\s+nhan\s+don\s+hang|Ma\s+don\s+hang|Chi\s+tiet\s+don\s+hang/i;
const invoiceDetailTitleRegex = viRegex.invoiceDetail;
const invoiceMeaningfulContentRegex = /Mã\s+đơn\s+hàng|Chi\s+tiết\s+đơn\s+hàng|Thông\s+tin\s+đơn\s+hàng|Khách\s+hàng|Số\s+điện\s+thoại|Sản\s+phẩm|Tổng\s+tiền|Thành\s+tiền|Order|Customer|Phone|Product|Total/i;
const invoiceFooterRegex = /CẢM\s+ƠN\s+QUÝ\s+KHÁCH|Cảm\s+ơn\s+quý\s+khách|Hẹn\s+gặp\s+lại/i;

function getArtifactName(testInfo: any): string {
    return testInfo.artifactName || testInfo.project?.name || 'checkout';
}

/**
 * Page object phu trach invoice/order result sau checkout.
 * Gom detection popup/page invoice, chup screenshot pass/fail va bat loi API tren man hinh.
 */
export class InvoicePage {
    /**
     * Khoi tao InvoicePage cho page dang checkout; dialog tracker giup capture popup native khi chup invoice.
     */
    constructor(
        private readonly page: Page,
        private readonly dialogTracker?: dialogHandler.DialogTracker
    ) { }

    async checkEarlyPageErrors(testInfo: any) {
        return checkEarlyPageErrors(this.page, testInfo, this.dialogTracker);
    }

    async checkAndCaptureApiError(testInfo: any, stepName: string) {
        return checkAndCaptureApiError(this.page, testInfo, stepName, this.dialogTracker);
    }

    async captureInvoice(testInfo: any): Promise<string> {
        return captureInvoice(this.page, testInfo, this.dialogTracker);
    }
}
    /**
     * Doc text body an toan, co check dialog truoc/sau de khong nuot loi native popup.
     */
    async function readBodyText(page: Page, dialogTracker: dialogHandler.DialogTracker | undefined, context: string): Promise<string> {
        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `${context}-precheck`);
        }

        const bodyText = await page.locator('body').innerText({ timeout: 1000 }).catch(async () => {
            if (dialogTracker) {
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, `${context}-after-read-failed`);
            }
            return '';
        });

        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `${context}-postcheck`);
        }

        return bodyText;
    }

    /**
     * Doi invoice xuat hien bang nhieu dau hieu: popup, dialog, URL moi hoac text invoice trong body.
     */
    async function waitForInvoicePopup(
        page: Page,
        initialUrl?: string,
        timeoutMs = 7000,
        dialogTracker?: dialogHandler.DialogTracker
    ) {
        // Wait for invoice popup to appear within reasonable time
        const popupSelectors = [
            tid(testIds.invoicePopup),
            'role=dialog',
            textRegexSelector(viRegex.orderInfo),
            textRegexSelector(viRegex.orderConfirmation),
            '[class*="invoice"]',
            textRegexSelector(viRegex.orderCode),
            textRegexSelector(viRegex.orderDetail),
            textRegexSelector(viRegex.invoice),
        ];

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await throwIfBlockingPageError(page, 'invoice-popup-wait', [
                page.getByRole('dialog'),
                page.locator('body'),
            ]);

            if (dialogTracker) {
                await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'invoice-popup-wait', 100);
            }

            for (const selector of popupSelectors) {
                try {
                    const locator = page.locator(selector).first();
                    if (await locator.isVisible({ timeout: 250 }).catch(() => false)) {
                        console.log(`OK Invoice popup detected: ${selector}`);
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // Check if the page navigated to a new URL (e.g., invoice detail page)
            const currentUrl = page.url();
            if (initialUrl && currentUrl && currentUrl !== initialUrl) {
                console.log(`INFO Page navigated to: ${currentUrl}. Treating as invoice page.`);
                return true;
            }

            const bodyText = await page.locator('body').innerText({ timeout: 250 }).catch(async () => {
                if (dialogTracker) {
                    await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'invoice-popup-body-read');
                }
                return '';
            });
            if (invoiceContentRegex.test(bodyText)) {
                console.log('OK Invoice content detected in page body');
                return true;
            }

            await waitForConditionPoll(page, SHORT_WAIT_MS);
        }

        return false;
    }

    /**
     * Neu co nut in/xem chi tiet hoa don thi mo popup/iframe chi tiet truoc khi chup.
     */
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
            .filter({ hasText: viRegex.printInvoiceDetail })
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
        await waitForDomReady(page);
        console.log('Invoice detail button clicked.');
        return true;
    }

    /**
     * Tim page/popup dang chua invoice, ke ca truong hop invoice mo ra tab/page moi.
     */
    async function findInvoiceCapturePage(
        page: Page,
        initialUrl: string,
        dialogTracker?: dialogHandler.DialogTracker
    ): Promise<{ page: Page; invoiceFound: boolean }> {
        const context = page.context();

        const candidatePages = context.pages()
            .filter(candidate => !candidate.isClosed())
            .reverse();

        for (const candidate of candidatePages) {
            await candidate.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => { });
            if (await waitForInvoicePopup(candidate, candidate === page ? initialUrl : undefined, 7000, candidate === page ? dialogTracker : undefined)) {
                return { page: candidate, invoiceFound: true };
            }
        }

        const newPage = await context.waitForEvent('page', { timeout: 1000 }).catch(() => null);
        if (newPage && !newPage.isClosed()) {
            await newPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => { });
            await waitForDomReady(newPage);
            if (await waitForInvoicePopup(newPage)) {
                return { page: newPage, invoiceFound: true };
            }
            return { page: newPage, invoiceFound: false };
        }

        return { page, invoiceFound: false };
    }

    /**
     * Tim container invoice detail tot nhat dua tren title/content/iframe va kich thuoc hien thi.
     */
    async function findInvoiceDetailPopup(page: Page): Promise<Locator | null> {
        const marker = await page.evaluate(({ titlePattern, contentPattern }) => {
            const titleRegex = new RegExp(titlePattern, 'i');
            const contentRegex = new RegExp(contentPattern, 'i');
            const markerValue = `pw-invoice-detail-popup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const viewportArea = window.innerWidth * window.innerHeight;

            document.querySelectorAll('[data-pw-invoice-detail-popup]').forEach((element) => {
                element.removeAttribute('data-pw-invoice-detail-popup');
            });

            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0
                    && rect.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none';
            };

            const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
                .map((element) => {
                    const rect = element.getBoundingClientRect();
                    const area = rect.width * rect.height;
                    const text = element.innerText || element.textContent || '';
                    const className = String(element.className || '');
                    const role = element.getAttribute('role') || '';
                    const hasIframe = Boolean(element.querySelector('iframe'));
                    const hasTitle = titleRegex.test(text);
                    const hasContent = contentRegex.test(text);
                    const shellHint = /dialog/i.test(role) || /modal|popup|dialog|invoice|order/i.test(className);

                    return { element, rect, area, hasIframe, hasTitle, hasContent, shellHint };
                })
                .filter(({ element, rect, area, hasTitle }) => {
                    return hasTitle
                        && isVisible(element)
                        && rect.width >= 280
                        && rect.height >= 160
                        && area < viewportArea * 0.9;
                });

            let best = candidates
                .filter((candidate) => candidate.hasIframe)
                .sort((left, right) => {
                    const leftScore = (left.shellHint ? -100000 : 0) + (left.hasContent ? -50000 : 0) + left.area;
                    const rightScore = (right.shellHint ? -100000 : 0) + (right.hasContent ? -50000 : 0) + right.area;
                    return leftScore - rightScore;
                })[0];

            if (!best) {
                best = candidates
                    .sort((left, right) => {
                        const leftScore = (left.shellHint ? -100000 : 0) + (left.hasContent ? -50000 : 0) + left.area;
                        const rightScore = (right.shellHint ? -100000 : 0) + (right.hasContent ? -50000 : 0) + right.area;
                        return leftScore - rightScore;
                    })[0];
            }

            if (!best) {
                return null;
            }

            best.element.setAttribute('data-pw-invoice-detail-popup', markerValue);
            return markerValue;
        }, {
            titlePattern: invoiceDetailTitleRegex.source,
            contentPattern: invoiceMeaningfulContentRegex.source,
        }).catch(() => null);

        if (!marker) {
            return null;
        }

        const popup = page.locator(`[data-pw-invoice-detail-popup="${marker}"]`).first();
        if (!await popup.isVisible({ timeout: 250 }).catch(() => false)) {
            return null;
        }

        return popup;
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

    async function findInvoiceFrameInPopup(popup: Locator) {
        const iframes = popup.locator('iframe');
        const count = await iframes.count().catch(() => 0);

        for (let index = 0; index < count; index++) {
            const iframe = iframes.nth(index);
            const handle = await iframe.elementHandle().catch(() => null);
            const frame = await handle?.contentFrame().catch(() => null);
            if (!frame) {
                continue;
            }

            const frameText = await frame.locator('body').innerText({ timeout: 1000 }).catch(() => '');
            const frameUrl = frame.url();
            if (
                /order\.html|code=/.test(frameUrl)
                || invoiceDetailTitleRegex.test(frameText)
                || invoiceContentRegex.test(frameText)
                || invoiceErrorRegex.test(frameText)
                || invoiceMeaningfulContentRegex.test(frameText)
            ) {
                return { iframe, frame, text: frameText };
            }
        }

        return null;
    }

    /**
     * Chup trang thai invoice khong hop le de tranh pass screenshot vao container sai.
     */
    async function captureInvalidInvoiceTarget(
        locator: Locator,
        testInfo: any,
        reason: 'error' | 'missing-content',
        preferredPath?: string,
    ): Promise<string> {
        const errorPath = preferredPath
            ?? path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-invoice-popup-${reason}-${Date.now()}.png`);
        await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
        await screenshotVisibleElement(locator, errorPath).catch(async () => {
            await screenshotFullElement(locator, errorPath).catch(() => { });
        });
        console.warn(`Invoice target rejected for ${reason}. Screenshot saved: ${errorPath}`);
        return errorPath;
    }

    async function getInvoiceTargetText(locator: Locator): Promise<string> {
        const popupText = await getInvoicePopupText(locator);
        const invoiceFrame = await findInvoiceFrameInPopup(locator);
        return [popupText, invoiceFrame?.text || ''].join('\n');
    }

    /**
     * Xac nhan target chup pass that su co noi dung invoice co y nghia.
     */
    async function validateInvoicePassTarget(locator: Locator, testInfo: any): Promise<boolean> {
        const targetText = await getInvoiceTargetText(locator);
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

    /**
     * Scroll popup invoice toi footer/cam on de chup du noi dung hoa don dai.
     */
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

            await waitForConditionPoll(popup.page(), 250);
        }

        return false;
    }

    async function screenshotInvoicePopupFullContent(popup: Locator, screenshotPath: string): Promise<void> {
        await popup.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        await scrollInvoicePopupToFooter(popup);

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

    async function screenshotInvoicePopupWithExpandedFrame(popup: Locator, screenshotPath: string): Promise<void> {
        await popup.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        const invoiceFrame = await findInvoiceFrameInPopup(popup);
        if (!invoiceFrame) {
            await screenshotInvoicePopupFullContent(popup, screenshotPath);
            return;
        }

        const frameSize = await invoiceFrame.frame.evaluate(() => {
            const elements = Array.from(document.querySelectorAll<HTMLElement>('body, body *'));
            const maxElementBottom = elements.reduce((max, element) => {
                const rect = element.getBoundingClientRect();
                const bottom = rect.bottom + window.scrollY;
                return Math.max(max, bottom, element.scrollHeight, element.offsetHeight, element.clientHeight);
            }, 0);

            return {
                width: Math.ceil(Math.max(
                    document.documentElement.scrollWidth,
                    document.body?.scrollWidth || 0,
                    document.documentElement.clientWidth,
                    document.body?.clientWidth || 0,
                )),
                height: Math.ceil(Math.max(
                    maxElementBottom,
                    document.documentElement.scrollHeight,
                    document.body?.scrollHeight || 0,
                    document.documentElement.offsetHeight,
                    document.body?.offsetHeight || 0,
                )),
            };
        }).catch(() => null);

        if (!frameSize) {
            await screenshotInvoicePopupFullContent(popup, screenshotPath);
            return;
        }

        const styleState = await popup.evaluate((element, size) => {
            const root = element as HTMLElement;
            const marker = `pw-invoice-popup-frame-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const rootRect = root.getBoundingClientRect();
            const nodes: HTMLElement[] = [root];
            let parent = root.parentElement;

            while (parent && parent !== document.body && parent !== document.documentElement && nodes.length < 8) {
                const style = window.getComputedStyle(parent);
                if (/(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`) || style.position === 'fixed') {
                    nodes.push(parent);
                }
                parent = parent.parentElement;
            }

            nodes.push(...Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => {
                const style = window.getComputedStyle(node);
                return node.tagName.toLowerCase() === 'iframe'
                    || /(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowY}`);
            }));

            return nodes.map((node, index) => {
                const id = `${marker}-${index}`;
                const previous = {
                    position: node.style.position,
                    top: node.style.top,
                    right: node.style.right,
                    bottom: node.style.bottom,
                    left: node.style.left,
                    transform: node.style.transform,
                    height: node.style.height,
                    maxHeight: node.style.maxHeight,
                    minHeight: node.style.minHeight,
                    width: node.style.width,
                    maxWidth: node.style.maxWidth,
                    overflow: node.style.overflow,
                    overflowY: node.style.overflowY,
                    marker: node.getAttribute('data-pw-invoice-popup-frame-id'),
                };
                const iframe = node instanceof HTMLIFrameElement ? node : null;
                const containedIframe = node === root ? root.querySelector('iframe') : null;
                const containedIframeHeight = containedIframe
                    ? Math.max(containedIframe.offsetHeight, containedIframe.clientHeight)
                    : 0;
                const expandedIframeDelta = containedIframeHeight > 0
                    ? Math.max(size.height - containedIframeHeight, 0)
                    : 0;
                const targetHeight = iframe
                    ? Math.max(size.height, iframe.offsetHeight, iframe.clientHeight)
                    : Math.max(node.scrollHeight + expandedIframeDelta, node.offsetHeight + expandedIframeDelta, node.clientHeight + expandedIframeDelta);

                node.setAttribute('data-pw-invoice-popup-frame-id', id);
                node.style.height = `${targetHeight}px`;
                node.style.maxHeight = 'none';
                node.style.minHeight = `${targetHeight}px`;
                node.style.maxWidth = 'none';
                node.style.overflow = 'visible';
                node.style.overflowY = 'visible';

                if (node === root) {
                    node.style.position = 'absolute';
                    node.style.top = '40px';
                    node.style.left = `${Math.max(rootRect.left, 0)}px`;
                    node.style.right = 'auto';
                    node.style.bottom = 'auto';
                    node.style.transform = 'none';
                    node.style.width = `${Math.ceil(rootRect.width)}px`;
                }

                if (iframe) {
                    node.style.width = '100%';
                }

                return { id, previous };
            });
        }, frameSize);

        try {
            await popup.evaluate((element) => {
                const root = element as HTMLElement;
                const bottom = Math.ceil(root.getBoundingClientRect().bottom + window.scrollY + 40);
                document.documentElement.style.minHeight = `${bottom}px`;
                document.body.style.minHeight = `${bottom}px`;
                window.scrollTo(0, 0);
            }).catch(() => { });
            await invoiceFrame.frame.evaluate(() => window.scrollTo(0, 0)).catch(() => { });
            await popup.screenshot({
                path: screenshotPath,
                animations: "disabled",
                timeout: 10000,
            });
        } finally {
            await popup.evaluate((element, state) => {
                for (const item of state as Array<{ id: string; previous: Record<string, string | null> }>) {
                    const node = document.querySelector(`[data-pw-invoice-popup-frame-id="${item.id}"]`) as HTMLElement | null;
                    if (!node) {
                        continue;
                    }
                    node.style.position = item.previous.position || '';
                    node.style.top = item.previous.top || '';
                    node.style.right = item.previous.right || '';
                    node.style.bottom = item.previous.bottom || '';
                    node.style.left = item.previous.left || '';
                    node.style.transform = item.previous.transform || '';
                    node.style.height = item.previous.height || '';
                    node.style.maxHeight = item.previous.maxHeight || '';
                    node.style.minHeight = item.previous.minHeight || '';
                    node.style.width = item.previous.width || '';
                    node.style.maxWidth = item.previous.maxWidth || '';
                    node.style.overflow = item.previous.overflow || '';
                    node.style.overflowY = item.previous.overflowY || '';
                    if (item.previous.marker) {
                        node.setAttribute('data-pw-invoice-popup-frame-id', item.previous.marker);
                    } else {
                        node.removeAttribute('data-pw-invoice-popup-frame-id');
                    }
                }
                document.documentElement.style.minHeight = '';
                document.body.style.minHeight = '';
            }, styleState).catch(() => { });
        }
    }

    /**
     * Thu chup invoice detail popup bang target locator tot nhat.
     */
    async function captureInvoiceDetailPopup(page: Page, testInfo: any, passScreenshotPath: string): Promise<string | null> {
        const popup = await findInvoiceDetailPopup(page);
        if (!popup) {
            return null;
        }

        await popup.waitFor({ state: 'visible', timeout: SHORT_WAIT_MS }).catch(() => { });
        const popupText = await getInvoiceTargetText(popup);
        const invoiceFrame = await findInvoiceFrameInPopup(popup);
        const combinedText = [popupText, invoiceFrame?.text || ''].join('\n');
        const hasInvoiceError = invoiceErrorRegex.test(combinedText);
        const hasMeaningfulContent = invoiceMeaningfulContentRegex.test(combinedText);
        const targetDir = hasInvoiceError || !hasMeaningfulContent
            ? path.join('test-results', 'err-screenshots')
            : path.dirname(passScreenshotPath);
        const targetPath = hasInvoiceError || !hasMeaningfulContent
            ? path.join(targetDir, `${getArtifactName(testInfo)}-invoice-popup-error-${Date.now()}.png`)
            : passScreenshotPath;

        await fs.mkdir(targetDir, { recursive: true }).catch(() => { });
        try {
            if (hasInvoiceError || !hasMeaningfulContent) {
                await screenshotVisibleElement(popup, targetPath);
            } else {
                const hasFooter = invoiceFooterRegex.test(combinedText) || await scrollInvoicePopupToFooter(popup);
                if (!hasFooter) {
                    console.warn('Invoice detail footer was not detected before capture; continuing with full popup content screenshot');
                }
                await screenshotInvoicePopupWithExpandedFrame(popup, targetPath);
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

    /**
     * Thu chup invoice nam trong iframe khi popup render noi dung qua frame.
     */
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
                const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-invoice-frame-error-${Date.now()}.png`);
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

    /**
     * Phat hien va chup loi invoice/API hien tren page sau khi dat hang.
     */
    async function captureInvoiceErrorState(page: Page, testInfo: any) {
        const invoicePopup = await findInvoiceDetailPopup(page);
        if (invoicePopup) {
            const popupText = await getInvoiceTargetText(invoicePopup);
            if (invoiceErrorRegex.test(popupText)) {
                const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-invoice-popup-error.png`);
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
            textRegexSelector(viRegex.genericError),
            textRegexSelector(viRegex.loadDataError),
        ];

        for (const selector of errorSelectors) {
            try {
                const locator = page.locator(selector).first();
                if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
                    const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-invoice-error.png`);
                    await fs.mkdir(path.dirname(errorPath), { recursive: true }).catch(() => { });
                    const errorTarget = await findInvoiceDetailPopup(page);
                    if (errorTarget) {
                        await screenshotVisibleElement(errorTarget, errorPath).catch(() => { });
                    } else {
                        await locator.screenshot({ path: errorPath, animations: "disabled", timeout: 5000 }).catch(() => { });
                    }
                    console.log(`WARN Invoice error detected: ${selector}. Screenshot saved: ${errorPath}`);
                    return true;
                }
            } catch {
                continue;
            }
        }

        // Check URL for error patterns
        const currentUrl = page.url();
        if (currentUrl && (currentUrl.includes('error') || currentUrl.includes('Error'))) {
            console.warn(`WARN Invoice URL contains 'error': ${currentUrl}`);
            return true;
        }

        return false;
    }

    /**
     * Xu ly/suppress print dialog de automation khong bi chan khi invoice goi window.print.
     */
    async function handlePrintDialog(page: Page) {
        // Try to catch a print popup, then press Escape to dismiss DOM/browser fallback UI.
        try {
            const printPopup = await page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
            if (printPopup) {
                await printPopup.close().catch(() => { });
                console.log('OK Print dialog popup closed');
            }
            // Attempt to dismiss any print dialog if it's a DOM-based one
            const printCloseBtn = page
                .locator('button, [role="button"], button[aria-label="Close"]')
                .filter({ hasText: /Close|Hủy|Huy/i })
                .first();
            if (await printCloseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await printCloseBtn.click();
                console.log('OK Print dialog dismissed');
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

    /**
     * Fallback chup container lon nhat co text invoice khi popup/iframe detector khong bat duoc.
     */
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
        console.log(`OK Invoice container screenshot captured: ${screenshotPath}`);
        return screenshotPath;
    }

    /**
     * Chup trang thai dang xu ly neu invoice/order bi stuck o processing.
     */
    async function captureProcessingState(page: Page, testInfo: any, context: string): Promise<string | null> {
        if (page.isClosed()) {
            return null;
        }

        const processingRegex = viRegex.processing;
        const processingLocator = page
            .locator('button, [role="button"], [role="dialog"], form, section, article, main, div')
            .filter({ hasText: processingRegex })
            .first();

        if (!await processingLocator.isVisible({ timeout: 750 }).catch(() => false)) {
            return null;
        }

        const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-processing-stuck-${context}.png`);
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
            console.warn(`WARN Processing state captured: ${errorPath}`);
            return errorPath;
        } catch (error) {
            console.warn(`WARN Could not capture processing state: ${(error as Error).message}`);
            return null;
        } finally {
            await page.locator('[data-pw-processing-capture="true"]').evaluate((element) => {
                element.removeAttribute('data-pw-processing-capture');
            }).catch(() => { });
        }
    }

    /**
     * Flow chup invoice pass: thu popup detail, iframe, container lon, roi moi fallback co kiem tra loi.
     */
    async function captureInvoiceScreenshot(page: Page, testInfo: any) {
        const screenshotDir = path.join('test-results', 'pass-screenshots');
        // Use a friendly filename with timestamp to avoid collisions
        const timestamp = Date.now();
        const screenshotPath = path.join(screenshotDir, `${getArtifactName(testInfo)}-invoice-${timestamp}.png`);

        console.log(`SCREENSHOT Attempting to capture invoice screenshot: ${screenshotPath}`);
        await fs.mkdir(screenshotDir, { recursive: true });

        if (page.isClosed()) {
            console.warn('WARN Page is closed; cannot capture invoice screenshot');
            return '';
        }

        const invoiceDetailPopupResult = await captureInvoiceDetailPopup(page, testInfo, screenshotPath);
        if (invoiceDetailPopupResult !== null) {
            return invoiceDetailPopupResult;
        }

        const invoiceDetailFrameResult = await captureInvoiceDetailFrame(page, testInfo, screenshotPath).catch((error) => {
            console.warn(`Could not capture invoice detail iframe: ${(error as Error).message}`);
            return null;
        });
        if (invoiceDetailFrameResult !== null) {
            return invoiceDetailFrameResult;
        }

        const largestContainerResult = await captureLargestInvoiceContainer(page, testInfo, screenshotPath).catch(() => null);
        if (largestContainerResult !== null) {
            return largestContainerResult;
        }

        // Try to find the invoice popup and take a targeted screenshot of it
        const popupSelectors = [
            tid(testIds.invoicePopup),
            'role=dialog',
            textRegexSelector(viRegex.orderInfo),
            textRegexSelector(viRegex.orderConfirmation),
            '[class*="invoice"]',
        ];

        for (const selector of popupSelectors) {
            try {
                const popupLocator = page.locator(selector).first();
                if (await popupLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await popupLocator.waitFor({ state: 'visible', timeout: SHORT_WAIT_MS }).catch(() => { });

                    // Try to take a screenshot of just the popup element
                    try {
                        if (!await validateInvoicePassTarget(popupLocator, testInfo)) {
                            return '';
                        }
                        await screenshotVisibleElement(popupLocator, screenshotPath);
                        console.log(`OK Invoice popup screenshot captured: ${screenshotPath}`);
                        return screenshotPath;
                    } catch (elementError) {
                        console.warn(`WARN Could not take popup element screenshot: ${(elementError as Error).message}`);
                        // Fall through to full page screenshot
                    }
                }
            } catch {
                continue;
            }
        }

        // If popup not found or element screenshot failed, take a full page screenshot
        if (!page.isClosed()) {
            console.log('INFO Taking full page screenshot as fallback...');
            try {
                // Check for iframe-based invoice
                const invoiceModal = page.frameLocator('iframe[class*="invoice"]').locator('body').first();
                if (await invoiceModal.isVisible({ timeout: 2000 }).catch(() => false)) {
                    if (!await validateInvoicePassTarget(invoiceModal, testInfo)) {
                        return '';
                    }
                    await screenshotFullElement(invoiceModal, screenshotPath);
                    console.log(`OK Invoice iframe screenshot captured: ${screenshotPath}`);
                    return screenshotPath;
                }
            } catch (iframeError) {
                console.warn(`WARN Could not take iframe screenshot: ${(iframeError as Error).message}`);
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
                        console.log(`OK Invoice iframe body screenshot captured: ${screenshotPath}`);
                        return screenshotPath;
                    }
                }
            } catch (frameError) {
                console.warn(`WARN Could not take frame screenshot: ${(frameError as Error).message}`);
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

                console.log(`OK Invoice popup screenshot saved with popup dimensions: ${screenshotPath}`);
                return screenshotPath;
            } catch (fallbackError) {
                console.warn(`WARN Could not take invoice popup screenshot: ${(fallbackError as Error).message}`);
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
                    console.warn(`WARN Could not take any fallback screenshot: ${(ultimateError as Error).message}`);
                }
            }
        } else {
            console.warn('WARN Page is closed; cannot take fallback screenshot');
        }
        return '';
    }

    /**
     * Check loi API/page ngay sau khi load homepage de dung flow som neu site da loi.
     */
    async function checkEarlyPageErrors(
        page: Page,
        testInfo: any,
        dialogTracker?: dialogHandler.DialogTracker
    ) {
        try {
            const errorText = await readBodyText(page, dialogTracker, 'early-page-error-check');
            if (errorText && invoiceErrorRegex.test(errorText)) {
                console.warn(`WARN Early page error detected: ${errorText.slice(0, 200)}`);
                const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-early-error.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: false });
                return errorPath;
            }
        } catch (e) {
            console.warn(`WARN Could not check early page error: ${(e as Error).message}`);
        }
        return null;
    }

    /**
     * Check loi API sau tung step checkout va chup screenshot tai step bi loi.
     */
    async function checkAndCaptureApiError(
        page: Page,
        testInfo: any,
        stepName: string,
        dialogTracker?: dialogHandler.DialogTracker
    ) {
        try {
            // Check for API error on current page
            const pageText = await readBodyText(page, dialogTracker, `api-error-check-${stepName}`);
            if (pageText && invoiceErrorRegex.test(pageText)) {
                console.warn(`WARN API error detected at step "${stepName}"`);
                const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-api-error-${stepName}.png`);
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: false });
                console.log(`WARN API error screenshot saved: ${errorPath}`);
                return errorPath;
            }
        } catch (e) {
            console.warn(`WARN Could not check API error for step "${stepName}": ${(e as Error).message}`);
        }
        return null;
    }

    /**
     * Flow tong de tim invoice sau complete order, validate noi dung va tra ve screenshot pass.
     */
    async function captureInvoice(
        page: Page,
        testInfo: any,
        dialogTracker?: dialogHandler.DialogTracker
    ): Promise<string> {
        // Pre-check: if page is already closed, skip everything
        if (page.isClosed()) {
            throw new Error('Page is closed before invoice capture, cannot capture invoice');
        }

        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'invoice-capture-precheck');
        }

        console.log('WAIT Waiting for invoice popup to appear (up to 7 seconds)...');
        const initialUrl = page.url();

        // Wait for page to settle first with DOM readiness and dialog checks.
        try {
            const readyWait = waitForPromiseOrBlockingPageError(
                page,
                waitForDomReady(page, UI_READY_TIMEOUT_MS).catch(() => { }),
                'invoice-ready-wait',
                UI_READY_TIMEOUT_MS,
                [page.getByRole('dialog'), page.locator('body')],
                dialogTracker
            );
            if (dialogTracker) {
                await readyWait;
            } else {
                await readyWait;
            }
        } catch (error) {
            if (isBlockingPageError(error)) {
                throw error;
            }
            // continue when only DOM-ready settling failed; invoice detection below is authoritative.
        }

        try {
            const invoiceCapture = await findInvoiceCapturePage(page, initialUrl, dialogTracker);
            const invoicePage = invoiceCapture.page;

            if (invoicePage !== page) {
                console.log(`INFO Invoice appears to be on a separate page: ${invoicePage.url()}`);
            }

            // Reuse the detection result from findInvoiceCapturePage to avoid duplicate waits/logs.
            const invoiceFound = invoiceCapture.invoiceFound
                || await waitForInvoicePopup(invoicePage, invoicePage === page ? initialUrl : undefined, 1000, invoicePage === page ? dialogTracker : undefined);

            if (invoiceFound) {
                if (invoicePage === page && dialogTracker) {
                    await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'invoice-found');
                }
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
                        console.log('OK Invoice captured successfully');
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
                        console.log('INFO Invoice popup was not detected, but current invoice state was captured.');
                        return screenshotResult;
                    } else {
                        throw new Error('Invoice popup was not detected and no invoice screenshot was captured');
                    }
                }
            }
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.warn(`WARN Error in invoice capture process: ${errorMsg}`);

            // Check if error is due to closed page
            if (/Screenshot:\s*[^\r\n]+/.test(errorMsg)) {
                console.warn('WARN Error already has a targeted screenshot; skipping invoice full-page error screenshot');
            } else if (errorMsg.includes('has been closed') || errorMsg.includes('Target page') || page.isClosed()) {
                console.warn('WARN Page/context closed during invoice capture; skipping error screenshot');
            } else {
                const errorPath = path.join('test-results', 'err-screenshots', `${getArtifactName(testInfo)}-invoice-error.png`);
                if (!page.isClosed()) {
                    try {
                        await fs.mkdir(path.dirname(errorPath), { recursive: true });
                        await page.screenshot({ path: errorPath, fullPage: false });
                        console.log(`Error screenshot saved: ${errorPath}`);
                    } catch (screenshotError) {
                        console.warn(`WARN Could not take invoice error screenshot: ${(screenshotError as Error).message}`);
                    }
                } else {
                    console.warn('WARN Cannot capture invoice error screenshot because the page is already closed.');
                }
            }
            throw error;
        }
    }



