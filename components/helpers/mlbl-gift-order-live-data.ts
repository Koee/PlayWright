import { Page, Response as PageResponse } from '@playwright/test';
import {
    loadMlblGiftOrderConfig,
    loadMlblGiftOrderData,
    MlblGiftOrderLiveData,
    MlblGiftOrderLiveProductPrice,
    MlblGiftOrderLiveGiftData,
} from './mlbl-gift-order-payload';

const MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS = 20000;
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
const nameKeys = ['tenSP', 'name', 'productName', 'giftName', 'tenSanPham', 'title'];
const brandKeys = ['nhanHang', 'brand', 'brandName', 'thuongHieu'];

function normalizeSku(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeText(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .replace(/Ä‘/g, 'd')
        .replace(/Ä/g, 'D')
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
                && !/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:â‚«|Ä‘|d|vnd)?/i.test(line)
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

async function selectTopGiftOptionAndCaptureLiveData(
    page: Page,
    config: ReturnType<typeof loadMlblGiftOrderConfig>,
): Promise<MlblGiftOrderLiveData | undefined> {
    return page.evaluate(({ productSku, giftSku, productQuantity }) => {
        const normalize = (value: unknown) => String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'D')
            .replace(/Ä‘/g, 'd')
            .replace(/Ä/g, 'D')
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
            const moneyMatch = windowText.match(/((?:\d{1,3}\.)+\d{3}|\d{4,})\s*(?:â‚«|Ä‘|d|vnd)?/i);
            return moneyMatch ? parseMoney(moneyMatch[1]) : undefined;
        };
        const findQuantityNearLabel = (text: string) => {
            const lines = linesOf(text);
            const quantityIndex = lines.findIndex(line => normalize(line).includes('so luong'));
            if (quantityIndex === -1) {
                return undefined;
            }

            const quantityWindow = lines.slice(quantityIndex, quantityIndex + 3).join(' ');
            const quantityMatch = quantityWindow.match(/\b(\d+)\s*(?:thung|thÃ¹ng|hop|há»™p|chai|cai|cÃ¡i|sp)?\b/i);
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
                    && !/^\d+([\d.,\sÄ‘dâ‚«vnd]*)?$/i.test(line);
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

export function waitForMlblGiftOrderResponseLiveData(page: Page, sku: string, livePricingEnabled: boolean) {
    return new Promise<MlblGiftOrderLiveData | undefined>(resolve => {
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
            captureLiveProductPriceFromResponse(response, sku)
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
}

export async function captureMlblGiftOrderLiveDataFromPage(
    page: Page,
    config: ReturnType<typeof loadMlblGiftOrderConfig>,
    data: ReturnType<typeof loadMlblGiftOrderData>,
) {
    const fallbackProduct = data.combo?.product;
    let topOptionLiveData = await selectTopGiftOptionAndCaptureLiveData(page, config);
    if (!topOptionLiveData || !('product' in topOptionLiveData) || !topOptionLiveData.product) {
        await page.locator('button')
            .filter({ hasText: /Qu\u00e0 T\u1eb7ng|Qua Tang/i })
            .first()
            .click({ timeout: 5000 })
            .catch(() => { });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        topOptionLiveData = await selectTopGiftOptionAndCaptureLiveData(page, config);
    }
    if (!topOptionLiveData || !('product' in topOptionLiveData) || !topOptionLiveData.product) {
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

export function saveMlblGiftOrderLiveData(page: Page, liveData: MlblGiftOrderLiveData) {
    mlblGiftOrderLiveData.set(page, liveData);
}

export function getRequiredMlblGiftOrderLiveData(page: Page | undefined, sku: string, livePricingEnabled: boolean) {
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

export { MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS };
