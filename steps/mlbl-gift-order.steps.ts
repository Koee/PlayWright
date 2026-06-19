/// <reference types="node" />
import { APIRequestContext, APIResponse, expect, Page, TestInfo } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import * as dialogHandler from '../components/helpers/dialog-handler';
import {
    buildMlblGiftOrderPayload,
    loadMlblGiftOrderConfig,
    loadMlblGiftOrderData,
    loadMlblGiftOrderDataForProject,
    MlblGiftOrderPayload,
    resolveMlblGiftOrderApiUrl,
    resolveMlblGiftOrderScenario,
} from '../components/helpers/mlbl-gift-order-payload';
import {
    captureMlblGiftOrderLiveDataFromPage,
    getRequiredMlblGiftOrderLiveData,
    MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS,
    saveMlblGiftOrderLiveData,
    waitForMlblGiftOrderResponseLiveData,
} from '../components/helpers/mlbl-gift-order-live-data';
import { waitForDomReady } from '../components/helpers/element-actions';
import { CheckoutPage } from '../components/pages/CheckoutPage';
import { InvoicePage } from '../components/pages/InvoicePage';
import { productCardSelector } from '../constants/selectors';
import { completeCheckoutFromCurrentCart } from './checkout.steps';

export type MlblGiftOrderUiTabResult = {
    tab: string;
    maDon: string;
    trangThai: boolean;
    screenshotPath?: string;
    errorScreenshotPath?: string;
    customerAddress?: string;
    customerName?: string;
    customerPhone?: string;
    productSkus?: string[];
    giftSkus?: string[];
    error?: string;
};

export type MlblGiftOrderApiResult = {
    ok: boolean;
    httpOk: boolean;
    status: number;
    statusText: string;
    durationMs: number;
    orderCode: string;
    productCount: number;
    giftCount: number;
    responseBody: string;
    createdEvidence?: string;
    validationError?: string;
    error?: string;
};

const MAX_RESPONSE_BODY_LENGTH = 1200;
const DEFAULT_UI_TABS = [
    { tab: 'tui don ghep', slug: 'don-ghep' },
    { tab: 'tui doi', slug: 'doi' },
    { tab: 'tui da dung', slug: 'da-dung' },
];
const knownOrderIdentifierKeys = [
    'orderId',
    'order_id',
    'orderCode',
    'order_code',
    'orderNo',
    'order_no',
    'orderNumber',
    'order_number',
    'invoiceId',
    'invoice_id',
    'invoiceCode',
    'invoice_code',
    'maDonHang',
    'ma_don_hang',
    'donHangId',
    'don_hang_id',
];

function tryParseJson(rawBody: string): unknown {
    if (!rawBody.trim()) {
        return undefined;
    }

    try {
        return JSON.parse(rawBody);
    } catch {
        return undefined;
    }
}

function normalizeStatus(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function readJsonPath(value: unknown, jsonPath: string): unknown {
    return jsonPath
        .split('.')
        .filter(Boolean)
        .reduce<unknown>((current, key) => {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            return (current as Record<string, unknown>)[key];
        }, value);
}

function findValueByKnownKeys(value: unknown): { key: string; value: unknown } | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findValueByKnownKeys(item);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    if (!value || typeof value !== 'object') {
        return undefined;
    }

    for (const [key, item] of Object.entries(value)) {
        if (knownOrderIdentifierKeys.includes(key) && item !== undefined && item !== null && String(item).trim() !== '') {
            return { key, value: item };
        }

        const found = findValueByKnownKeys(item);
        if (found) {
            return found;
        }
    }

    return undefined;
}

function validateMlblGiftOrderCreated(response: APIResponse, responseBody: string) {
    if (!response.ok()) {
        return {
            ok: false,
            validationError: `HTTP status is not 2xx: ${response.status()} ${response.statusText()}`,
        };
    }

    const parsedBody = tryParseJson(responseBody);
    if (!parsedBody || typeof parsedBody !== 'object') {
        return {
            ok: false,
            validationError: 'Response is HTTP 2xx but body is not JSON, cannot prove order was created.',
        };
    }

    const requiredOrderIdPath = process.env.MLBL_GIFT_ORDER_ID_PATH || process.env.CHECKOUT_API_ORDER_ID_PATH;
    if (requiredOrderIdPath) {
        const orderId = readJsonPath(parsedBody, requiredOrderIdPath);
        if (orderId !== undefined && orderId !== null && String(orderId).trim() !== '') {
            return { ok: true, createdEvidence: `${requiredOrderIdPath}=${String(orderId)}` };
        }

        return {
            ok: false,
            validationError: `HTTP 2xx but required order id path "${requiredOrderIdPath}" was not found.`,
        };
    }

    const successPath = process.env.MLBL_GIFT_ORDER_SUCCESS_PATH || process.env.CHECKOUT_API_SUCCESS_PATH || 'success';
    const statusPath = process.env.MLBL_GIFT_ORDER_STATUS_PATH || process.env.CHECKOUT_API_STATUS_PATH || 'status';
    const successValue = readJsonPath(parsedBody, successPath);
    const statusValue = readJsonPath(parsedBody, statusPath);
    const knownIdentifier = findValueByKnownKeys(parsedBody);

    if (successValue === false || normalizeStatus(successValue) === 'false') {
        return {
            ok: false,
            validationError: 'HTTP 2xx but response success field is false.',
        };
    }

    if (['failed', 'fail', 'error', 'invalid'].includes(normalizeStatus(statusValue))) {
        return {
            ok: false,
            validationError: `HTTP 2xx but response status field is "${String(statusValue)}".`,
        };
    }

    if (knownIdentifier) {
        return {
            ok: true,
            createdEvidence: `${knownIdentifier.key}=${String(knownIdentifier.value)}`,
        };
    }

    if (successValue === true || ['success', 'succeeded', 'ok', 'created'].includes(normalizeStatus(statusValue))) {
        return {
            ok: true,
            createdEvidence: successValue === true ? 'success=true' : `status=${String(statusValue)}`,
        };
    }

    return {
        ok: false,
        validationError: [
            'HTTP 2xx but no order-created evidence found in response body.',
            'Set MLBL_GIFT_ORDER_ID_PATH to the response field that proves the order exists.',
        ].join(' '),
    };
}

function buildHeaders() {
    return {
        accept: '*/*',
        'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'text/plain',
    };
}

function normalizeUiText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'd')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getTabNeedles(tab: string, slug: string) {
    const normalized = normalizeUiText(`${tab} ${slug}`);

    if (normalized.includes('chon thung') || normalized.includes('thung')) {
        return ['chon thung'];
    }

    if (normalized.includes('don') || normalized.includes('ghep')) {
        return ['tui don ghep', 'don ghep', 'tui don'];
    }

    if (normalized.includes('doi')) {
        return ['tui doi'];
    }

    return ['tui da dung', 'tui da dang'];
}

function getConfiguredUiTabs(projectName: string) {
    const config = loadMlblGiftOrderConfig();
    const projectTabs = config.uiTabsByProject?.[projectName];
    if (projectTabs?.length) {
        return projectTabs;
    }

    return config.uiTabs?.length ? config.uiTabs : DEFAULT_UI_TABS;
}

async function waitForMlblGiftOrderUiReady(page: Page) {
    await waitForDomReady(page);
    await page.getByRole('heading', { name: /Ä‘ang táº£i dá»¯ liá»‡u|dang tai du lieu|Ã„Âang tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u/i })
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => { });
    await expect.poll(async () => {
        if (await page.locator(productCardSelector).first().isVisible({ timeout: 500 }).catch(() => false)) {
            return true;
        }

        return page.evaluate(() => {
            const normalize = (value: string) => value
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'd')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            const text = normalize(document.body.innerText || '');
            return text.includes('tui don ghep')
                || text.includes('chon thung')
                || text.includes('dat hang')
                || text.includes('thanh toan');
        }).catch(() => false);
    }, {
        message: 'MLBL gift order UI should finish loading before selecting tabs.',
        timeout: 45000,
    }).toBe(true);
}

async function clickVisibleByNormalizedText(
    page: Page,
    needles: string[],
    context: string,
    selectors = 'button, [role="button"], [role="tab"], a',
) {
    const clicked = await tryClickVisibleByNormalizedText(page, needles, selectors);

    if (!clicked) {
        throw new Error(`Could not click "${context}". Needles: ${needles.join(', ')}`);
    }
}

async function tryClickVisibleByNormalizedText(
    page: Page,
    needles: string[],
    selectors = 'button, [role="button"], [role="tab"], a',
) {
    return page.evaluate(({ needles, selectors }) => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.pointerEvents !== 'none'
                && Number(style.opacity || '1') > 0.2;
        };
        const isActionable = (element: Element) => {
            const htmlElement = element as HTMLElement;
            const disabled = htmlElement.getAttribute('disabled') !== null
                || htmlElement.getAttribute('aria-disabled') === 'true'
                || (htmlElement as HTMLButtonElement).disabled === true;
            return !disabled;
        };
        const candidates = Array.from(document.querySelectorAll(selectors));
        const target = candidates.find((element) => {
            if (!isVisible(element) || !isActionable(element)) {
                return false;
            }

            const text = normalize(element.textContent || '');
            return needles.some((needle) => text.includes(normalize(needle)));
        }) as HTMLElement | undefined;

        if (!target) {
            return false;
        }

        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return true;
    }, { needles, selectors });
}

async function isMlblGiftPickerVisible(page: Page) {
    return page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || '1') > 0.2;
        };
        const modals = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], .fixed'));
        return modals.some((modal) => {
            const text = normalize(modal.textContent || '');
            return isVisible(modal)
                && (text.includes('chon qua tang') || text.includes('chon qua') || text.includes('qua tang') || text.includes('gift'));
        });
    }).catch(() => false);
}

async function selectEligibleGiftInsideMlblGiftPicker(page: Page) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const result = await page.evaluate(() => {
            const normalize = (value: string) => value
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'd')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0
                    && rect.height > 0
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && style.pointerEvents !== 'none'
                    && Number(style.opacity || '1') > 0.2;
            };
            const modal = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], .fixed'))
                .reverse()
                .find((candidate) => {
                    const text = normalize(candidate.textContent || '');
                    return isVisible(candidate)
                        && (text.includes('chon qua tang') || text.includes('chon qua') || text.includes('qua tang') || text.includes('gift'));
                }) as HTMLElement | undefined;

            if (!modal) {
                return 'modal-missing';
            }

            modal.focus();

            const disqualifiedTexts = ['chua du dieu kien', 'can mua them'];
            const ignoredTexts = ['chon qua tang', 'chon qua nay', 'chon qua', 'tim kiem', 'search', 'dong', 'close', 'ngan sach qua tang', 'da chon', 'con lai'];
            const getGiftCardText = (candidate: HTMLElement) => {
                const card = candidate.closest('[data-testid*="gift"], [class*="gift"], [data-testid^="product-"], [id^="product-"], [class*="product"], [class*="card"], li, [role="option"]') as HTMLElement | null;
                return normalize((card || candidate).textContent || '');
            };
            const candidates = Array.from(modal.querySelectorAll([
                '[data-testid*="gift"]',
                '[class*="gift"]',
                '[data-testid^="product-"]',
                '[id^="product-"]',
                '[class*="product"]',
                '[class*="card"]',
                '[class*="cursor"]',
                '[class*="click"]',
                'li',
                '[role="option"]',
                '[role="button"]',
                'button',
            ].join(','))) as HTMLElement[];
            const target = candidates.find((candidate) => {
                if (!isVisible(candidate)) {
                    return false;
                }

                const text = normalize(candidate.textContent || candidate.getAttribute('aria-label') || candidate.getAttribute('title') || '');
                if (!text || ignoredTexts.some((ignored) => text.includes(ignored))) {
                    return false;
                }

                const giftCardText = getGiftCardText(candidate);
                if (disqualifiedTexts.some((disqualified) => giftCardText.includes(disqualified))) {
                    return false;
                }

                const tagName = candidate.tagName.toLowerCase();
                if ((tagName === 'button' || candidate.getAttribute('role') === 'button')
                    && (text.startsWith('giao sau') || text.startsWith('giao ngay'))) {
                    return false;
                }

                const rect = candidate.getBoundingClientRect();
                return rect.width > 32 && rect.height > 24;
            });

            if (!target) {
                const scrollables = [
                    modal,
                    ...Array.from(modal.querySelectorAll<HTMLElement>('*')),
                ].filter((element) => element.scrollHeight > element.clientHeight + 4) as HTMLElement[];
                const scrollTarget = scrollables
                    .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];

                if (!scrollTarget) {
                    return 'no-eligible-gift';
                }

                const before = scrollTarget.scrollTop;
                scrollTarget.scrollTop = Math.min(
                    scrollTarget.scrollHeight - scrollTarget.clientHeight,
                    scrollTarget.scrollTop + Math.max(160, Math.floor(scrollTarget.clientHeight * 0.8)),
                );

                return scrollTarget.scrollTop > before ? 'scrolled' : 'no-eligible-gift';
            }

            target.scrollIntoView({ block: 'center', inline: 'center' });
            target.click();
            return 'selected';
        });

        if (result === 'selected') {
            return;
        }

        if (result === 'modal-missing') {
            throw new Error('Gift picker modal was not visible while selecting an eligible gift.');
        }

        if (result === 'no-eligible-gift') {
            break;
        }

        await page.waitForTimeout(250);
    }

    throw new Error('No eligible gift found in gift picker modal. All visible gifts are missing or marked "Chua du dieu kien".');
}
async function clickChooseThisGiftInsideMlblGiftPicker(page: Page) {
    const clicked = await page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.pointerEvents !== 'none'
                && Number(style.opacity || '1') > 0.2;
        };
        const isActionable = (element: Element) => {
            const htmlElement = element as HTMLElement;
            return htmlElement.getAttribute('disabled') === null
                && htmlElement.getAttribute('aria-disabled') !== 'true'
                && (htmlElement as HTMLButtonElement).disabled !== true;
        };
        const modal = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], .fixed'))
            .reverse()
            .find((candidate) => {
                const text = normalize(candidate.textContent || '');
                return isVisible(candidate)
                    && (text.includes('chon qua tang') || text.includes('chon qua') || text.includes('qua tang') || text.includes('gift'));
            }) as HTMLElement | undefined;

        if (!modal) {
            return false;
        }

        const target = Array.from(modal.querySelectorAll('button, [role="button"], a'))
            .find((candidate) => {
                if (!isVisible(candidate) || !isActionable(candidate)) {
                    return false;
                }

                const text = normalize(candidate.textContent || candidate.getAttribute('aria-label') || candidate.getAttribute('title') || '');
                return text.includes('chon qua nay') || text.includes('chon qua tang nay');
            }) as HTMLElement | undefined;

        if (!target) {
            return false;
        }

        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return true;
    });

    if (!clicked) {
        throw new Error('Could not click "choose this gift" inside gift picker modal.');
    }
}

async function waitForMlblGiftPickerClosed(page: Page) {
    await expect.poll(() => isMlblGiftPickerVisible(page), {
        message: 'Gift picker modal should close after choosing a gift.',
        timeout: 10000,
    }).toBe(false);
}

async function selectMlblGiftOrderUiTab(
    page: Page,
    tab: { tab: string; slug: string; selectors?: string[] },
    dialogTracker?: dialogHandler.DialogTracker,
) {
    await waitForMlblGiftOrderUiReady(page);
    if (dialogTracker) {
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, `gift-order-select-tab-${tab.slug}-precheck`);
    }

    if (tab.selectors?.length) {
        for (const selector of tab.selectors) {
            const locator = page.locator(selector).first();
            if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
                await locator.click({ timeout: 10000 });
                await waitForDomReady(page);
                return;
            }
        }
    }

    await clickVisibleByNormalizedText(page, getTabNeedles(tab.tab, tab.slug), `tab ${tab.tab}`);
    await waitForDomReady(page);
}

async function addFirstProductAndGift(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker,
) {
    const firstProductCard = page.locator(productCardSelector).first();
    await expect(firstProductCard, 'First product card should be visible before selecting gift order item').toBeVisible({ timeout: 15000 });

    const plusButton = firstProductCard.getByRole('button', { name: /^\+$/ }).last();
    if (await plusButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await plusButton.click({ timeout: 10000 });
    } else {
        await clickVisibleByNormalizedText(page, ['+'], 'first product add button', 'button');
    }

    if (dialogTracker) {
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-add-product');
    }

    const chooseGiftInCard = firstProductCard.locator('button, [role="button"]').filter({ hasText: /chá»n quÃ |chon qua/i }).first();
    if (!await chooseGiftInCard.isVisible({ timeout: 1000 }).catch(() => false)
        && !await hasEnabledMlblCheckoutAction(page)) {
        if (await tryClickVisibleByNormalizedText(page, ['chon thung'])) {
            await waitForDomReady(page);
        }
        await clickFirstVisiblePlusButton(page);
        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-add-visible-product');
        }
    }

    let giftPickerExpected = false;
    if (await chooseGiftInCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chooseGiftInCard.click({ timeout: 10000 });
        giftPickerExpected = true;
    } else {
        giftPickerExpected = await tryClickVisibleByNormalizedText(page, ['chon qua']);
    }

    await waitForDomReady(page);
    const scopedGiftPickerVisible = await expect.poll(() => isMlblGiftPickerVisible(page), {
        timeout: 3000,
    }).toBe(true).then(() => true).catch(() => false);
    if (scopedGiftPickerVisible) {
        await selectEligibleGiftInsideMlblGiftPicker(page);
        await clickChooseThisGiftInsideMlblGiftPicker(page);
        await waitForMlblGiftPickerClosed(page);

        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-choose-gift');
        }
        return;
    }

    if (giftPickerExpected) {
        throw new Error('Gift picker modal did not open after clicking choose gift.');
    }
    const giftPicker = page.locator('[role="dialog"], [class*="modal"], [class*="popup"]').filter({ hasText: /quÃ |qua|gift/i }).last();
    const giftPickerVisible = await giftPicker.isVisible({ timeout: 3000 }).catch(() => false);
    if (!giftPickerVisible && !giftPickerExpected) {
        return;
    }

    const firstGiftCandidate = giftPicker
        .locator('[data-testid*="gift"], [class*="gift"], [data-testid^="product-"], [id^="product-"], button, [role="button"]')
        .filter({ hasNotText: /chá»n quÃ  nÃ y|chon qua nay/i })
        .filter({ hasNotText: /chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n|chua du dieu kien|cáº§n mua thÃªm|can mua them/i })
        .first();

    if (await firstGiftCandidate.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstGiftCandidate.click({ timeout: 10000 });
    } else {
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
    }

    const choseGift = await tryClickVisibleByNormalizedText(page, ['chon qua tang nay', 'chon qua nay']);
    if (!choseGift && await giftPicker.isVisible({ timeout: 1000 }).catch(() => false)) {
        throw new Error('Could not click "choose this gift". Needles: chon qua tang nay, chon qua nay');
    }

    if (dialogTracker) {
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-choose-gift');
    }
}

