/// <reference types="node" />
import { APIRequestContext, APIResponse, expect, Page, Response as PageResponse, TestInfo } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import {
    buildMlblGiftOrderPayload,
    loadMlblGiftOrderConfig,
    loadMlblGiftOrderData,
    MlblGiftOrderLiveData,
    MlblGiftOrderLiveGiftData,
    MlblGiftOrderLiveProductPrice,
    MlblGiftOrderPayload,
    resolveMlblGiftOrderApiUrl,
} from '../components/helpers/mlbl-gift-order-payload';
import { waitForDomReady } from '../components/helpers/element-actions';

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
const MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS = 20000;
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
const mlblGiftOrderLiveData = new WeakMap<Page, MlblGiftOrderLiveData>();
const productPriceKeys = [
    'giaSauKM',
    'priceAfterPromotion',
    'promotionPrice',
    'salePrice',
    'discountPrice',
    'finalPrice',
    'price',
    'giaBan',
    'gia',
];
const giftValueKeys = ['giaTriHangTang', 'giftValue', 'giftPrice', 'value', 'price', 'giaTri', 'gia'];
const nameKeys = ['tenSP', 'name', 'productName', 'giftName', 'tenSanPham', 'title'];
const brandKeys = ['nhanHang', 'brand', 'brandName', 'thuongHieu'];

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

function normalizeSku(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeText(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function parsePriceValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const numericText = value.replace(/[^\d.-]/g, '');
    if (!numericText) {
        return undefined;
    }

    const parsed = Number(numericText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function findFirstStringByKeys(value: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const item = value[key];
        if (typeof item === 'string' && item.trim()) {
            return item.trim();
        }
    }

    return undefined;
}

function findNumberByKeys(value: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const price = parsePriceValue(value[key]);
        if (price !== undefined) {
            return price;
        }
    }

    return undefined;
}

function findLiveProductData(value: unknown, sku: string): MlblGiftOrderLiveProductPrice | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findLiveProductData(item, sku);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    if (normalizeSku(record.sku) === normalizeSku(sku)) {
        const giaSauKM = findNumberByKeys(record, productPriceKeys);
        if (giaSauKM !== undefined) {
            return {
                sku,
                tenSP: findFirstStringByKeys(record, nameKeys),
                nhanHang: findFirstStringByKeys(record, brandKeys),
                giaSauKM,
            };
        }
    }

    for (const item of Object.values(record)) {
        const found = findLiveProductData(item, sku);
        if (found) {
            return found;
        }
    }

    return undefined;
}

function findLiveGiftData(value: unknown, sku: string): MlblGiftOrderLiveGiftData | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findLiveGiftData(item, sku);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    if (normalizeSku(record.sku) === normalizeSku(sku)) {
        return {
            sku,
            tenSP: findFirstStringByKeys(record, nameKeys),
            nhanHang: findFirstStringByKeys(record, brandKeys),
            giaTriHangTang: findNumberByKeys(record, giftValueKeys),
        };
    }

    for (const item of Object.values(record)) {
        const found = findLiveGiftData(item, sku);
        if (found) {
            return found;
        }
    }

    return undefined;
}

function tryParseResponseBody(rawBody: string): unknown {
    const trimmedBody = rawBody.trim();
    if (!trimmedBody) {
        return undefined;
    }

    try {
        return JSON.parse(trimmedBody);
    } catch {
        return undefined;
    }
}

function findLiveProductPriceInText(rawBody: string, sku: string): MlblGiftOrderLiveProductPrice | undefined {
    const skuIndex = rawBody.toLowerCase().indexOf(sku.toLowerCase());
    if (skuIndex < 0) {
        return undefined;
    }

    const searchWindow = rawBody.slice(Math.max(0, skuIndex - 2000), skuIndex + 2000);
    const priceMatch = searchWindow.match(/["']?(?:giaSauKM|priceAfterPromotion|promotionPrice|salePrice|discountPrice|finalPrice|price|giaBan|gia)["']?\s*:\s*["']?([\d.,]+)/i);
    const giaSauKM = priceMatch ? parsePriceValue(priceMatch[1]) : undefined;
    return giaSauKM === undefined ? undefined : { sku, giaSauKM };
}

