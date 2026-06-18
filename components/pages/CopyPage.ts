/// <reference types="node" />
import { expect, Locator, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { clickElement, waitForConditionPoll, waitForDomReady } from '../helpers/element-actions';
import * as dialogHandler from '../helpers/dialog-handler';
import { warnIfHomepageQueryWasDropped } from '../helpers/navigation';
import { productCardSelector } from '../../constants/selectors';
import { appendErrorReport } from '../../utils/reportUtils';
import { textRegexSelector, viLabels, viRegex } from '../../constants/vietnamese';
import { COPY_READY_TIMEOUT_MS, PRODUCT_READY_TIMEOUT_MS, QR_READY_TIMEOUT_MS, SHORT_WAIT_MS, UI_READY_TIMEOUT_MS } from '../../config/test.config';
import { isBlockingPageError, throwIfBlockingPageError, waitForPromiseOrBlockingPageError } from '../helpers/page-error';

/**
 * Page object cho copy flow.
 * Chua logic chon tab, chon san pham, doi QR/copy card, copy clipboard va luu artifact.
 */
export class CopyPage {
    /**
     * Khoi tao CopyPage voi page hien tai va dialog tracker de moi action copy co the bat popup loi.
     */
    constructor(
        private readonly page: Page,
        private readonly dialogTracker?: dialogHandler.DialogTracker
    ) { }

    async ensureScreenshotDirectories() {
        return ensureScreenshotDirectories();
    }

    getTabsForWebsite(websiteName: string): TabConfig[] {
        return getTabsForWebsite(websiteName);
    }

    async testCopyInTab(websiteName: string, tabConfig: TabConfig, homeUrl: string, options?: CopyTabTestOptions) {
        return testCopyInTab(this.page, websiteName, tabConfig, homeUrl, options, this.dialogTracker);
    }

    async testProjectCopyStagesInTab(websiteName: string, tabConfig: TabConfig) {
        return testProjectCopyStagesInTab(this.page, websiteName, tabConfig, this.dialogTracker);
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

type CopyTabTestOptions = {
    navigateBeforeTest?: boolean;
};

type ProjectCopyStage = 'NDS' | 'XNDH' | 'TTDH';

type ProjectCopyStageResult = {
    stage: ProjectCopyStage;
    clipboardAttachment: string | null;
};

// Tab list used by copy tests for normal websites.
const tabsToTestDefault: TabConfig[] = [
    { tabName: labels.singleBag, displayName: 'Tui-Don', selectors: [textRegexSelector(viRegex.singleBag), `button:has-text("${labels.singleBag}")`, textRegexSelector(viRegex.mergedOrder), `button:has-text("${labels.mergedOrder}")`] },
    { tabName: labels.doubleBag, displayName: 'Tui-Doi', selectors: [textRegexSelector(viRegex.doubleBag), `button:has-text("${labels.doubleBag}")`] },
    { tabName: labels.versatileBag, displayName: 'Tui-Da-Dang', selectors: [textRegexSelector(viRegex.versatileBag), `button:has-text("${labels.versatileBag}")`] },
];

const tabsToTestSi: TabConfig[] = [
    { tabName: labels.box, displayName: 'Chon-Thung', selectors: [textRegexSelector(viRegex.box), `button:has-text("${labels.box}")`] },
];

// Website switch: add or change website-specific tab configs here.
/**
 * Tra ve danh sach tab can test theo website.
 * Website "si" co tab rieng, cac website con lai dung default tabs.
 */
const getTabsForWebsite = (websiteName: string): TabConfig[] => {
    return websiteName === 'si' ? tabsToTestSi : tabsToTestDefault;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Gom cac ten tab co dau/khong dau de locator co the dung tren nhieu website.
 */
const getTabAliases = (tabName: string): string[] => {
    const aliases: Record<string, string[]> = {
        [labels.singleBag]: [labels.singleBag, 'Túi Đơn', labels.mergedOrder, 'Túi Đơn Ghép', 'Túi Đơn ghép', 'Tui Don', 'Tui Don Ghep'],
        [labels.doubleBag]: [labels.doubleBag, 'Túi Đôi', 'Tui Doi'],
        [labels.versatileBag]: [labels.versatileBag, 'Túi Đa Dạng', 'Túi Đa Dụng', 'Tui Da Dang', 'Tui Da Dung'],
        [labels.box]: [labels.box, 'Chọn Thùng', 'Chon Thung'],
    };

    return aliases[tabName] ?? [tabName];
};

// Project-stage file name tab segment, e.g. si-copied-chon-thung-NDS.png.
/**
 * Tao slug dung trong ten file clipboard cua flow copy theo stage.
 */
const getProjectCopySlug = (tabConfig: TabConfig): string => {
    if (tabConfig.tabName === labels.singleBag) {
        return 'tui-don-ghep';
    }

    if (tabConfig.tabName === labels.doubleBag) {
        return 'tui-doi';
    }

    if (tabConfig.tabName === labels.versatileBag) {
        return 'tui-da-dung';
    }

    return tabConfig.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};

/**
 * Kiem tra button co that su usable: visible, enabled, khong aria-disabled va khong bi style disabled.
 */
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

/**
 * Kiem tra tam button co the click duoc, khong bi element khac che tai diem click.
 */
const isPointerReachableButton = async (button: Locator): Promise<boolean> => {
    return button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return false;
        }

        const topElement = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
        return topElement === element || Boolean(topElement && element.contains(topElement));
    }).catch(() => false);
};

/**
 * Tim button theo text va trang thai usable, dung khi UI co nhieu button trung label.
 */
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

const findPointerReachableButtonByText = async (page: Page, textPattern: RegExp, preferLast = true) => {
    const buttons = page.locator('button').filter({ hasText: textPattern });
    const count = await buttons.count();
    const indexes = Array.from({ length: count }, (_, index) => preferLast ? count - 1 - index : index);

    for (const index of indexes) {
        const button = buttons.nth(index);
        await button.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
        if (
            await button.isVisible({ timeout: 1000 }).catch(() => false)
            && await isUsableButton(button)
            && await isPointerReachableButton(button)
        ) {
            return button;
        }
    }

    return null;
};

/**
 * Phat hien modal/overlay dang che UI de tranh click force vao element bi block.
 */
const hasVisibleBlockingOverlay = async (page: Page): Promise<boolean> => {
    const overlays = page.locator('[role="dialog"], [class*="fixed"][class*="inset-0"], [class*="modal"]');
    const count = await overlays.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
        const overlay = overlays.nth(index);
        if (await overlay.isVisible({ timeout: 250 }).catch(() => false)) {
            return true;
        }
    }

    return false;
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

/**
 * Doi tab/product catalog san sang truoc khi chon tab, dong thoi bat loi API/dialog blocking.
 */
const waitForCatalogReady = async (
    page: Page,
    tabName: string,
    tabSelectors: string[],
    dialogTracker?: dialogHandler.DialogTracker
): Promise<void> => {
    const aliases = getTabAliases(tabName);
    const ready = await waitForPromiseOrBlockingPageError(
        page,
        page.waitForFunction(
            ({ productSelector, expectedAliases }) => {
                const isVisible = (element: Element) => {
                    const rect = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    return rect.width > 0
                        && rect.height > 0
                        && style.visibility !== 'hidden'
                        && style.display !== 'none'
                        && Number(style.opacity || '1') > 0.3;
                };

                const normalizeText = (value: string) => value
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
                    .toLowerCase();

                const normalizedAliases = expectedAliases.map(normalizeText);
                const hasTargetTab = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"]'))
                    .some((element) => {
                        const text = normalizeText(element.textContent || '');
                        return isVisible(element) && normalizedAliases.some((alias) => text.includes(alias));
                    });

                const hasProducts = Array.from(document.querySelectorAll(productSelector)).some(isVisible);

                return hasTargetTab || hasProducts;
            },
            { productSelector: productCardSelector, expectedAliases: aliases },
            { timeout: QR_READY_TIMEOUT_MS }
        ).then(() => true).catch(() => false),
        `copy-catalog-ready-${tabName}`,
        QR_READY_TIMEOUT_MS,
        tabSelectors.map((selector) => page.locator(selector).first()),
        dialogTracker
    );

    if (!ready) {
        console.warn(`Catalog did not become ready before selecting tab: "${tabName}"`);
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create test-results directories if they don't exist
 */
async function ensureScreenshotDirectories() {
    const passDir = path.join('test-results', 'report', 'pass');
    const errDir = path.join('test-results', 'report', 'err');
    await fs.mkdir(passDir, { recursive: true });
    await fs.mkdir(errDir, { recursive: true });
    console.log(`Screenshot directories ready: ${passDir}, ${errDir}`);
}

/**
 * Select a tab
 */
/**
 * Chon tab trong copy flow bang alias/role/text selector va doi product cua tab load.
 */
async function selectTab(
    page: Page,
    tabName: string,
    tabSelectors: string[],
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    try {
        await waitForDomReady(page);
        await waitForCatalogReady(page, tabName, tabSelectors, dialogTracker);

        let success = false;
        for (const alias of getTabAliases(tabName)) {
            if (dialogTracker) {
                await dialogHandler.waitAndHandleDialog(page, dialogTracker, `copy-select-tab-${tabName}`, 100);
            }
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
                { visibilityTimeout: 3000, clickTimeout: 10000, waitForNav: false },
                dialogTracker
            );
        }

        if (success) {
            // Wait for products to load in the tab - use multiple selectors for different websites
            const productsVisible = await waitForPromiseOrBlockingPageError(
                page,
                page.locator(productCardSelector).first().isVisible({ timeout: PRODUCT_READY_TIMEOUT_MS }).catch(() => false),
                `copy-products-ready-${tabName}`,
                PRODUCT_READY_TIMEOUT_MS,
                [page.locator(productCardSelector).first()]
            );
            if (productsVisible) {
                console.log(`Products loaded for tab: "${tabName}"`);
                return true;
            }

            // If no products found, still return success (tab might be loading)
            console.warn(`Could not find products after tab selection: "${tabName}"`);
            return true;
        }
        return false;
    } catch (error) {
        if (isBlockingPageError(error)) {
            throw error;
        }
        console.error(`Error selecting tab "${tabName}":`, error);
        return false;
    }
}
/**
 * Doi nut Copy xuat hien; co the yeu cau button active/enabled tuy flow.
 */
async function waitForCopyButtonVisible(
    page: Page,
    timeout = COPY_READY_TIMEOUT_MS,
    warnOnTimeout = true,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const visible = await waitForPromiseOrBlockingPageError(page, page.waitForFunction(() => {
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
    }, undefined, { timeout }).then(() => true).catch(() => false), 'copy-button-visible', timeout, [], dialogTracker);

    if (visible) {
        console.log('Copy button is visible');
        return true;
    }

    if (warnOnTimeout) {
        console.warn('Copy button did not become visible after checkout');
    }
    return false;
}
/**
 * Doi QR/copy card render xong sau khi chon san pham/checkout.
 */
async function waitForQrCopyCardReady(
    page: Page,
    timeout = QR_READY_TIMEOUT_MS,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    console.log('Waiting for QR/copy card to finish loading...');

    await waitForDomReady(page);

    const ready = await waitForPromiseOrBlockingPageError(page, page.waitForFunction(() => {
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
    }, undefined, { timeout }).then(() => true).catch(() => false), 'qr-copy-card-ready', timeout, [], dialogTracker);

    if (ready) {
        console.log('QR/copy card is ready for copy');
        return true;
    }

    console.warn('QR/copy card did not finish loading before timeout');
    return false;
}

/**
 * Tim nut Copy dang active va co the click, uu tien button pointer-reachable.
 */
async function waitForCopyButtonActive(
    page: Page,
    timeout = COPY_READY_TIMEOUT_MS,
    dialogTracker?: dialogHandler.DialogTracker
) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        await throwIfBlockingPageError(page, 'copy-button-active', [
            page.getByRole('dialog'),
            page.locator('body'),
        ]);
        if (dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'copy-button-active', 100);
        }

        const copyBtn = await findPointerReachableButtonByText(page, new RegExp(escapeRegExp(labels.copy), 'i'));
        if (copyBtn) {
            console.log('Copy button is visible and active');
            return copyBtn;
        }

        if (!await hasVisibleBlockingOverlay(page)) {
            const usableCopyBtn = await findUsableButtonByText(page, new RegExp(escapeRegExp(labels.copy), 'i'));
            if (usableCopyBtn) {
                console.log('Copy button is visible and active behind non-modal sticky UI');
                return usableCopyBtn;
            }
        }
        await waitForConditionPoll(page, SHORT_WAIT_MS);
    }

    console.warn('Copy button did not become active');
    return null;
}