async function clickFirstVisiblePlusButton(page: Page) {
    const plusButtons = page.getByRole('button', { name: /^\+$/ });
    const count = await plusButtons.count();
    for (let index = 0; index < count; index++) {
        const button = plusButtons.nth(index);
        if (await button.isVisible({ timeout: 300 }).catch(() => false)
            && await button.isEnabled().catch(() => true)) {
            await button.click({ timeout: 10000 });
            await waitForDomReady(page);
            return;
        }
    }

    throw new Error('Could not click visible product add button');
}

async function hasEnabledMlblCheckoutAction(page: Page) {
    return page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || '1') > 0.2;
        };
        return Array.from(document.querySelectorAll('button, [role="button"]')).some((element) => {
            const htmlElement = element as HTMLElement;
            const disabled = htmlElement.getAttribute('disabled') !== null
                || htmlElement.getAttribute('aria-disabled') === 'true'
                || (htmlElement as HTMLButtonElement).disabled === true;
            const text = normalize(element.textContent || '');
            return isVisible(element)
                && !disabled
                && (text.includes('dat hang') || text.includes('thanh toan'));
        });
    }).catch(() => false);
}

async function proceedMlblGiftOrderToCheckout(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker,
) {
    if (await isMlblGiftPickerVisible(page)) {
        throw new Error('Gift picker modal is still open before proceeding to checkout.');
    }

    const clickedOrderButton = await tryClickVisibleByNormalizedText(page, ['dat hang'], 'button, [role="button"]');
    if (!clickedOrderButton) {
        await clickVisibleByNormalizedText(page, ['thanh toan'], 'proceed gift order to checkout', 'button, [role="button"]');
    }
    await waitForDomReady(page);
    if (dialogTracker) {
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-proceed-checkout');
    }
}

function parseMlblGiftOrderPostData(postData: string | null): MlblGiftOrderPayload | undefined {
    if (!postData) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(postData) as MlblGiftOrderPayload;
        return parsed?.action === 'insertOrder' ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function waitForMlblGiftOrderRequest(page: Page) {
    return page.waitForRequest((request) => {
        if (request.method() !== 'POST') {
            return false;
        }

        return parseMlblGiftOrderPostData(request.postData()) !== undefined;
    }, { timeout: 30000 }).catch(() => null);
}

async function hasMlblGiftOrderSuccess(page: Page) {
    return page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const bodyText = normalize(document.body.innerText || '');
        return bodyText.includes('dat hang thanh cong')
            || bodyText.includes('ma don hang')
            || bodyText.includes('hoa don chi tiet');
    }).catch(() => false);
}

async function extractMlblGiftOrderCodeFromPage(page: Page) {
    return page.evaluate(() => {
        const text = document.body.innerText || '';
        return text.match(/ONLINE-MLBL-[A-Z0-9-]+/)?.[0] ?? '';
    }).catch(() => '');
}

async function completeMlblGiftOrder(
    page: Page,
    checkoutPage: CheckoutPage,
    dialogTracker?: dialogHandler.DialogTracker,
) {
    if (await hasMlblGiftOrderSuccess(page)) {
        return;
    }

    try {
        await checkoutPage.completeOrder();
    } catch (error) {
        if (await hasMlblGiftOrderSuccess(page)) {
            return;
        }

        if (await isMlblCustomerInfoPopupVisible(page)) {
            const clicked = await clickMlblCustomerInfoConfirm(page);
            if (!clicked) {
                console.warn('MLBL gift order customer info confirm button was not clickable; waiting for current submit state.');
            }
            await waitForMlblCustomerInfoSubmitted(page, dialogTracker);
            return;
        }

        if (dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-complete-fallback');
        }

        throw error;
    }

    if (!await hasMlblGiftOrderSuccess(page) && await isMlblCustomerInfoPopupVisible(page)) {
        const clicked = await clickMlblCustomerInfoConfirm(page);
        if (!clicked) {
            console.warn('MLBL gift order customer info confirm button was not clickable; waiting for current submit state.');
        }

        await waitForMlblCustomerInfoSubmitted(page, dialogTracker);
    }
}

