/// <reference types="node" />
import { expect, Locator, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { clickElement } from '../helpers/element-actions';
import { warnIfHomepageQueryWasDropped } from '../helpers/navigation';
import { productCardSelector } from '../../constants/selectors';
import { appendErrorReport } from '../../utils/reportUtils';
import { textRegexSelector, viLabels, viRegex } from '../../constants/vietnamese';

export class CopyPage {
    constructor(private readonly page: Page) { }

    async ensureScreenshotDirectories() {
        return ensureScreenshotDirectories();
    }

    getTabsForWebsite(websiteName: string): TabConfig[] {
        return getTabsForWebsite(websiteName);
    }

    async testCopyInTab(websiteName: string, tabConfig: TabConfig, homeUrl: string) {
        return testCopyInTab(this.page, websiteName, tabConfig, homeUrl);
    }
}
    const labels = {
        singleBag: viLabels.singleBag,
        doubleBag: viLabels.doubleBag,
        versatileBag: viLabels.versatileBag,
        mergedOrder: viLabels.mergedOrder,
        box: viLabels.box,
        checkout: viLabels.checkout,
        order: viLabels.order,
        copy: viLabels.copy,
        copied: viLabels.copied,
        processing: viLabels.processing,
    } as const;

    type TabConfig = {
        tabName: string;
        displayName: string;
        selectors: string[];
    };

    // Configuration for tabs to test
    const tabsToTestDefault: TabConfig[] = [
        { tabName: labels.singleBag, displayName: 'Tui-Don', selectors: [textRegexSelector(viRegex.singleBag), `button:has-text("${labels.singleBag}")`, textRegexSelector(viRegex.mergedOrder), `button:has-text("${labels.mergedOrder}")`] },
        { tabName: labels.doubleBag, displayName: 'Tui-Doi', selectors: [textRegexSelector(viRegex.doubleBag), `button:has-text("${labels.doubleBag}")`] },
        { tabName: labels.versatileBag, displayName: 'Tui-Da-Dang', selectors: [textRegexSelector(viRegex.versatileBag), `button:has-text("${labels.versatileBag}")`] },
    ];

    const tabsToTestSi: TabConfig[] = [
        { tabName: labels.box, displayName: 'Chon-Thung', selectors: [textRegexSelector(viRegex.box), `button:has-text("${labels.box}")`] },
    ];

    // Helper function to get tabs for specific website
    const getTabsForWebsite = (websiteName: string): TabConfig[] => {
        return websiteName === 'si' ? tabsToTestSi : tabsToTestDefault;
    };

    const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const getTabAliases = (tabName: string): string[] => {
        const aliases: Record<string, string[]> = {
            [labels.singleBag]: [labels.singleBag, 'Túi Đơn', labels.mergedOrder, 'Túi Đơn Ghép', 'Túi Đơn ghép', 'Tui Don'],
            [labels.doubleBag]: [labels.doubleBag, 'Túi Đôi', 'Tui Doi'],
            [labels.versatileBag]: [labels.versatileBag, 'Túi Đa Dạng', 'Tui Da Dang'],
            [labels.box]: [labels.box, 'Chọn Thùng', 'Chon Thung'],
        };

        return aliases[tabName] ?? [tabName];
    };

    const isUsableButton = async (button: Locator): Promise<boolean> => {
        return button.evaluate((element) => {
            const htmlButton = element as HTMLButtonElement;
            const rect = htmlButton.getBoundingClientRect();
            const style = window.getComputedStyle(htmlButton);
            const ariaDisabled = htmlButton.getAttribute('aria-disabled') === 'true';
            const className = String(htmlButton.getAttribute('class') || '').toLowerCase();

            return rect.width > 0
                && rect.height > 0
                && style.visibility !== 'hidden'
                && style.display !== 'none'
                && style.pointerEvents !== 'none'
                && !htmlButton.disabled
                && !ariaDisabled
                && !className.includes('disabled')
                && !className.includes('cursor-not-allowed')
                && Number(style.opacity || '1') > 0.3;
        }).catch(() => false);
    };

    const findUsableButtonByText = async (page: Page, textPattern: RegExp, preferLast = true) => {
        const buttons = page.locator('button').filter({ hasText: textPattern });
        const count = await buttons.count();
        const indexes = Array.from({ length: count }, (_, index) => preferLast ? count - 1 - index : index);

        for (const index of indexes) {
            const button = buttons.nth(index);
            if (await button.isVisible({ timeout: 1000 }).catch(() => false) && await isUsableButton(button)) {
                return button;
            }
        }

        return null;
    };

    const findUsableCheckoutButtonInCard = async (card: Locator): Promise<Locator | null> => {
        const buttons = card.locator('button').filter({ hasText: viRegex.checkout });
        const buttonCount = await buttons.count();

        for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex++) {
            const button = buttons.nth(buttonIndex);
            if (await button.isVisible({ timeout: 1000 }).catch(() => false) && await isUsableButton(button)) {
                return button;
            }
        }

        return null;
    };

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Create test-results directories if they don't exist
     */
    async function ensureScreenshotDirectories() {
        const passDir = path.join('test-results', 'pass-screenshots');
        const errDir = path.join('test-results', 'err-screenshots');
        await fs.mkdir(passDir, { recursive: true });
        await fs.mkdir(errDir, { recursive: true });
        console.log(`Screenshot directories ready: ${passDir}, ${errDir}`);
    }

    /**
     * Select a tab
     */
    async function selectTab(page: Page, tabName: string, tabSelectors: string[]): Promise<boolean> {
        try {
            await page.waitForLoadState('networkidle');

            let success = false;
            for (const alias of getTabAliases(tabName)) {
                const tabButton = page.getByRole('button', { name: new RegExp(escapeRegExp(alias), 'i') }).first();
                if (await tabButton.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await tabButton.scrollIntoViewIfNeeded();
                    await tabButton.click({ timeout: 10000 });
                    console.log(`Selecting tab: "${tabName}" - Button alias: ${alias}`);
                    success = true;
                    break;
                }
            }

            if (!success) {
                success = await clickElement(
                    page,
                    tabSelectors,
                    `Selecting tab: "${tabName}"`,
                    { visibilityTimeout: 3000, clickTimeout: 10000, waitForNav: false }
                );
            }

            if (success) {
                // Wait for products to load in the tab - use multiple selectors for different websites
                await page.waitForLoadState('networkidle').catch(() => { });
                const productsVisible = await page.locator(productCardSelector).first().isVisible({ timeout: 10000 }).catch(() => false);
                if (productsVisible) {
                    console.log(`Products loaded for tab: "${tabName}"`);
                    return true;
                }

                // If no products found, still return success (tab might be loading)
                console.warn(`Could not find products after tab selection: "${tabName}"`);
                return false;
            }
            return false;
        } catch (error) {
            console.error(`Error selecting tab "${tabName}":`, error);
            return false;
        }
    }
    async function waitForCopyButtonVisible(page: Page, timeout = 30000, warnOnTimeout = true): Promise<boolean> {
        const visible = await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('button')).some((button) => {
                const text = (button.textContent || '').toLowerCase();
                const rect = button.getBoundingClientRect();
                const style = window.getComputedStyle(button);
                return text.includes('sao')
                    && text.includes('ch')
                    && rect.width > 0
                    && rect.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && style.pointerEvents !== 'none'
                    && !button.hasAttribute('disabled')
                    && button.getAttribute('aria-disabled') !== 'true'
                    && !String(button.getAttribute('class') || '').toLowerCase().includes('disabled')
                    && !String(button.getAttribute('class') || '').toLowerCase().includes('cursor-not-allowed')
                    && Number(style.opacity || '1') > 0.3;
            });
        }, undefined, { timeout }).then(() => true).catch(() => false);

        if (visible) {
            console.log('Copy button is visible');
            return true;
        }

        if (warnOnTimeout) {
            console.warn('Copy button did not become visible after checkout');
        }
        return false;
    }
    async function waitForQrCopyCardReady(page: Page, timeout = 90000): Promise<boolean> {
        console.log('Waiting for QR/copy card to finish loading...');

        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });

        const ready = await page.waitForFunction(() => {
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0
                    && rect.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && Number(style.opacity || '1') > 0.3;
            };

            const copyButton = Array.from(document.querySelectorAll('button')).find((button) => {
                const text = (button.textContent || '').toLowerCase();
                const style = window.getComputedStyle(button);
                return text.includes('sao')
                    && text.includes('ch')
                    && isVisible(button)
                    && style.pointerEvents !== 'none'
                    && !button.disabled
                    && button.getAttribute('aria-disabled') !== 'true';
            });

            if (!copyButton) {
                return false;
            }

            const copySurface = copyButton.closest('[role="dialog"], [class*="fixed"], [class*="modal"], [data-testid*="copy"], [data-testid*="qr"]') || document.body;

            const hasLoadedQrAsset = Array.from(copySurface.querySelectorAll('img, canvas, svg')).some((element) => {
                if (!isVisible(element)) {
                    return false;
                }

                const signature = [
                    element.getAttribute('alt'),
                    element.getAttribute('src'),
                    element.getAttribute('class'),
                    element.getAttribute('id'),
                    element.closest('[class], [id], [data-testid]')?.getAttribute('class'),
                    element.closest('[class], [id], [data-testid]')?.getAttribute('id'),
                    element.closest('[class], [id], [data-testid]')?.getAttribute('data-testid'),
                ].join(' ').toLowerCase();

                if (!signature.includes('qr') && !signature.includes('bank') && !signature.includes('payment')) {
                    return false;
                }

                if (element instanceof HTMLImageElement) {
                    return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
                }

                if (element instanceof HTMLCanvasElement) {
                    return element.width > 0 && element.height > 0;
                }

                return true;
            });

            const surfaceText = (copySurface.textContent || '').toLowerCase();
            const hasQrPaymentText = surfaceText.includes('qr')
                || surfaceText.includes('ngân hàng')
                || surfaceText.includes('ngan hang')
                || surfaceText.includes('chuyển khoản')
                || surfaceText.includes('chuyen khoan')
                || surfaceText.includes('stk')
                || surfaceText.includes('vietqr');

            return hasLoadedQrAsset || hasQrPaymentText;
        }, undefined, { timeout }).then(() => true).catch(() => false);

        if (ready) {
            await page.waitForTimeout(1500);
            console.log('QR/copy card is ready for copy');
            return true;
        }

        console.warn('QR/copy card did not finish loading before timeout');
        return false;
    }

    async function waitForCopyButtonActive(page: Page, timeout = 30000) {
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            const copyBtn = await findUsableButtonByText(page, new RegExp(escapeRegExp(labels.copy), 'i'));
            if (copyBtn) {
                console.log('Copy button is visible and active');
                return copyBtn;
            }
            await page.waitForTimeout(500);
        }

        console.warn('Copy button did not become active');
        return null;
    }

    async function selectProductAndPrepareCopyCard(
        page: Page,
        initialQrTimeout = 20000,
        fallbackQrTimeout = 90000
    ): Promise<boolean> {
        try {
            await page.waitForLoadState('networkidle').catch(() => { });
            await page.locator(productCardSelector).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });

            const cards = page.locator(productCardSelector);
            const cardCount = await cards.count();
            for (let cardIndex = 0; cardIndex < Math.min(cardCount, 10); cardIndex++) {
                const card = cards.nth(cardIndex);
                if (!await card.isVisible({ timeout: 1000 }).catch(() => false)) {
                    continue;
                }

                const plusBtn = card.getByRole('button', { name: /^\+$/ }).last();
                if (!await plusBtn.isVisible({ timeout: 1000 }).catch(() => false) || !await plusBtn.isEnabled().catch(() => false)) {
                    continue;
                }

                await plusBtn.scrollIntoViewIfNeeded();
                await plusBtn.click({ timeout: 10000 });
                console.log(`Selected product from card #${cardIndex + 1}`);

                console.log('Waiting for auto-loaded QR/copy card after product selection...');
                if (await waitForQrLoadedThenCopyEnabled(page, initialQrTimeout)) {
                console.log(`QR/copy card loaded after selecting product; ${labels.checkout} was not clicked`);
                    return true;
                }

                console.warn(`QR/copy card was not visible after selecting product. Trying card ${labels.checkout} once as fallback.`);
                const deadline = Date.now() + 15000;
                let checkoutBtn: Locator | null = null;
                while (Date.now() < deadline && !checkoutBtn) {
                    checkoutBtn = await findUsableCheckoutButtonInCard(card);
                    if (!checkoutBtn) {
                        await page.waitForTimeout(500);
                    }
                }

                if (!checkoutBtn) {
                    throw new Error(`No active ${labels.checkout} button was found in selected card #${cardIndex + 1}`);
                }

                await checkoutBtn.scrollIntoViewIfNeeded();
                await checkoutBtn.click({ timeout: 10000 });
                console.log(`Clicked fallback ${labels.checkout} once in selected card #${cardIndex + 1}`);
                await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
                return await waitForQrLoadedThenCopyEnabled(page, fallbackQrTimeout);
            }

            throw new Error('No selectable product card with an active + button was found');
        } catch (error) {
            console.error('Error selecting product and preparing QR/copy card:', error);
            return false;
        }
    }

    async function waitForQrLoadedThenCopyEnabled(page: Page, timeout = 90000): Promise<boolean> {
        const qrCardReady = await waitForQrCopyCardReady(page, timeout);
        if (!qrCardReady) {
            return false;
        }

        const copyReady = await waitForCopyButtonVisible(page, 30000);
        if (!copyReady) {
            return false;
        }

        const copyBtn = await waitForCopyButtonActive(page, 30000);
        return Boolean(copyBtn);
    }

    async function prepareCopyCardFromTab(
        page: Page,
        tabConfig: typeof tabsToTestDefault[0],
        qrTimeout = 90000
    ): Promise<boolean> {
        console.log('Step 1: Selecting tab...');
        const tabSelected = await selectTab(page, tabConfig.tabName, tabConfig.selectors);
        if (!tabSelected) {
            throw new Error(`Failed to select tab: ${tabConfig.tabName}`);
        }

        console.log(`Step 2-4: Selecting a product card and waiting for QR/${labels.copy}...`);
        const copyReady = await selectProductAndPrepareCopyCard(page, 20000, qrTimeout);
        if (!copyReady) {
            const visibleActionButtons = await page.locator('button').evaluateAll((buttons) => {
                return buttons
                    .filter((button) => {
                        const rect = button.getBoundingClientRect();
                        const style = window.getComputedStyle(button);
                        return rect.width > 0
                            && rect.height > 0
                            && style.visibility !== 'hidden'
                            && style.display !== 'none';
                    })
                    .map((button) => (button.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter((text) => /Thanh\s+toán|Thanh\s+toan|Đặt\s+Hàng|Đặt\s+hàng|Dat\s+Hang|Sao\s+Chép|Sao\s+chép|Sao\s+Chep|Đã\s+sao\s+chép|Da\s+sao\s+chep/i.test(text))
                    .filter((text, index, allTexts) => text && allTexts.indexOf(text) === index);
            }).catch(() => []);
            console.warn(`QR/copy card was not found after selecting product and optional fallback. Visible action buttons: ${visibleActionButtons.join(' | ') || 'none'}`);
            return false;
        }

        return await waitForCopyButtonVisible(page, 30000);
    }

    async function clickCopyButton(page: Page): Promise<boolean> {
        try {
            await page.evaluate(() => {
                window.scrollTo(0, 0);
                const modal = document.querySelector('[class*="modal"], [role="dialog"]');
                if (modal) {
                    modal.scrollTop = 0;
                }
            });
            await page.waitForTimeout(500);

            const activeCopyBtn = await waitForCopyButtonActive(page);
            if (!activeCopyBtn) {
                return false;
            }

            await activeCopyBtn.scrollIntoViewIfNeeded();
            await activeCopyBtn.click({ timeout: 10000 });
            console.log('Clicked active Copy button');
            return true;
        } catch (error) {
            console.error('Error clicking copy button:', error);
            return false;
        }
    }

    async function waitForCopyStateChange(page: Page): Promise<boolean> {
        const waitForButtonText = async (patterns: string[], timeout: number): Promise<boolean> => {
            return page.waitForFunction((expectedPatterns) => {
                return Array.from(document.querySelectorAll('button')).some((button) => {
                    const text = button.textContent || '';
                    const rect = button.getBoundingClientRect();
                    const style = window.getComputedStyle(button);
                    return expectedPatterns.some((pattern) => text.includes(pattern))
                        && rect.width > 0
                        && rect.height > 0
                        && style.visibility !== 'hidden'
                        && style.display !== 'none';
                });
            }, patterns, { timeout }).then(() => true).catch(() => false);
        };

        try {
            console.log('Waiting for copy button state change...');

            const processingDetected = await waitForButtonText([labels.processing, 'Dang xu ly', 'Processing'], 10000);
            if (processingDetected) {
                console.log('Button changed to processing state.');
            } else {
                const copiedAlreadyVisible = await waitForButtonText([labels.copied, 'Da sao chep', 'Copied'], 1000);
                if (!copiedAlreadyVisible) {
                    console.warn('Did not detect processing state before copy confirmation wait.');
                }
            }

            const copyConfirmed = await waitForButtonText([labels.copied, 'Da sao chep', 'Copied'], 30000);
            if (!copyConfirmed) {
                console.error('Copy button never reached "Da sao chep" state.');
                return false;
            }

            console.log('Copy confirmed: button/message reached "Da sao chep" state.');
            await page.waitForTimeout(500);
            return true;
        } catch (error) {
            console.error('Error waiting for copy state change:', error);
            return false;
        }
    }

    type ClipboardSavedContent = {
        textPath: string | null;
        imagePath: string | null;
    };

    async function readAndSaveClipboardContentOnly(
        page: Page,
        websiteName: string,
        tabDisplayName: string
    ): Promise<ClipboardSavedContent> {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

        const clipboardContent = await page.evaluate(async () => {
            const result: {
                text: string | null;
                html: string | null;
                image: {
                    type: string;
                    data: number[];
                    width: number;
                    height: number;
                } | null;
                types: string[];
            } = {
                text: null,
                html: null,
                image: null,
                types: [],
            };

            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    result.text = text;
                }
            } catch {
                // Some browsers only expose rich clipboard data via read().
            }

            const items = await navigator.clipboard.read();
            for (const item of items) {
                result.types.push(...item.types);

                if (!result.text && item.types.includes('text/plain')) {
                    const blob = await item.getType('text/plain');
                    result.text = await blob.text();
                }

                if (!result.html && item.types.includes('text/html')) {
                    const blob = await item.getType('text/html');
                    result.html = await blob.text();
                }

                if (!result.image) {
                    const imageType = item.types.find((type) => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const imageBitmap = await createImageBitmap(blob);
                        const arrayBuffer = await blob.arrayBuffer();
                        result.image = {
                            type: imageType,
                            data: Array.from(new Uint8Array(arrayBuffer)),
                            width: imageBitmap.width,
                            height: imageBitmap.height,
                        };
                        imageBitmap.close();
                    }
                }
            }

            return result;
        });

        const copiedText = clipboardContent.text || clipboardContent.html;
        const outputDir = path.join('test-results', 'pass-screenshots');
        await fs.mkdir(outputDir, { recursive: true });

        let textPath: string | null = null;
        let imagePath: string | null = null;

        if (copiedText) {
            textPath = path.join(outputDir, `copied-${websiteName}-${tabDisplayName}-clipboard.txt`);
            await fs.writeFile(textPath, copiedText, 'utf8');
            console.log('===== COPIED CLIPBOARD TEXT START =====');
            console.log(copiedText);
            console.log('===== COPIED CLIPBOARD TEXT END =====');
            console.log(`Saved copied clipboard text only: ${textPath}`);
        }

        if (clipboardContent.image) {
            const extension = clipboardContent.image.type.split('/')[1] || 'png';
            imagePath = path.join(outputDir, `copied-${websiteName}-${tabDisplayName}-clipboard.${extension}`);
            await fs.writeFile(imagePath, Buffer.from(clipboardContent.image.data));
            console.log(`Saved full copied clipboard image: ${imagePath} (${clipboardContent.image.type}, ${clipboardContent.image.width}x${clipboardContent.image.height}, ${clipboardContent.image.data.length} bytes)`);
        }

        expect(
            Boolean(copiedText) || Boolean(clipboardContent.image),
            `Clipboard should contain copied content. Clipboard types: ${clipboardContent.types.join(', ') || 'none'}`
        ).toBe(true);

        return {
            textPath,
            imagePath,
        };
    }

    /**
     * Take screenshot and save with proper naming and folder
     */
    async function takeAndSaveScreenshot(
        page: Page,
        websiteName: string,
        tabDisplayName: string,
        isSuccess: boolean,
        error?: string
    ): Promise<string | null> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const fileName = `${websiteName}-${tabDisplayName}-NDS-${timestamp}.png`;

            const folderName = isSuccess ? 'pass-screenshots' : 'err-screenshots';
            const filePath = path.join('test-results', folderName, fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });

            if (!page.isClosed()) {
                await page.screenshot({
                    path: filePath,
                    fullPage: true
                });

                const message = isSuccess
                    ? `Screenshot saved (success): ${filePath}`
                    : `Screenshot saved (error): ${filePath} - Error: ${error}`;

                console.log(message);
                return filePath;
            }
            return null;
        } catch (error) {
            console.error('Error taking screenshot:', error);
            return null;
        }
    }

    /**
     * Test copy functionality for a single tab
     */
    async function testCopyInTab(
        page: Page,
        websiteName: string,
        tabConfig: typeof tabsToTestDefault[0],
        homeUrl: string
    ): Promise<{ success: boolean; screenshotPath: string | null; clipboardAttachment: string | null }> {
        let screenshotPath: string | null = null;
        let clipboardAttachment: string | null = null;
        let success = false;

        try {
            console.log(`\nTesting tab: ${tabConfig.tabName} on ${websiteName}...`);
            console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
            await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
            await warnIfHomepageQueryWasDropped(page, homeUrl);

            const copyCardReady = await prepareCopyCardFromTab(page, tabConfig, 90000);
            if (!copyCardReady) {
                throw new Error(`QR/copy card did not finish loading after ${labels.checkout}`);
            }

            // Step 5: Click copy button
            console.log('Step 5: Clicking copy button...');
            const copyClicked = await clickCopyButton(page);
            if (!copyClicked) {
                throw new Error('Failed to click copy button');
            }

            // Step 6: Wait for copy button state change from "Sao Chép" to "Đang xử lý", then "Đã sao chép".
            console.log('Step 6: Waiting for copy button state change...');
            const stateChanged = await waitForCopyStateChange(page);
            if (!stateChanged) {
                throw new Error('Failed to detect copy confirmation state change');
            }

            // Step 7: Read and save only the copied clipboard content
            console.log('Step 7: Reading clipboard and saving copied content only...');
            const clipboardContent = await readAndSaveClipboardContentOnly(
                page,
                websiteName,
                tabConfig.displayName
            );
            clipboardAttachment = clipboardContent.imagePath || clipboardContent.textPath;
            if (!clipboardAttachment) {
                throw new Error('Failed to save copied clipboard content');
            }

            success = true;
            console.log(`Successfully tested copy in tab: ${tabConfig.tabName}`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error in tab ${tabConfig.tabName}:`, errorMsg);

            // Report error
            await appendErrorReport(
                `${websiteName}-${tabConfig.tabName}`,
                error,
                `test-results/err-screenshots/${websiteName}-${tabConfig.displayName}-NDS-*.png`
            );
        }

        if (success) {
            screenshotPath = clipboardAttachment;
        } else {
            screenshotPath = await takeAndSaveScreenshot(
                page,
                websiteName,
                tabConfig.displayName,
                false,
                'Copy test failed'
            );
        }

        return { success, screenshotPath, clipboardAttachment };
    }

    // ============================================================================