function parseDisplayMoney(value: string) {
    const numericText = value.replace(/[^\d]/g, '');
    if (!numericText) {
        return undefined;
    }

    const parsed = Number(numericText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function findTopOptionProductDataInText(rawText: string, sku: string): MlblGiftOrderLiveProductPrice | undefined {
    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const amountIndex = lines.findIndex(line => normalizeText(line).includes('tien hang mua phai dat'));
    if (amountIndex === -1) {
        return undefined;
    }

    const amount = parseDisplayMoney(lines[amountIndex]);
    const quantityLine = lines
        .slice(Math.max(0, amountIndex - 8), amountIndex + 1)
        .find(line => normalizeText(line).includes('so luong'));
    const quantityMatch = quantityLine?.match(/\b(\d+)\b/);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;
    if (!amount || !quantity || quantity <= 0) {
        return undefined;
    }

    const productName = lines
        .slice(Math.max(0, amountIndex - 8), amountIndex)
        .reverse()
        .find(line => {
            const normalized = normalizeText(line);
            return line.length >= 6
                && !/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:₫|đ|d|vnd)?/i.test(line)
                && !normalized.includes('so luong')
                && !normalized.includes('tong')
                && !normalized.includes('gt qua')
                && !normalized.includes('tot nhat')
                && !normalized.includes('don gian');
        });

    return {
        sku,
        tenSP: productName,
        nhanHang: productName?.split(/\s+/)[0],
        giaSauKM: amount / quantity,
    };
}

function findTopOptionGiftDataInText(rawText: string, sku: string): MlblGiftOrderLiveGiftData | undefined {
    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const valueIndex = lines.findIndex(line => normalizeText(line).includes('gia tri qua tang'));
    if (valueIndex === -1) {
        return undefined;
    }

    const value = parseDisplayMoney(lines.slice(valueIndex, valueIndex + 3).join(' '));
    if (!value) {
        return undefined;
    }

    const giftName = lines
        .slice(Math.max(0, valueIndex - 4), valueIndex)
        .reverse()
        .find(line => line.length >= 6 && !normalizeText(line).includes('qua tang'));

    return {
        sku,
        tenSP: giftName,
        nhanHang: giftName?.split(/\s+/)[0],
        giaTriHangTang: value,
    };
}

function parseMoneyText(value: string) {
    const numericText = value.replace(/[^\d]/g, '');
    if (!numericText) {
        return undefined;
    }

    const parsed = Number(numericText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseCurrencyText(value: string) {
    const moneyMatch = value.match(/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:₫|đ|d|vnd)/i);
    return moneyMatch ? parseMoneyText(moneyMatch[1]) : undefined;
}

async function captureLiveGiftDataFromDom(
    page: Page,
    sku: string,
    fallbackGiftName: string | undefined,
    fallbackBrand: string | undefined,
): Promise<MlblGiftOrderLiveGiftData | undefined> {
    if (!fallbackGiftName) {
        return undefined;
    }

    return page.evaluate(({ skuValue, giftName, brand }) => {
        const normalize = (value: unknown) => String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const parseMoney = (value: string) => {
            const numericText = value.replace(/[^\d]/g, '');
            const parsed = Number(numericText);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        };
        const findMoneyInText = (value: string) => {
            const lines = value
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean);
            const giftValueIndex = lines.findIndex(line => normalize(line).includes('gia tri qua tang'));
            if (giftValueIndex !== -1) {
                const giftValueWindow = lines.slice(giftValueIndex, giftValueIndex + 3).join(' ');
                const giftValueMatch = giftValueWindow.match(/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:₫|đ|d|vnd)/i);
                if (giftValueMatch) {
                    return parseMoney(giftValueMatch[1]);
                }
            }

            const moneyMatch = value.match(/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:₫|đ|d|vnd)/i);
            return moneyMatch ? parseMoney(moneyMatch[1]) : undefined;
        };
        const normalizedGiftName = normalize(giftName);
        const normalizedBrand = normalize(brand);
        const giftTokens = normalizedGiftName
            .split(/\s+/)
            .filter(token => token.length >= 3);
        const candidates = Array.from(document.querySelectorAll('img[alt]'))
            .map(img => ({
                alt: (img as HTMLImageElement).alt || '',
                element: img as HTMLElement,
            }))
            .map(candidate => {
                const normalizedAlt = normalize(candidate.alt);
                const score = giftTokens.filter(token => normalizedAlt.includes(token)).length;
                return {
                    ...candidate,
                    normalizedAlt,
                    score,
                };
            })
            .filter(candidate => {
                if (!candidate.normalizedAlt) {
                    return false;
                }

                if (normalizedBrand && !candidate.normalizedAlt.includes(normalizedBrand)) {
                    return false;
                }

                return candidate.normalizedAlt.includes(normalizedGiftName)
                    || normalizedGiftName.includes(candidate.normalizedAlt)
                    || candidate.score >= Math.min(5, giftTokens.length);
            })
            .sort((left, right) => right.score - left.score);

        for (const candidate of candidates) {
            let current: HTMLElement | null = candidate.element;
            for (let depth = 0; current && depth < 8; depth += 1) {
                const text = current.innerText || '';
                const normalizedText = normalize(text);
                const looksLikeSingleGiftCard = text.length > 0
                    && text.length < 6000
                    && (
                        normalizedText.includes(normalize(candidate.alt).slice(0, 24))
                        || normalizedText.includes('gia tri qua tang')
                        || normalizedText.includes('goi y mua hang')
                        || normalizedText.includes('chon phuong an')
                    );
                const giaTriHangTang = looksLikeSingleGiftCard ? findMoneyInText(text) : undefined;
                if (giaTriHangTang !== undefined) {
                    return {
                        sku: skuValue,
                        tenSP: candidate.alt,
                        nhanHang: brand,
                        giaTriHangTang,
                    };
                }

                current = current.parentElement;
            }
        }

        return undefined;
    }, {
        skuValue: sku,
        giftName: fallbackGiftName,
        brand: fallbackBrand,
    });
}