async function clickMlblCustomerInfoConfirm(page: Page) {
    const clicked = await page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.pointerEvents !== 'none'
                && Number(style.opacity || '1') > 0.2;
        };
        const isActionable = (element: Element) => {
            const htmlElement = element as HTMLElement;
            return htmlElement.getAttribute('disabled') === null
                && htmlElement.getAttribute('aria-disabled') !== 'true'
                && (htmlElement as HTMLButtonElement).disabled !== true;
        };
        const containers = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], form, section, article, .fixed, body'))
            .filter(isVisible)
            .reverse();
        const customerInfoContainer = containers.find((container) => {
            const text = normalize(container.textContent || '');
            const inputs = Array.from(container.querySelectorAll('input, textarea')).filter(isVisible);
            return inputs.length > 0
                && (text.includes('nguoi dat') || text.includes('so dien thoai') || text.includes('khach hang') || text.includes('xac nhan'));
        });

        if (!customerInfoContainer) {
            return false;
        }

        const scrollables = [
            customerInfoContainer,
            ...Array.from(customerInfoContainer.querySelectorAll('*')),
        ].filter((element) => {
            const htmlElement = element as HTMLElement;
            return htmlElement.scrollHeight > htmlElement.clientHeight + 4;
        }) as HTMLElement[];

        for (const element of scrollables) {
            element.scrollTop = element.scrollHeight;
        }

        const buttons = Array.from(customerInfoContainer.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
        const target = buttons.slice().reverse().find((button) => {
            if (!isActionable(button)) {
                return false;
            }

            const text = normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '');
            return text.includes('xac nhan')
                && !text.includes('thanh toan')
                && !text.includes('sao chep')
                && !text.includes('tai ve');
        });

        if (!target) {
            return false;
        }

        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return true;
    }).catch(() => false);

    if (clicked) {
        await waitForDomReady(page).catch(() => { });
    }

    return clicked;
}

async function isMlblCustomerInfoPopupVisible(page: Page) {
    return page.evaluate(() => {
        const normalize = (value: string) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || '1') > 0.2;
        };

        return Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], form, section, article, .fixed'))
            .filter(isVisible)
            .some((container) => {
                const text = normalize(container.textContent || '');
                const inputs = Array.from(container.querySelectorAll('input, textarea')).filter(isVisible);
                return inputs.length > 0
                    && (text.includes('thong tin dat hang') || text.includes('thong tin nhan qua') || text.includes('nguoi dat'));
            });
    }).catch(() => false);
}

async function waitForMlblCustomerInfoSubmitted(
    page: Page,
    dialogTracker?: dialogHandler.DialogTracker,
) {
    const submitted = await expect.poll(async () => {
        if (dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, 'gift-order-customer-info-submit-wait', 250);
        }

        if (await hasMlblGiftOrderSuccess(page)) {
            return true;
        }

        return !await isMlblCustomerInfoPopupVisible(page);
    }, {
        message: 'MLBL gift order customer info popup should close after confirming customer info.',
        timeout: 30000,
    }).toBe(true).then(() => true).catch(() => false);

    if (!submitted) {
        throw new Error('MLBL gift order customer info popup stayed open after clicking "XÃ¡c nháº­n".');
    }
}

async function captureMlblGiftOrderInvoice(
    invoicePage: InvoicePage,
    testInfo: TestInfo,
) {
    return invoicePage.captureInvoice(testInfo);
}

async function closeMlblGiftOrderPopups(page: Page, dialogTracker?: dialogHandler.DialogTracker) {
    if (dialogTracker) {
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-close-popups-precheck');
    }

    const explicitCloseRegex = /^(OK|âœ•|Ã—|X|ÄÃ³ng|ÄÃ³ng láº¡i|Dong|Dong lai|Close)$/i;
    const closeNeedles = ['dong', 'dong lai', 'x', 'âœ•', 'ok', 'close'];
    closeNeedles.push('xac nhan');
    for (let attempt = 0; attempt < 6; attempt++) {
        const explicitCloseButtons = page.locator('button, [role="button"], a, [class*="cursor"]').filter({ hasText: explicitCloseRegex });
        const explicitCount = await explicitCloseButtons.count().catch(() => 0);
        let clickedExplicit = false;
        for (let index = explicitCount - 1; index >= 0; index--) {
            const button = explicitCloseButtons.nth(index);
            if (await button.isVisible({ timeout: 300 }).catch(() => false)) {
                await button.click({ timeout: 3000 }).catch(() => { });
                clickedExplicit = true;
                break;
            }
        }

        if (clickedExplicit) {
            await page.waitForTimeout(300);
            continue;
        }

        const clicked = await page.evaluate((needles) => {
            const normalize = (value: string) => value
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'd')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            };
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], a, [class*="cursor"], svg')) as HTMLElement[];
            const textTarget = buttons.slice().reverse().find((button) => {
                if (!isVisible(button)) {
                    return false;
                }

                const text = normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '');
                return needles.some((needle) => text === normalize(needle) || text.includes(normalize(needle)));
            });
            const target = textTarget ?? buttons.slice().reverse().find((button) => {
                if (!isVisible(button)) {
                    return false;
                }

                const text = normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '');
                if (text) {
                    return false;
                }

                const rect = button.getBoundingClientRect();
                const overlay = button.closest('[role="dialog"], [class*="modal"], [class*="popup"], .fixed');
                const overlayRect = overlay?.getBoundingClientRect();
                return !!overlayRect
                    && rect.width <= 64
                    && rect.height <= 64
                    && rect.left > overlayRect.left + overlayRect.width * 0.6
                    && rect.top < overlayRect.top + overlayRect.height * 0.25;
            });

            if (!target) {
                return false;
            }

            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
        }, closeNeedles).catch(() => false);

        if (!clicked) {
            break;
        }

        await page.waitForTimeout(300);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        const clickedOverlayClose = await page.evaluate(() => {
            const normalize = (value: string) => value
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u0111/g, 'd')
                .replace(/\u0110/g, 'd')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            };
            const overlays = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], .fixed'))
                .filter(isVisible)
                .reverse();
            const overlay = overlays.find((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return rect.width > 200 && rect.height > 120;
            });

            if (!overlay) {
                return false;
            }

            const buttons = Array.from(overlay.querySelectorAll('button, [role="button"], a, [class*="cursor"], svg')) as HTMLElement[];
            const confirmButton = buttons.slice().reverse().find((button) => {
                if (!isVisible(button)) {
                    return false;
                }

                const text = normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '');
                return text.includes('xac nhan') || text.includes('dong') || text.includes('close') || text === 'ok';
            });
            const iconButton = buttons.slice().reverse().find((button) => {
                if (!isVisible(button)) {
                    return false;
                }

                const text = normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '');
                if (text) {
                    return false;
                }

                const rect = button.getBoundingClientRect();
                const overlayRect = overlay.getBoundingClientRect();
                return rect.width <= 64
                    && rect.height <= 64
                    && rect.left > overlayRect.left + overlayRect.width * 0.6
                    && rect.top < overlayRect.top + overlayRect.height * 0.3;
            });
            const target = confirmButton ?? iconButton;
            if (!target) {
                return false;
            }

            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
        }).catch(() => false);

        if (!clickedOverlayClose) {
            break;
        }

        await page.waitForTimeout(300).catch(() => { });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        const clickedTopRightClose = await page.evaluate(() => {
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            };
            const overlays = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], .fixed'))
                .filter(isVisible)
                .reverse();
            const overlay = overlays.find((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return rect.width > 200 && rect.height > 120;
            });

            if (!overlay) {
                return false;
            }

            const rect = overlay.getBoundingClientRect();
            const target = document.elementFromPoint(rect.right - 22, rect.top + 28) as HTMLElement | null;
            if (!target || !overlay.contains(target)) {
                return false;
            }

            for (const eventName of ['mousedown', 'mouseup', 'click']) {
                target.dispatchEvent(new MouseEvent(eventName, {
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.right - 22,
                    clientY: rect.top + 28,
                }));
            }
            return true;
        }).catch(() => false);

        if (!clickedTopRightClose) {
            break;
        }

        await page.waitForTimeout(300).catch(() => { });
    }

    await page.keyboard.press('Escape').catch(() => { });
    await waitForDomReady(page).catch(() => { });
}