/**
 * Flow con: chon san pham, bam checkout neu can, sau do doi QR/copy card san sang.
 */
async function selectProductAndPrepareCopyCard(
    page: Page,
    initialQrTimeout = UI_READY_TIMEOUT_MS * 2,
    fallbackQrTimeout = QR_READY_TIMEOUT_MS,
    dialogTracker?: dialogHandler.DialogTracker,
    useCheckoutFallback = true
): Promise<boolean> {
    try {
        await waitForDomReady(page);
        const productCardsReady = await waitForPromiseOrBlockingPageError(
            page,
            page.locator(productCardSelector).first().waitFor({ state: 'visible', timeout: PRODUCT_READY_TIMEOUT_MS }),
            'copy-product-card-visible',
            PRODUCT_READY_TIMEOUT_MS,
            [page.locator(productCardSelector).first()],
            dialogTracker
        ).then(() => true).catch(() => false);

        const cards = page.locator(productCardSelector);
        const cardCount = productCardsReady ? await cards.count() : 0;
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
            if (await waitForQrLoadedThenCopyEnabled(page, initialQrTimeout, dialogTracker)) {
                console.log(`QR/copy card loaded after selecting product; ${labels.checkout} was not clicked`);
                return true;
            }

            if (!useCheckoutFallback) {
                console.warn(`QR/copy card was not visible after selecting product; ${labels.checkout} fallback is disabled for this flow.`);
                return false;
            }

            console.warn(`QR/copy card was not visible after selecting product. Trying card ${labels.checkout} once as fallback.`);
            const deadline = Date.now() + UI_READY_TIMEOUT_MS + 5000;
            let checkoutBtn: Locator | null = null;
            while (Date.now() < deadline && !checkoutBtn) {
                await throwIfBlockingPageError(page, 'copy-fallback-checkout-button', [
                    card,
                    page.locator('body'),
                ]);
                if (dialogTracker) {
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'copy-fallback-checkout-button', 100);
                }

                checkoutBtn = await findUsableCheckoutButtonInCard(card);
                if (!checkoutBtn) {
                    await waitForConditionPoll(page, SHORT_WAIT_MS);
                }
            }

            if (!checkoutBtn) {
                throw new Error(`No active ${labels.checkout} button was found in selected card #${cardIndex + 1}`);
            }

            await checkoutBtn.scrollIntoViewIfNeeded();
            await checkoutBtn.click({ timeout: 10000 });
            console.log(`Clicked fallback ${labels.checkout} once in selected card #${cardIndex + 1}`);
            await waitForDomReady(page);
            return await waitForQrLoadedThenCopyEnabled(page, fallbackQrTimeout, dialogTracker);
        }

        const plusClicked = await clickFirstVisiblePlusButton(page, dialogTracker);
        if (plusClicked) {
            console.log('Selected product using visible + button fallback');
            if (await waitForQrLoadedThenCopyEnabled(page, initialQrTimeout, dialogTracker)) {
                return true;
            }

            if (!useCheckoutFallback) {
                console.warn(`QR/copy card was not visible after + fallback; ${labels.checkout} fallback is disabled for this flow.`);
                return false;
            }

            const fallbackCheckout = await findUsableButtonByText(page, viRegex.checkout);
            if (!fallbackCheckout) {
                throw new Error(`No active ${labels.checkout} button was found after + fallback`);
            }

            await fallbackCheckout.scrollIntoViewIfNeeded();
            await fallbackCheckout.click({ timeout: 10000 });
            console.log(`Clicked fallback ${labels.checkout} after + fallback`);
            await waitForDomReady(page);
            return await waitForQrLoadedThenCopyEnabled(page, fallbackQrTimeout, dialogTracker);
        }

        throw new Error('No selectable product card with an active + button was found');
    } catch (error) {
        if (isBlockingPageError(error)) {
            throw error;
        }
        console.error('Error selecting product and preparing QR/copy card:', error);
        return false;
    }
}