async function ensureLiveGiftCardTextLoaded(page: Page, fallbackGiftName: string | undefined) {
    if (!fallbackGiftName) {
        return;
    }

    const normalizedGiftName = normalizeText(fallbackGiftName);
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const bodyText = await page.locator('body').innerText({ timeout: MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS }).catch(() => '');
        if (normalizeText(bodyText).includes(normalizedGiftName)) {
            return;
        }

        const loadMoreButton = page.getByRole('button', { name: /Xem thêm/i }).first();
        const canLoadMore = await loadMoreButton.isVisible({ timeout: 1000 }).catch(() => false);
        if (!canLoadMore) {
            return;
        }

        await loadMoreButton.click();
        await page.waitForTimeout(700);
    }
}

async function selectTopGiftOptionAndCaptureLiveData(
    page: Page,
    config: ReturnType<typeof loadMlblGiftOrderConfig>,
): Promise<MlblGiftOrderLiveData | undefined> {
    return page.evaluate(({ productSku, giftSku, productQuantity }) => {
        const normalize = (value: unknown) => String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const parseMoney = (value: string) => {
            const numericText = value.replace(/[^\d]/g, '');
            const parsed = Number(numericText);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        };
        const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (element: Element) => (element as HTMLElement).innerText || element.textContent || '';
        const linesOf = (text: string) => text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
        const findMoneyNearLabel = (text: string, labels: string[]) => {
            const lines = linesOf(text);
            const labelIndex = lines.findIndex(line => labels.some(label => normalize(line).includes(label)));
            if (labelIndex === -1) {
                return undefined;
            }

            const windowText = lines.slice(labelIndex, labelIndex + 4).join(' ');
            const moneyMatch = windowText.match(/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:₫|đ|d|vnd)?/i);
            return moneyMatch ? parseMoney(moneyMatch[1]) : undefined;
        };
        const findQuantityNearLabel = (text: string) => {
            const lines = linesOf(text);
            const quantityIndex = lines.findIndex(line => normalize(line).includes('so luong'));
            if (quantityIndex === -1) {
                return undefined;
            }

            const quantityWindow = lines.slice(quantityIndex, quantityIndex + 3).join(' ');
            const quantityMatch = quantityWindow.match(/\b(\d+)\s*(?:thung|thùng|hop|hộp|chai|cai|cái|sp)?\b/i);
            if (!quantityMatch) {
                return undefined;
            }

            const parsed = Number(quantityMatch[1]);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        };
        const getAttributesText = (root: Element) => {
            const values: string[] = [];
            for (const element of Array.from(root.querySelectorAll('*'))) {
                for (const attribute of Array.from(element.attributes)) {
                    if (/sku|code|ma|id|data|alt|title|name/i.test(attribute.name) && attribute.value.trim()) {
                        values.push(attribute.value.trim());
                    }
                }
            }
            return values.join('\n');
        };
        const findGiftSku = (text: string) => {
            const match = text.match(/\bSPE[0-9A-Z]+\b/i);
            return match ? match[0].toUpperCase() : giftSku;
        };
        const findProductSku = (attributeText: string, text: string) => {
            const attributeMatch = attributeText.match(/\b\d{8,}\b/);
            if (attributeMatch) {
                return attributeMatch[0];
            }

            const textMatch = text.match(/\b\d{8,}\b/);
            return textMatch ? textMatch[0] : productSku;
        };
        const findBestName = (card: Element, text: string, blockedLabels: string[]) => {
            const imgAlt = Array.from(card.querySelectorAll('img[alt]'))
                .map(img => (img as HTMLImageElement).alt.trim())
                .find(Boolean);
            if (imgAlt) {
                return imgAlt;
            }

            return linesOf(text).find(line => {
                const normalized = normalize(line);
                return line.length >= 6
                    && !blockedLabels.some(label => normalized.includes(label))
                    && !/^\d+([\d.,\sđd₫vnd]*)?$/i.test(line);
            });
        };
        const deriveBrand = (name: string | undefined) => {
            if (!name) {
                return undefined;
            }

            const words = name.split(/\s+/).map(word => word.replace(/[^\p{L}\d]/gu, '')).filter(Boolean);
            return words.find(word => /^[A-Z0-9]{2,}$/.test(word)) || words[0];
        };
        const findAction = (card: Element) => Array.from(card.querySelectorAll('button,a,[role="button"]'))
            .find(element => normalize(textOf(element)).includes('chon phuong an')) as HTMLElement | undefined;
        const findCard = (element: Element) => {
            let current: Element | null = element;
            for (let depth = 0; current && depth < 10; depth += 1) {
                const text = textOf(current);
                const normalizedText = normalize(text);
                const actionCount = Array.from(current.querySelectorAll('button,a,[role="button"]'))
                    .filter(item => normalize(textOf(item)).includes('chon phuong an')).length;
                if (
                    text.length > 0
                    && text.length < 3000
                    && actionCount === 1
                    && (
                        normalizedText.includes('gia tri qua tang')
                        || normalizedText.includes('gt qua')
                        || normalizedText.includes('tien hang mua phai dat')
                    )
                ) {
                    return current;
                }

                current = current.parentElement;
            }

            return undefined;
        };

        const readCard = (card: Element) => {
            const action = findAction(card);
            if (!action) {
                return undefined;
            }

            const text = textOf(card);
            const attributeText = getAttributesText(card);
            const searchableText = `${attributeText}\n${text}`;
            const giftValue = findMoneyNearLabel(text, ['gia tri qua tang', 'gia tri hang tang']);
            const requiredAmount = findMoneyNearLabel(text, ['tien hang mua phai dat', 'hang mua phai dat']);
            const cardProductQuantity = findQuantityNearLabel(text) || productQuantity;
            const productPrice = requiredAmount && cardProductQuantity > 0 ? requiredAmount / cardProductQuantity : undefined;
            const giftName = findBestName(card, text, ['top', 'tot nhat', 'don gian', 'chon phuong an', 'gia tri qua tang', 'tien hang mua phai dat']);
            const productName = linesOf(text).find(line => {
                const normalized = normalize(line);
                return line.length >= 6
                    && !normalized.includes('top')
                    && !normalized.includes('tot nhat')
                    && !normalized.includes('don gian')
                    && !normalized.includes('chon phuong an')
                    && !normalized.includes('gia tri qua tang')
                    && !normalized.includes('tien hang mua phai dat')
                    && line !== giftName;
            });

            if (giftValue === undefined && productPrice === undefined) {
                return undefined;
            }

            action.click();

            const resolvedGiftSku = findGiftSku(searchableText);
            const resolvedProductSku = findProductSku(attributeText, text);
            return {
                product: productPrice === undefined ? undefined : {
                    sku: resolvedProductSku,
                    tenSP: productName,
                    nhanHang: deriveBrand(productName),
                    giaSauKM: productPrice,
                },
                gift: giftValue === undefined ? undefined : {
                    sku: resolvedGiftSku,
                    tenSP: giftName,
                    nhanHang: deriveBrand(giftName),
                    giaTriHangTang: giftValue,
                },
            };
        };

        const visibleElements = Array.from(document.querySelectorAll('body *')).filter(isVisible);
        const cards: Element[] = [];
        for (const topLabel of ['top1', 'top2', 'top3']) {
            for (const labelElement of visibleElements.filter(element => normalize(textOf(element)).includes(topLabel))) {
                const card = findCard(labelElement);
                if (card && !cards.includes(card)) {
                    cards.push(card);
                }
            }
        }

        for (const action of visibleElements.filter(element => normalize(textOf(element)).includes('chon phuong an')).slice(0, 3)) {
            const card = findCard(action);
            if (card && !cards.includes(card)) {
                cards.push(card);
            }
        }

        for (const card of cards) {
            const data = readCard(card);
            if (data) {
                return data;
            }
        }

        return undefined;
    }, {
        productSku: config.productSku,
        giftSku: config.giftSku,
        productQuantity: config.productQuantity,
    });
}