async function copyInvoiceScreenshotToGiftOrderName(sourcePath: string, testInfo: TestInfo, tabSlug: string) {
    const screenshotDir = path.resolve(process.cwd(), 'test-results', 'report', 'pass');
    const targetPath = path.join(screenshotDir, `${testInfo.project.name}-gift-orde-${tabSlug}.png`);

    await fs.mkdir(screenshotDir, { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    await testInfo.attach(`gift-order-${tabSlug}-invoice`, {
        path: targetPath,
        contentType: 'image/png',
    });

    if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
        await fs.rm(sourcePath, { force: true }).catch(() => { });
    }

    return targetPath;
}

async function captureMlblGiftOrderErrorScreenshot(
    page: Page,
    testInfo: TestInfo,
    artifactName: string,
) {
    if (page.isClosed()) {
        return undefined;
    }

    const screenshotDir = path.resolve(process.cwd(), 'test-results', 'report', 'err');
    const screenshotPath = path.join(screenshotDir, `${artifactName}_error.png`);

    await fs.mkdir(screenshotDir, { recursive: true });
    await dialogHandler.captureFailureState(page, screenshotPath).catch(async () => {
        await page.screenshot({
            path: screenshotPath,
            fullPage: false,
            animations: 'disabled',
        });
    });

    const screenshotSaved = await fs.access(screenshotPath).then(() => true).catch(() => false);
    if (!screenshotSaved) {
        return undefined;
    }

    await testInfo.attach(`${artifactName}-error`, {
        path: screenshotPath,
        contentType: 'image/png',
    });
    return screenshotPath;
}

async function exportMlblGiftOrderUiReport(testInfo: TestInfo, results: MlblGiftOrderUiTabResult[]) {
    const reportDir = path.resolve(process.cwd(), 'test-results', 'report', 'pass');
    const reportPath = path.join(reportDir, `${testInfo.project.name}-gift-order-tabs-report.json`);

    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
        project: testInfo.project.name,
        generatedAt: new Date().toISOString(),
        results,
    }, null, 2));
    await testInfo.attach('mlbl-gift-order-ui-tabs-report', {
        path: reportPath,
        contentType: 'application/json',
    });

    return reportPath;
}

function summarizeResult(result: MlblGiftOrderApiResult) {
    return {
        pass: result.ok,
        httpOk: result.httpOk,
        status: result.status,
        durationMs: result.durationMs,
        orderCode: result.orderCode,
        productCount: result.productCount,
        giftCount: result.giftCount,
        createdEvidence: result.createdEvidence,
        validationError: result.validationError,
        error: result.error,
    };
}

async function exportMlblGiftOrderApiReport(
    testInfo: TestInfo,
    apiUrl: string,
    payload: MlblGiftOrderPayload,
    result: MlblGiftOrderApiResult,
) {
    const reportDir = path.resolve(process.cwd(), 'test-results', 'report', 'api-performance');
    const baseName = `${testInfo.project.name}-mlbl-gift-order-api-report`;
    const jsonPath = path.join(reportDir, `${baseName}.json`);
    const markdownPath = path.join(reportDir, `${baseName}.md`);
    const summary = summarizeResult(result);
    const postData = JSON.stringify(payload);
    const report = {
        generatedAt: new Date().toISOString(),
        project: testInfo.project.name,
        mode: 'mlbl-gift-order',
        request: {
            method: 'POST',
            url: apiUrl,
            contentType: 'text/plain',
            postData,
        },
        order: {
            orderCode: payload.orderData.orderCode,
            customerName: payload.orderData.customerName,
            customerPhone: payload.orderData.customerPhone,
            giftReceiverName: payload.orderData.giftReceiverName,
            giftReceiverPhone: payload.orderData.giftReceiverPhone,
            orderBuyerName: payload.orderData.orderBuyerName,
            orderBuyerPhone: payload.orderData.orderBuyerPhone,
            totalAmount: payload.orderData.totalAmount,
            productCount: payload.orderData.products.length,
            giftCount: payload.orderData.gift.items.length,
            giftBudget: payload.orderData.tongGtQuaTang,
            selectedGiftValue: payload.orderData.tongGtQuaTangDaChon,
            remainingGiftValue: payload.orderData.tongGtQuaTangConLai,
        },
        summary,
        result,
    };
    const markdown = [
        '# MLBL Gift Order API Report',
        '',
        `- Project: ${testInfo.project.name}`,
        `- Endpoint: POST ${apiUrl}`,
        `- Order code: ${payload.orderData.orderCode}`,
        `- Nguoi dat hang: ${payload.orderData.customerName}`,
        `- SDT nguoi dat: ${payload.orderData.customerPhone}`,
        `- Nguoi nhan qua: ${payload.orderData.giftReceiverName}`,
        `- SDT nguoi nhan qua: ${payload.orderData.giftReceiverPhone}`,
        `- Nguoi mua hang: ${payload.orderData.orderBuyerName}`,
        `- SDT nguoi mua: ${payload.orderData.orderBuyerPhone}`,
        `- Product count: ${payload.orderData.products.length}`,
        `- Gift count: ${payload.orderData.gift.items.length}`,
        `- Total amount: ${payload.orderData.totalAmount}`,
        `- Gift selected value: ${payload.orderData.tongGtQuaTangDaChon}`,
        `- HTTP status: ${result.status} ${result.statusText}`,
        `- Duration ms: ${result.durationMs}`,
        `- Verified created: ${result.ok}`,
        result.createdEvidence ? `- Evidence: ${result.createdEvidence}` : '',
        result.validationError ? `- Validation: ${result.validationError}` : '',
        result.error ? `- Error: ${result.error}` : '',
        '',
        '## Request Body',
        '',
        '```json',
        postData,
        '```',
        '',
        '## Response Preview',
        '',
        result.responseBody || 'No response body.',
        '',
    ].filter(line => line !== '').join('\n');

    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(markdownPath, markdown);
    await testInfo.attach('mlbl-gift-order-api-report-json', {
        path: jsonPath,
        contentType: 'application/json',
    });
    await testInfo.attach('mlbl-gift-order-api-report-md', {
        path: markdownPath,
        contentType: 'text/markdown',
    });

    console.log(`MLBL gift order API JSON report: ${jsonPath}`);
    console.log(`MLBL gift order API Markdown report: ${markdownPath}`);
    return { jsonPath, markdownPath };
}