async function clickFirstVisiblePlusButton(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const deadline = Date.now() + PRODUCT_READY_TIMEOUT_MS;
    const plusButtons = page.getByRole('button', { name: /^\+$/ });

    while (Date.now() < deadline) {
        await throwIfBlockingPageError(page, 'copy-plus-button-fallback', [
            page.locator(productCardSelector).first(),
            page.locator('body'),
        ]);

        if (dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'copy-plus-button-fallback', 250);
        }

        const count = await plusButtons.count().catch(() => 0);
        for (let index = 0; index < count; index++) {
            const button = plusButtons.nth(index);
            if (
                await button.isVisible({ timeout: 250 }).catch(() => false)
                && await isUsableButton(button)
                && await isPointerReachableButton(button)
            ) {
                await button.scrollIntoViewIfNeeded();
                await button.click({ timeout: 10000 });
                return true;
            }
        }

        await waitForConditionPoll(page, SHORT_WAIT_MS);
    }

    return false;
}

async function waitForQrLoadedThenCopyEnabled(
    page: Page,
    timeout = QR_READY_TIMEOUT_MS,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const qrCardReady = await waitForQrCopyCardReady(page, timeout, dialogTracker);
    if (!qrCardReady) {
        return false;
    }

    const copyReady = await waitForCopyButtonVisible(page, COPY_READY_TIMEOUT_MS, true, dialogTracker);
    if (!copyReady) {
        return false;
    }

    const copyBtn = await waitForCopyButtonActive(page, COPY_READY_TIMEOUT_MS, dialogTracker);
    return Boolean(copyBtn);
}

