/// <reference types="node" />
import { APIRequestContext, APIResponse, expect, Page, TestInfo } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import {
    buildMlblGiftOrderPayload,
    loadMlblGiftOrderConfig,
    loadMlblGiftOrderData,
    MlblGiftOrderPayload,
    resolveMlblGiftOrderApiUrl,
} from '../components/helpers/mlbl-gift-order-payload';
import {
    captureMlblGiftOrderLiveDataFromPage,
    getRequiredMlblGiftOrderLiveData,
    MLBL_LIVE_PRICE_CAPTURE_TIMEOUT_MS,
    saveMlblGiftOrderLiveData,
    waitForMlblGiftOrderResponseLiveData,
} from '../components/helpers/mlbl-gift-order-live-data';
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
    const liveDataPromise = waitForMlblGiftOrderResponseLiveData(page, config.productSku, livePricingEnabled);

    await page.goto(getProjectHomeUrl(testInfo));
    await waitForDomReady(page);
    await expect(page.locator('body'), 'SI home page should be reachable before API order creation').toBeVisible();
    await expect(
        page.getByRole('heading', { name: /Đang tải dữ liệu|Dang tai du lieu/i }),
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

export async function createMlblGiftOrderByApi(
    api: APIRequestContext,
    testInfo: TestInfo,
    page?: Page,
): Promise<MlblGiftOrderApiResult> {
    const baseUrl = getProjectHomeUrl(testInfo);
    const data = loadMlblGiftOrderData();
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
    const data = loadMlblGiftOrderData();
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
        dataPath: path.join('test-data', 'json', 'mlbl-gift-order-si.json'),
    }, null, 2));
    await testInfo.attach('mlbl-gift-order-k6-template', {
        path: outputPath,
        contentType: 'application/json',
    });

    console.log(`Exported MLBL gift order API template for k6: ${outputPath}`);
    return outputPath;
}