export async function openMlblGiftOrderHome(page: Page, testInfo: TestInfo) {
    const config = loadMlblGiftOrderConfig();
    const data = loadMlblGiftOrderDataForProject(testInfo.project.name);
    const livePricingEnabled = config.livePricing?.enabled !== false;
    const liveDataPromise = waitForMlblGiftOrderResponseLiveData(page, config.productSku, livePricingEnabled);

    await page.goto(getProjectHomeUrl(testInfo));
    await waitForDomReady(page);
    await expect(page.locator('body'), 'SI home page should be reachable before API order creation').toBeVisible();
    await expect(
        page.getByRole('heading', { name: /Äang táº£i dá»¯ liá»‡u|Dang tai du lieu/i }),
        'SI home page should finish loading product data before resolving live MLBL price',
    ).toBeHidden({ timeout: MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS }).catch(() => { });

    const responseLiveData = await liveDataPromise;
    const pageLiveData = await captureMlblGiftOrderLiveDataFromPage(page, config, data);
    const resolvedLiveData = {
        product: pageLiveData.product || (responseLiveData && 'product' in responseLiveData ? responseLiveData.product : undefined),
        gift: responseLiveData && 'gift' in responseLiveData ? responseLiveData.gift || pageLiveData.gift : pageLiveData.gift,
    };

    if (resolvedLiveData.product) {
        saveMlblGiftOrderLiveData(page, resolvedLiveData);
        console.log([
            `Resolved live MLBL product for SKU ${resolvedLiveData.product.sku}:`,
            `tenSP=${resolvedLiveData.product.tenSP || ''}`,
            `giaSauKM=${resolvedLiveData.product.giaSauKM}`,
        ].join(' '));
        if (resolvedLiveData.gift) {
            console.log([
                `Resolved live MLBL gift for SKU ${resolvedLiveData.gift.sku}:`,
                `tenSP=${resolvedLiveData.gift.tenSP || ''}`,
                `nhanHang=${resolvedLiveData.gift.nhanHang || ''}`,
                `giaTriHangTang=${resolvedLiveData.gift.giaTriHangTang ?? ''}`,
            ].join(' '));
        }
    } else if (livePricingEnabled) {
        console.warn(`Could not resolve live MLBL giaSauKM for SKU ${config.productSku} from page load responses.`);
    }
}