async function selectProductAndWaitForMainCopyCard(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    return selectProductAndPrepareCopyCard(
        page,
        QR_READY_TIMEOUT_MS,
        QR_READY_TIMEOUT_MS,
        dialogTracker,
        false
    );
}

async function prepareCopyCardFromTab(
    page: Page,
    tabConfig: typeof tabsToTestDefault[0],
    qrTimeout = QR_READY_TIMEOUT_MS,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    console.log('Step 1: Selecting tab...');
    const tabSelected = await selectTab(page, tabConfig.tabName, tabConfig.selectors, dialogTracker);
    if (!tabSelected) {
        throw new Error(`Failed to select tab: ${tabConfig.tabName}`);
    }

    console.log(`Step 2-4: Selecting a product card and waiting for QR/${labels.copy}...`);
    const copyReady = await selectProductAndPrepareCopyCard(page, UI_READY_TIMEOUT_MS * 2, qrTimeout, dialogTracker);
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

    return await waitForCopyButtonVisible(page, COPY_READY_TIMEOUT_MS, true, dialogTracker);
}

async function closeCopySurfaceIfOpen(page: Page): Promise<void> {
    await page.keyboard.press('Escape').catch(() => { });
    await page.locator('[role="dialog"], [class*="modal"], [data-testid*="copy"], [data-testid*="qr"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 1000 })
        .catch(() => { });

    const closeButton = page
        .locator('[role="dialog"], [class*="modal"], [class*="fixed"], [data-testid*="copy"], [data-testid*="qr"]')
        .locator('button, [role="button"]')
        .filter({ hasText: /^(?:x|close|dong|huy)$/i })
        .first();

    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeButton.click({ timeout: 5000 }).catch(() => { });
        await closeButton.waitFor({ state: 'hidden', timeout: UI_READY_TIMEOUT_MS }).catch(() => { });
    }
}