async function captureLiveProductPriceFromResponse(response: PageResponse, sku: string) {
    const contentType = response.headers()['content-type'] || '';
    if (!/json|javascript|text/i.test(contentType)) {
        return undefined;
    }

    const rawBody = await response.text().catch(() => '');
    if (!rawBody || !rawBody.includes(sku)) {
        return undefined;
    }

    const parsedBody = tryParseResponseBody(rawBody);
    return parsedBody ? findLiveProductData(parsedBody, sku) : findLiveProductPriceInText(rawBody, sku);
}

async function captureLiveDataFromPage(
    page: Page,
    config: ReturnType<typeof loadMlblGiftOrderConfig>,
    data: ReturnType<typeof loadMlblGiftOrderData>,
) {
    const fallbackProduct = data.combo?.product;
    let topOptionLiveData = await selectTopGiftOptionAndCaptureLiveData(page, config);
    if (!topOptionLiveData || !('product' in topOptionLiveData) || !topOptionLiveData.product) {
        await page.getByRole('button', { name: /Chọn phương án này|Chon phuong an nay/i })
            .first()
            .click({ timeout: 5000 })
            .catch(() => { });
        const rawText = await page.locator('body').innerText({ timeout: MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS }).catch(() => '');
        const textProduct = findTopOptionProductDataInText(rawText, config.productSku);
        const textGift = findTopOptionGiftDataInText(rawText, config.giftSku);
        topOptionLiveData = {
            product: textProduct,
            gift: textGift,
        };
    }
    const topProduct = topOptionLiveData && 'product' in topOptionLiveData ? topOptionLiveData.product : undefined;
    const topGift = topOptionLiveData && 'gift' in topOptionLiveData ? topOptionLiveData.gift : undefined;

    return {
        product: topProduct ? {
            tenSP: fallbackProduct?.tenSP,
            nhanHang: fallbackProduct?.nhanHang,
            ...topProduct,
        } : undefined,
        gift: topGift,
    };
}