export async function createMlblGiftOrdersFromUiTabs(
    page: Page,
    testInfo: TestInfo,
): Promise<MlblGiftOrderUiTabResult[]> {
    const baseUrl = getProjectHomeUrl(testInfo);
    const data = loadMlblGiftOrderDataForProject(testInfo.project.name);
    const tabs = getConfiguredUiTabs(testInfo.project.name);
    const results: MlblGiftOrderUiTabResult[] = [];
    const dialogTracker = dialogHandler.setupDialogTracker(page, `${testInfo.project.name}-gift-order-tabs`);
    const checkoutPage = new CheckoutPage(page, dialogTracker);
    const invoicePage = new InvoicePage(page, dialogTracker);

    await page.addInitScript(() => {
        window.print = () => {
            window.dispatchEvent(new CustomEvent('printRequested'));
        };
    });
    await page.goto(baseUrl);
    await waitForMlblGiftOrderUiReady(page);
    await expect(page.locator('body'), `${testInfo.project.name} home page should be reachable before UI gift order flow`).toBeVisible();
    await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'gift-order-page-load');

    for (const tab of tabs) {
        const artifactName = `${testInfo.project.name}-gift-orde-${tab.slug}`;
        const result: MlblGiftOrderUiTabResult = {
            tab: tab.tab,
            maDon: '',
            trangThai: false,
        };

        try {
            let requestPromise: ReturnType<typeof waitForMlblGiftOrderRequest> | undefined;

            await closeMlblGiftOrderPopups(page, dialogTracker);
            await selectMlblGiftOrderUiTab(page, tab, dialogTracker);
            await addFirstProductAndGift(page, dialogTracker);
            await proceedMlblGiftOrderToCheckout(page, dialogTracker);
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `gift-order-${tab.slug}-proceed-checkout`);
            const checkoutResult = await completeCheckoutFromCurrentCart(page, testInfo, {
                artifactName,
                customer: {
                    name: data.customer.name,
                    phone: data.customer.phone,
                },
                dialogTracker,
                checkoutPage,
                invoicePage,
                beforeCompleteOrder: () => {
                    requestPromise = waitForMlblGiftOrderRequest(page);
                },
                completeOrder: async ({ checkoutPage: currentCheckoutPage, dialogTracker: currentDialogTracker }) => {
                    await completeMlblGiftOrder(page, currentCheckoutPage, currentDialogTracker);
                },
                captureInvoice: async ({ invoicePage: currentInvoicePage, artifactTestInfo }) => {
                    return captureMlblGiftOrderInvoice(currentInvoicePage, artifactTestInfo);
                },
            });

            const orderRequest = await requestPromise;
            if (!orderRequest && !await hasMlblGiftOrderSuccess(page)) {
                throw new Error('MLBL gift order did not reach success state after confirming customer info.');
            }
            const apiPayload = parseMlblGiftOrderPostData(orderRequest?.postData() ?? null);
            const fallbackScenario = resolveMlblGiftOrderScenario(data);
            const uiOrderCode = await extractMlblGiftOrderCodeFromPage(page);
            const namedScreenshot = await copyInvoiceScreenshotToGiftOrderName(checkoutResult.invoiceScreenshotPath, testInfo, tab.slug);

            result.trangThai = true;
            result.maDon = apiPayload?.orderData.orderCode ?? uiOrderCode;
            result.screenshotPath = namedScreenshot;
            result.customerAddress = apiPayload?.orderData.customerAddress;
            result.customerName = apiPayload?.orderData.customerName;
            result.customerPhone = apiPayload?.orderData.customerPhone;
            result.productSkus = apiPayload?.orderData.products.map(product => product.sku) ?? fallbackScenario.products.map(product => product.sku);
            result.giftSkus = apiPayload?.orderData.gift.items.map(gift => gift.sku) ?? fallbackScenario.gifts.map(gift => gift.sku);

            await closeMlblGiftOrderPopups(page, dialogTracker);
            await page.goto(baseUrl);
            await waitForMlblGiftOrderUiReady(page);
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `gift-order-${tab.slug}-reset-page`);
        } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            result.errorScreenshotPath = await captureMlblGiftOrderErrorScreenshot(page, testInfo, artifactName).catch(() => undefined);
            await closeMlblGiftOrderPopups(page, dialogTracker).catch(() => { });
            results.push(result);
            await exportMlblGiftOrderUiReport(testInfo, results);
            break;
        } finally {
            if (!results.includes(result)) {
                results.push(result);
                await exportMlblGiftOrderUiReport(testInfo, results);
            }
        }
    }

    return results;
}

export async function createMlblGiftOrderByApi(
    api: APIRequestContext,
    testInfo: TestInfo,
    page?: Page,
): Promise<MlblGiftOrderApiResult> {
    const baseUrl = getProjectHomeUrl(testInfo);
    const data = loadMlblGiftOrderDataForProject(testInfo.project.name);
    const config = loadMlblGiftOrderConfig();
    const apiUrl = resolveMlblGiftOrderApiUrl(baseUrl, data);
    const liveData = getRequiredMlblGiftOrderLiveData(page, config.productSku, config.livePricing?.enabled !== false);
    const payload = buildMlblGiftOrderPayload(baseUrl, data, config, liveData);
    const startedAt = Date.now();

    try {
        const response = await api.fetch(apiUrl, {
            method: 'POST',
            headers: buildHeaders(),
            data: JSON.stringify(payload),
        });
        const responseBody = await response.text().catch(error => `Could not read response body: ${String(error)}`);
        const validation = validateMlblGiftOrderCreated(response, responseBody);
        const result: MlblGiftOrderApiResult = {
            ok: validation.ok,
            httpOk: response.ok(),
            status: response.status(),
            statusText: response.statusText(),
            durationMs: Date.now() - startedAt,
            orderCode: payload.orderData.orderCode,
            productCount: payload.orderData.products.length,
            giftCount: payload.orderData.gift.items.length,
            responseBody: responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH),
            createdEvidence: validation.createdEvidence,
            validationError: validation.validationError,
        };

        await exportMlblGiftOrderApiReport(testInfo, apiUrl, payload, result);
        return result;
    } catch (error) {
        const result: MlblGiftOrderApiResult = {
            ok: false,
            httpOk: false,
            status: 0,
            statusText: 'ERR',
            durationMs: Date.now() - startedAt,
            orderCode: payload.orderData.orderCode,
            productCount: payload.orderData.products.length,
            giftCount: payload.orderData.gift.items.length,
            responseBody: '',
            error: error instanceof Error ? error.message : String(error),
        };

        await exportMlblGiftOrderApiReport(testInfo, apiUrl, payload, result);
        return result;
    }
}

export async function exportMlblGiftOrderApiTemplate(testInfo: TestInfo, page?: Page) {
    const baseUrl = getProjectHomeUrl(testInfo);
    const data = loadMlblGiftOrderDataForProject(testInfo.project.name);
    const config = loadMlblGiftOrderConfig();
    const apiUrl = resolveMlblGiftOrderApiUrl(baseUrl, data);
    const liveData = getRequiredMlblGiftOrderLiveData(page, config.productSku, config.livePricing?.enabled !== false);
    const payload = buildMlblGiftOrderPayload(baseUrl, data, config, liveData);
    const outputPath = path.resolve(process.cwd(), 'test-data', 'k6', `${testInfo.project.name}-mlbl-gift-order-api-template.json`);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({
        projectName: testInfo.project.name,
        url: apiUrl,
        method: 'POST',
        headers: buildHeaders(),
        contentType: 'text/plain',
        postData: JSON.stringify(payload),
        orderCodePrefix: data.orderCodePrefix,
        customerName: payload.orderData.customerName,
        customerPhone: payload.orderData.customerPhone,
        giftReceiverName: payload.orderData.giftReceiverName,
        giftReceiverPhone: payload.orderData.giftReceiverPhone,
        orderBuyerName: payload.orderData.orderBuyerName,
        orderBuyerPhone: payload.orderData.orderBuyerPhone,
        dataPath: path.join('test-data', 'json', 'mlbl-gift-order-si.json'),
    }, null, 2));
    await testInfo.attach('mlbl-gift-order-k6-template', {
        path: outputPath,
        contentType: 'application/json',
    });

    console.log(`Exported MLBL gift order API template for k6: ${outputPath}`);
    return outputPath;
}