/**
 * Bam nut Copy dang active va retry an toan khi layout vua thay doi.
 */
async function clickCopyButton(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    try {
        await page.evaluate(() => {
            window.scrollTo(0, 0);
            const modal = document.querySelector('[class*="modal"], [role="dialog"]');
            if (modal) {
                modal.scrollTop = 0;
            }
        });
        const activeCopyBtn = await waitForCopyButtonActive(page, COPY_READY_TIMEOUT_MS, dialogTracker);
        if (!activeCopyBtn) {
            return false;
        }

        await activeCopyBtn.scrollIntoViewIfNeeded();
        await activeCopyBtn.click({ timeout: 10000 }).catch(async (error) => {
            if (await hasVisibleBlockingOverlay(page)) {
                throw error;
            }

            console.warn(`Normal copy click was blocked by page chrome; retrying after layout settles: ${(error as Error).message}`);
            await waitForConditionPoll(page, SHORT_WAIT_MS);
            if (await hasVisibleBlockingOverlay(page)) {
                throw error;
            }
            await activeCopyBtn.click({ timeout: 10000 });
        });
        console.log('Clicked active Copy button');
        return true;
    } catch (error) {
        if (isBlockingPageError(error)) {
            throw error;
        }
        console.error('Error clicking copy button:', error);
        return false;
    }
}

async function clickOrderButton(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const selectors = [
        textRegexSelector(viRegex.order),
        `button:has-text("${labels.order}")`,
    ];

    return clickElement(page, selectors, `Clicking ${labels.order}`, {
        visibilityTimeout: UI_READY_TIMEOUT_MS,
        clickTimeout: 10000,
        waitForNav: false,
    }, dialogTracker);
}