function getRequiredLiveData(page: Page | undefined, sku: string, livePricingEnabled: boolean) {
    const liveData = page ? mlblGiftOrderLiveData.get(page) : undefined;
    if (!livePricingEnabled) {
        return liveData;
    }

    if (!liveData || !('product' in liveData) || !liveData.product) {
        throw new Error([
            `Could not resolve live giaSauKM for MLBL product SKU "${sku}".`,
            'Keep livePricing.enabled=false to use local fixture price, or make sure the product API response is loaded when opening the MLBL page.',
        ].join(' '));
    }

    return liveData;
}

async function exportMlblGiftOrderApiReport(
    testInfo: TestInfo,
    apiUrl: string,
    payload: MlblGiftOrderPayload,
    result: MlblGiftOrderApiResult,
) {
    const reportDir = path.resolve(process.cwd(), 'test-results', 'api-performance');
    const baseName = `${testInfo.project.name}-mlbl-gift-order-api-report`;
    const jsonPath = path.join(reportDir, `${baseName}.json`);
    const markdownPath = path.join(reportDir, `${baseName}.md`);
    const summary = summarizeResult(result);
    const report = {
        generatedAt: new Date().toISOString(),
        project: testInfo.project.name,
        mode: 'mlbl-gift-order',
        request: {
            method: 'POST',
            url: apiUrl,
            contentType: 'text/plain',
        },
        order: {
            orderCode: payload.orderData.orderCode,
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
    const data = loadMlblGiftOrderData();
    const livePricingEnabled = config.livePricing?.enabled !== false;
    const liveDataPromise = new Promise<MlblGiftOrderLiveData | undefined>(resolve => {
        if (!livePricingEnabled) {
            resolve(undefined);
            return;
        }

        let settled = false;
        const finish = (value: MlblGiftOrderLiveData | undefined) => {
            if (!settled) {
                settled = true;
                page.off('response', responseListener);
                resolve(value);
            }
        };
        const responseListener = (response: PageResponse) => {
            captureLiveProductPriceFromResponse(response, config.productSku)
                .then(found => {
                    if (found) {
                        finish({
                            product: found,
                            gift: undefined,
                        });
                    }
                })
                .catch(() => { });
        };

        page.on('response', responseListener);
        setTimeout(() => finish(undefined), MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS);
    });

    await page.goto(getProjectHomeUrl(testInfo));
    await waitForDomReady(page);
    await expect(page.locator('body'), 'SI home page should be reachable before API order creation').toBeVisible();
    await expect(
        page.getByRole('heading', { name: /Đang tải dữ liệu|Dang tai du lieu/i }),
        'SI home page should finish loading product data before resolving live MLBL price',
    ).toBeHidden({ timeout: MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS }).catch(() => { });

    const responseLiveData = await liveDataPromise;
    const pageLiveData = await captureLiveDataFromPage(page, config, data);
    const resolvedLiveData = {
        product: pageLiveData.product || (responseLiveData && 'product' in responseLiveData ? responseLiveData.product : undefined),
        gift: responseLiveData && 'gift' in responseLiveData ? responseLiveData.gift || pageLiveData.gift : pageLiveData.gift,
    };

    if (resolvedLiveData.product) {
        mlblGiftOrderLiveData.set(page, resolvedLiveData);
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

export async function createMlblGiftOrderByApi(
    api: APIRequestContext,
    testInfo: TestInfo,
    page?: Page,
): Promise<MlblGiftOrderApiResult> {
    const baseUrl = getProjectHomeUrl(testInfo);
    const data = loadMlblGiftOrderData();
    const config = loadMlblGiftOrderConfig();
    const apiUrl = resolveMlblGiftOrderApiUrl(baseUrl, data);
    const liveData = getRequiredLiveData(page, config.productSku, config.livePricing?.enabled !== false);
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
    const data = loadMlblGiftOrderData();
    const config = loadMlblGiftOrderConfig();
    const apiUrl = resolveMlblGiftOrderApiUrl(baseUrl, data);
    const liveData = getRequiredLiveData(page, config.productSku, config.livePricing?.enabled !== false);
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
        dataPath: path.join('test-data', 'json', 'mlbl-gift-order-si.json'),
    }, null, 2));
    await testInfo.attach('mlbl-gift-order-k6-template', {
        path: outputPath,
        contentType: 'application/json',
    });

    console.log(`Exported MLBL gift order API template for k6: ${outputPath}`);
    return outputPath;
}