async function clickConfirmOrderButton(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const confirmPatterns = [
        /Xác\s+nhận\s+đặt\s+hàng|Xac\s+nhan\s+dat\s+hang/i,
        viRegex.confirmPayment,
        viRegex.confirm,
    ];

    const deadline = Date.now() + UI_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await throwIfBlockingPageError(page, 'project-copy-confirm-order', [
            page.getByRole('dialog'),
            page.locator('body'),
        ]);

        if (dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'project-copy-confirm-order', 250);
        }

        for (const pattern of confirmPatterns) {
            const button = await findUsableButtonByText(page, pattern);
            if (button) {
                await button.scrollIntoViewIfNeeded();
                await button.click({ timeout: 10000 });
                console.log(`Clicked confirm order button: ${pattern}`);
                await waitForDomReady(page);
                return true;
            }
        }

        await waitForConditionPoll(page, SHORT_WAIT_MS);
    }

    return false;
}

/**
 * Doi trang thai copy chuyen tu processing sang copied de chac clipboard da duoc ghi.
 */
async function waitForCopyStateChange(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    const waitForButtonText = async (patterns: string[], timeout: number): Promise<boolean> => {
        return waitForPromiseOrBlockingPageError(page, page.waitForFunction((expectedPatterns) => {
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
        }, patterns, { timeout }).then(() => true).catch(() => false), 'copy-button-state-change', timeout, [], dialogTracker);
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

        const copyConfirmed = await waitForButtonText([labels.copied, 'Da sao chep', 'Copied'], COPY_READY_TIMEOUT_MS);
        if (!copyConfirmed) {
            console.error('Copy button never reached "Da sao chep" state.');
            return false;
        }

        console.log('Copy confirmed: button/message reached "Da sao chep" state.');
        return true;
    } catch (error) {
        if (isBlockingPageError(error)) {
            throw error;
        }
        console.error('Error waiting for copy state change:', error);
        return false;
    }
}

type ClipboardSavedContent = {
    textPath: string | null;
    imagePath: string | null;
};

/**
 * Doc clipboard sau khi copy va luu text/image ra artifact theo ten website-tab.
 */
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
    // Pass output directory for the original copy-functionality.spec flow.
    const outputDir = path.join('test-results', 'report', 'pass');
    await fs.mkdir(outputDir, { recursive: true });

    let textPath: string | null = null;
    let imagePath: string | null = null;

    if (copiedText) {
        // Text clipboard file name for the original NDS-only copy flow.
        textPath = path.join(outputDir, `copied-${websiteName}-${tabDisplayName}-clipboard.txt`);
        await fs.writeFile(textPath, copiedText, 'utf8');
        console.log(`Saved copied clipboard text only: ${textPath} (${copiedText.length} chars)`);
    }

    if (clipboardContent.image) {
        const extension = clipboardContent.image.type.split('/')[1] || 'png';
        // Image clipboard file name for the original NDS-only copy flow.
        imagePath = path.join(outputDir, `${websiteName}-copied-${tabDisplayName}-clipboard.${extension}`);
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
 * Doc clipboard va luu theo file base name tuy bien, dung cho NDS/XNDH/TTDH.
 */
async function readAndSaveClipboardContentAsBaseName(
    page: Page,
    fileBaseName: string
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
    // Pass output directory for project stage copies: NDS, XNDH, TTDH.
    const outputDir = path.join('test-results', 'report', 'pass');
    await fs.mkdir(outputDir, { recursive: true });

    let textPath: string | null = null;
    let imagePath: string | null = null;

    if (copiedText) {
        // Project-stage text file name. fileBaseName is built in copyAndSaveProjectStage().
        textPath = path.join(outputDir, `${fileBaseName}.txt`);
        await fs.writeFile(textPath, copiedText, 'utf8');
        console.log(`Saved copied clipboard text: ${textPath} (${copiedText.length} chars)`);
    }

    if (clipboardContent.image) {
        const extension = clipboardContent.image.type.split('/')[1] || 'png';
        // Project-stage image file name. Example: si-copied-chon-thung-TTDH.png.
        imagePath = path.join(outputDir, `${fileBaseName}.${extension}`);
        await fs.writeFile(imagePath, Buffer.from(clipboardContent.image.data));
        console.log(`Saved copied clipboard image: ${imagePath} (${clipboardContent.image.type}, ${clipboardContent.image.width}x${clipboardContent.image.height}, ${clipboardContent.image.data.length} bytes)`);
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
 * Copy va luu artifact cho mot stage cua project copy: NDS, XNDH hoac TTDH.
 */
async function copyAndSaveProjectStage(
    page: Page,
    websiteName: string,
    tabSlug: string,
    stage: ProjectCopyStage,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<ProjectCopyStageResult> {
    const ready = await waitForCopyButtonVisible(page, COPY_READY_TIMEOUT_MS, true, dialogTracker);
    if (!ready) {
        throw new Error(`Copy button was not visible for ${tabSlug}-${stage}`);
    }

    const clicked = await clickCopyButton(page, dialogTracker);
    if (!clicked) {
        throw new Error(`Failed to click copy button for ${tabSlug}-${stage}`);
    }

    const stateChanged = await waitForCopyStateChange(page, dialogTracker);
    if (!stateChanged) {
        throw new Error(`Failed to detect copy confirmation for ${tabSlug}-${stage}`);
    }

    // Project-stage base file name format: <website>-copied-<tab>-<NDS|XNDH|TTDH>.
    const fileBaseName = `${websiteName}-copied-${tabSlug}-${stage}`;
    const clipboardContent = await readAndSaveClipboardContentAsBaseName(page, fileBaseName);
    const clipboardAttachment = clipboardContent.imagePath || clipboardContent.textPath;
    if (!clipboardAttachment) {
        throw new Error(`Failed to save clipboard content for ${tabSlug}-${stage}`);
    }

    return {
        stage,
        clipboardAttachment,
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
        // Error screenshot file name. Keep stable so reruns replace the latest failure per tab.
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `${websiteName}-${tabDisplayName}-NDS.png`;

        // Failure screenshots go to report/err; success screenshots go to report/pass.
        const folderName = isSuccess ? 'pass' : 'err';
        const filePath = path.join('test-results', 'report', folderName, fileName);

        await fs.mkdir(path.dirname(filePath), { recursive: true });

        if (!page.isClosed()) {
            await page.screenshot({
                path: filePath,
                fullPage: isSuccess
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
 * Chup screenshot/report loi cho copy flow, uu tien dialog screenshot neu co dialog pending.
 */
async function captureCopyFailureScreenshot(
    page: Page,
    websiteName: string,
    tabDisplayName: string,
    error: unknown,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<{ errorForReport: unknown; screenshotPath: string | null }> {
    if (dialogTracker?.dialog || dialogTracker?.lastDialog) {
        const pendingDialog = await dialogHandler.capturePendingDialogError(
            page,
            dialogTracker,
            `copy-${websiteName}-${tabDisplayName}`
        ).catch((dialogError) => {
            console.warn(`Could not capture pending copy dialog: ${(dialogError as Error).message}`);
            return null;
        });

        if (pendingDialog) {
            return {
                errorForReport: pendingDialog.error,
                screenshotPath: pendingDialog.screenshotPath,
            };
        }
    }

    // Central failure capture used by both old copy flow and project-stage copy flow.
    const screenshotPath = await takeAndSaveScreenshot(
        page,
        websiteName,
        tabDisplayName,
        false,
        error instanceof Error ? error.message : String(error)
    );

    return { errorForReport: error, screenshotPath };
}

/**
 * Test copy functionality for a single tab
 */
/**
 * Flow copy NDS cho mot tab: chon tab, chon san pham, copy va luu clipboard.
 */
async function testCopyInTab(
    page: Page,
    websiteName: string,
    tabConfig: typeof tabsToTestDefault[0],
    homeUrl: string,
    options: CopyTabTestOptions = {},
    dialogTracker?: dialogHandler.DialogTracker
): Promise<{ success: boolean; screenshotPath: string | null; clipboardAttachment: string | null }> {
    let screenshotPath: string | null = null;
    let clipboardAttachment: string | null = null;
    let success = false;
    const navigateBeforeTest = options.navigateBeforeTest ?? true;

    try {
        console.log(`\nTesting tab: ${tabConfig.tabName} on ${websiteName}...`);
        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `copy-${tabConfig.displayName}-precheck`);
        }

        if (navigateBeforeTest) {
            console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
            await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
            await warnIfHomepageQueryWasDropped(page, homeUrl);
            if (dialogTracker) {
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, `copy-${tabConfig.displayName}-page-load`);
            }
        } else {
            console.log('Step 1: Reusing current homepage session for next tab...');
            await closeCopySurfaceIfOpen(page);
            if (dialogTracker) {
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, `copy-${tabConfig.displayName}-reuse-session`);
            }
        }

        const copyCardReady = await prepareCopyCardFromTab(page, tabConfig, QR_READY_TIMEOUT_MS, dialogTracker);
        if (!copyCardReady) {
            throw new Error(`QR/copy card did not finish loading after ${labels.checkout}`);
        }

        // Step 5: Click copy button
        console.log('Step 5: Clicking copy button...');
        const copyClicked = await clickCopyButton(page, dialogTracker);
        if (!copyClicked) {
            throw new Error('Failed to click copy button');
        }

        // Step 6: Wait for copy button state change from "Sao Chép" to "Đang xử lý", then "Đã sao chép".
        console.log('Step 6: Waiting for copy button state change...');
        const stateChanged = await waitForCopyStateChange(page, dialogTracker);
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

        const capturedFailure = await captureCopyFailureScreenshot(
            page,
            websiteName,
            tabConfig.displayName,
            error,
            dialogTracker
        );
        screenshotPath = capturedFailure.screenshotPath;

        // Report error
        await appendErrorReport(
            `${websiteName}-${tabConfig.tabName}`,
            capturedFailure.errorForReport,
            screenshotPath || undefined
        );

        if (isBlockingPageError(capturedFailure.errorForReport)) {
            throw capturedFailure.errorForReport;
        }
    }

    if (success) {
        screenshotPath = clipboardAttachment;
    } else if (!screenshotPath) {
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

/**
 * Flow copy theo stage cho mot tab: copy NDS, dat hang, copy XNDH, confirm, copy TTDH.
 */
async function testProjectCopyStagesInTab(
    page: Page,
    websiteName: string,
    tabConfig: typeof tabsToTestDefault[0],
    dialogTracker?: dialogHandler.DialogTracker
): Promise<{ success: boolean; tab: string; stageResults: ProjectCopyStageResult[]; screenshotPath: string | null }> {
    const stageResults: ProjectCopyStageResult[] = [];
    let screenshotPath: string | null = null;

    try {
        console.log(`\nTesting project copy stages in tab: ${tabConfig.tabName} on ${websiteName}...`);
        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `project-copy-${tabConfig.displayName}-precheck`);
        }

        const tabSelected = await selectTab(page, tabConfig.tabName, tabConfig.selectors, dialogTracker);
        if (!tabSelected) {
            throw new Error(`Failed to select tab: ${tabConfig.tabName}`);
        }

        const mainCopyReady = await selectProductAndWaitForMainCopyCard(page, dialogTracker);
        if (!mainCopyReady) {
            throw new Error(`Main-page copy card did not become ready before ${labels.order}`);
        }

        // This slug controls the "tab đang check" part of copied file names.
        const tabSlug = getProjectCopySlug(tabConfig);

        // NDS: copy from the generated QR/card before clicking Dat Hang.
        stageResults.push(await copyAndSaveProjectStage(page, websiteName, tabSlug, 'NDS', dialogTracker));

        // XNDH: click Dat Hang, then copy from the confirmation/payment screen.
        const orderClicked = await clickOrderButton(page, dialogTracker);
        if (!orderClicked) {
            throw new Error(`Failed to click ${labels.order}`);
        }
        await waitForQrLoadedThenCopyEnabled(page, QR_READY_TIMEOUT_MS, dialogTracker);
        stageResults.push(await copyAndSaveProjectStage(page, websiteName, tabSlug, 'XNDH', dialogTracker));

        // TTDH: click confirm order/payment, then copy from the final popup/screen.
        const confirmClicked = await clickConfirmOrderButton(page, dialogTracker);
        if (!confirmClicked) {
            throw new Error('Failed to click confirm order button');
        }
        await waitForQrLoadedThenCopyEnabled(page, QR_READY_TIMEOUT_MS, dialogTracker);
        stageResults.push(await copyAndSaveProjectStage(page, websiteName, tabSlug, 'TTDH', dialogTracker));

        return {
            success: true,
            tab: tabConfig.tabName,
            stageResults,
            screenshotPath: null,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error in project copy tab ${tabConfig.tabName}:`, errorMsg);

        const capturedFailure = await captureCopyFailureScreenshot(
            page,
            websiteName,
            `${tabConfig.displayName}-project-copy`,
            error,
            dialogTracker
        );
        screenshotPath = capturedFailure.screenshotPath;

        await appendErrorReport(
            `${websiteName}-${tabConfig.tabName}-project-copy`,
            capturedFailure.errorForReport,
            screenshotPath || undefined
        );

        if (isBlockingPageError(capturedFailure.errorForReport)) {
            throw capturedFailure.errorForReport;
        }

        return {
            success: false,
            tab: tabConfig.tabName,
            stageResults,
            screenshotPath,
        };
    }
}

// ============================================================================
