/// <reference types="node" />
import { APIRequestContext, APIResponse, expect, Page, Request, Response as PageResponse, TestInfo } from '@playwright/test';
import { randomInt } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import * as dialogHandler from '../components/helpers/dialog-handler';
import { waitForDomReady } from '../components/helpers/element-actions';
import { CheckoutPage, CheckoutCustomer } from '../components/pages/CheckoutPage';
import {
    API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS,
    API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES,
    ORDER_RESULT_TIMEOUT_MS,
} from '../config/test.config';

export type CapturedCheckoutOrderRequest = {
    projectName: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    postData: string;
    contentType: string;
    detectionCustomer: CheckoutCustomer;
    auth?: CheckoutApiAuthHeader;
};

export type ApiOrderResult = {
    orderNo: number;
    ok: boolean;
    httpOk?: boolean;
    status?: number;
    statusText?: string;
    durationMs?: number;
    responseBody?: string;
    createdEvidence?: string;
    validationError?: string;
    error?: string;
};

export type CheckoutApiAuthHeader = {
    headerName: string;
    token: string;
    value: string;
};

export type CheckoutApiAuthMode = 'guest' | 'login' | 'auto';

export type CheckoutApiPerformanceMode = 'guest' | 'login';

type CheckoutApiDetectionCandidate = {
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    contentType?: string;
    postDataPreview?: string;
    responseBodyPreview?: string;
    rejectedReason?: string;
};

const replayBlockedHeaders = new Set([
    'accept-encoding',
    'connection',
    'content-length',
    'cookie',
    'host',
    'origin',
]);
const exportedTemplateBlockedHeaderPatterns = [
    /^authorization$/i,
    /^proxy-authorization$/i,
    /^cookie$/i,
    /^set-cookie$/i,
    /^sec-/i,
    /^user-agent$/i,
    /^referer$/i,
];

const MAX_RESPONSE_BODY_LENGTH = 1200;
const MAX_DETECTION_CANDIDATES = 30;
const ORDER_CODE_SUFFIX_LENGTH = 6;
const ORDER_CODE_SUFFIX_BASE = 36 ** ORDER_CODE_SUFFIX_LENGTH;
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

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeFilePart(value: string) {
    return value.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'checkout-api';
}

/**
 * Tao customer rieng cho API performance, khong phu thuoc Date.now de tranh trung data.
 */
function buildApiPerformanceCustomer(orderNo: number): CheckoutCustomer & { address: string } {
    const phoneSequence = String(orderNo).padStart(6, '0');
    const randomPart = String(randomInt(0, 10)).padStart(1, '0');
    const namePrefix = process.env.CHECKOUT_API_CUSTOMER_NAME_PREFIX || 'Performance Test Customer';
    const phonePrefix = (process.env.CHECKOUT_API_CUSTOMER_PHONE_PREFIX || '099').replace(/\D/g, '').slice(0, 9) || '099';
    const address = process.env.CHECKOUT_API_CUSTOMER_ADDRESS || 'Performance Test Address';

    return {
        name: `${namePrefix} ${orderNo}`,
        phone: `${phonePrefix}${randomPart}${phoneSequence}`.slice(0, 10),
        address,
    };
}

function buildApiPerformanceOrderCode(originalOrderCode: string | undefined, orderNo: number) {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const datePart = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const seed = (orderNo * 1009 + randomInt(0, ORDER_CODE_SUFFIX_BASE)) % ORDER_CODE_SUFFIX_BASE;
    let suffix = seed.toString(36).toUpperCase().padStart(ORDER_CODE_SUFFIX_LENGTH, '0').slice(-ORDER_CODE_SUFFIX_LENGTH);
    if (/^\d+$/.test(suffix)) {
        suffix = `${String.fromCharCode(65 + (seed % 26))}${suffix.slice(1)}`;
    }
    const basePrefix = originalOrderCode?.match(/^(.+)-\d{6}-\d{6}-[A-Z0-9]+$/i)?.[1];

    return `${basePrefix || 'ONLINE-API-PERF'}-${datePart}-${timePart}-${suffix}`;
}

function sanitizeReplayHeaders(headers: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(headers).filter(([key]) => !replayBlockedHeaders.has(key.toLowerCase()))
    );
}

function sanitizeExportedTemplateHeaders(
    headers: Record<string, string>,
    auth: CheckoutApiAuthHeader | undefined,
) {
    return Object.fromEntries(
        Object.entries(headers).filter(([key]) => {
            if (auth && key.toLowerCase() === auth.headerName.toLowerCase()) {
                return false;
            }

            return !exportedTemplateBlockedHeaderPatterns.some(pattern => pattern.test(key));
        })
    );
}

function buildExportedAuthMetadata(auth: CheckoutApiAuthHeader | undefined) {
    if (!auth) {
        return undefined;
    }

    return {
        headerName: auth.headerName,
        tokenEnvName: 'K6_AUTH_TOKEN',
        tokenPrefixEnvName: 'K6_AUTH_TOKEN_PREFIX',
    };
}

function isLikelyCheckoutOrderRequest(request: Request, customer: CheckoutCustomer) {
    return !getCheckoutRequestRejectedReason(request, customer);
}

function isQrOrPaymentOnlyRequest(postData: string) {
    const parsedBody = tryParseJson(postData);
    if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
        const action = String((parsedBody as Record<string, unknown>).action ?? '');
        return /createQRCode|qrCode/i.test(action);
    }

    return /createQRCode|qrCode/i.test(postData);
}

function isCustomerUpdateOnlyRequest(postData: string) {
    const parsedBody = tryParseJson(postData);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return /updateOrderCustomer/i.test(postData);
    }

    const action = String((parsedBody as Record<string, unknown>).action ?? '');
    return /updateOrderCustomer/i.test(action);
}

function isNonReplayableCheckoutRequest(postData: string) {
    return isQrOrPaymentOnlyRequest(postData) || isCustomerUpdateOnlyRequest(postData);
}

function getCheckoutRequestRejectedReason(request: Request, customer: CheckoutCustomer) {
    const method = request.method().toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
        return `Ignored method ${method}`;
    }

    const postData = request.postData() || '';
    if (!postData) {
        return 'Missing postData';
    }

    if (isQrOrPaymentOnlyRequest(postData)) {
        return 'QR/payment-only request';
    }

    if (isCustomerUpdateOnlyRequest(postData)) {
        return 'updateOrderCustomer updates an existing orderCode only';
    }

    const haystack = `${request.url()}\n${postData}`.toLowerCase();
    const likelyCheckout = haystack.includes(customer.phone.toLowerCase())
        || haystack.includes(customer.name.toLowerCase())
        || /order|checkout|invoice|dat-hang|don-hang/.test(haystack);
    if (!likelyCheckout) {
        return 'Does not look like checkout/order request';
    }

    return undefined;
}

function isProductLikeKey(key: string) {
    return /product|item|goods|sku|variant|combo|package|cart|san.?pham|ten.?sp|ma.?sp|hang.?hoa/i.test(key);
}

function isCustomerPhoneKey(key: string, pathKey = key) {
    return /phone|mobile|tel|sdt|dien.?thoai/i.test(key) && !isProductLikeKey(pathKey);
}

function isCustomerNameKey(key: string, pathKey = key) {
    return /customer.?name|recipient.?name|receiver.?name|buyer.?name|full.?name|user.?name|contact.?name|ten.?khach|ten.?nguoi.?dat|ten.?nguoi.?nhan|ho.?ten|name$/i.test(key)
        && !isProductLikeKey(pathKey);
}

function isCustomerAddressKey(key: string, pathKey = key) {
    return /address|dia.?chi/i.test(key) && !isProductLikeKey(pathKey);
}

function replaceCustomerValues(
    value: unknown,
    detectionCustomer: CheckoutCustomer,
    customer: CheckoutCustomer & { address: string },
    pathKey = '',
): unknown {
    if (Array.isArray(value)) {
        return value.map(item => replaceCustomerValues(item, detectionCustomer, customer, pathKey));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                const normalizedKey = key.toLowerCase();
                const currentPath = pathKey ? `${pathKey}.${normalizedKey}` : normalizedKey;
                if (isCustomerPhoneKey(normalizedKey, currentPath)) {
                    return [key, customer.phone];
                }
                if (isCustomerNameKey(normalizedKey, currentPath)) {
                    return [key, customer.name];
                }
                if (isCustomerAddressKey(normalizedKey, currentPath)) {
                    return [key, customer.address];
                }
                return [key, replaceCustomerValues(item, detectionCustomer, customer, currentPath)];
            })
        );
    }

    if (typeof value === 'string') {
        return value
            .replaceAll(detectionCustomer.name, customer.name)
            .replaceAll(detectionCustomer.phone, customer.phone);
    }

    return value;
}

function buildReplayBody(captured: CapturedCheckoutOrderRequest, customer: CheckoutCustomer & { address: string }) {
    const postData = captured.postData;
    const originalOrderCode = findFirstOrderCode(postData);
    const replayOrderCode = buildApiPerformanceOrderCode(originalOrderCode, Number(customer.phone.slice(-6)) || 0);

    if (looksLikeJsonBody(postData, captured.contentType)) {
        const parsed = JSON.parse(postData);
        return enableOrderDetailsWhenProductsExist(
            replaceOrderCodeValues(
                replaceCustomerValues(parsed, captured.detectionCustomer, customer),
                originalOrderCode,
                replayOrderCode,
            )
        );
    }

    if (captured.contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(postData);
        for (const key of Array.from(params.keys())) {
            const normalizedKey = key.toLowerCase();
            if (isCustomerPhoneKey(normalizedKey)) {
                params.set(key, customer.phone);
            } else if (isCustomerNameKey(normalizedKey)) {
                params.set(key, customer.name);
            } else if (isCustomerAddressKey(normalizedKey)) {
                params.set(key, customer.address);
            }
        }
        return originalOrderCode
            ? params.toString().replaceAll(originalOrderCode, replayOrderCode)
            : params.toString();
    }

    const replayBody = postData
        .replaceAll(captured.detectionCustomer.name, customer.name)
        .replaceAll(captured.detectionCustomer.phone, customer.phone);
    return originalOrderCode ? replayBody.replaceAll(originalOrderCode, replayOrderCode) : replayBody;
}

function parseLoginBody(rawBody: string) {
    if (!rawBody.trim()) {
        return undefined;
    }

    try {
        return JSON.parse(rawBody);
    } catch {
        return rawBody;
    }
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

function findValueByKnownKeys(value: unknown, keys: string[]): { key: string; value: unknown } | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findValueByKnownKeys(item, keys);
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
        if (keys.includes(key) && item !== undefined && item !== null && String(item).trim() !== '') {
            return { key, value: item };
        }

        const found = findValueByKnownKeys(item, keys);
        if (found) {
            return found;
        }
    }

    return undefined;
}

function findFirstOrderCode(rawBody: string) {
    const parsedBody = tryParseJson(rawBody);
    const knownIdentifier = findValueByKnownKeys(parsedBody, knownOrderIdentifierKeys);
    if (knownIdentifier) {
        return String(knownIdentifier.value);
    }

    return rawBody.match(/ONLINE-[A-Z0-9-]+/i)?.[0];
}

function replaceOrderCodeValues(value: unknown, originalOrderCode: string | undefined, replayOrderCode: string): unknown {
    if (!originalOrderCode) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => replaceOrderCodeValues(item, originalOrderCode, replayOrderCode));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                replaceOrderCodeValues(item, originalOrderCode, replayOrderCode),
            ])
        );
    }

    if (typeof value === 'string') {
        return value.replaceAll(originalOrderCode, replayOrderCode);
    }

    return value;
}

function looksLikeJsonBody(postData: string, contentType: string) {
    const trimmedPostData = postData.trim();
    return contentType.includes('application/json')
        || trimmedPostData.startsWith('{')
        || trimmedPostData.startsWith('[');
}

function enableOrderDetailsWhenProductsExist(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => enableOrderDetailsWhenProductsExist(item));
    }

    if (value && typeof value === 'object') {
        const output = Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                enableOrderDetailsWhenProductsExist(item),
            ])
        );

        if (
            Array.isArray(output.products)
            && output.products.length > 0
            && Object.prototype.hasOwnProperty.call(output, 'skipDetail')
        ) {
            output.skipDetail = false;
        }

        return output;
    }

    return value;
}

function normalizeCheckoutOrderPostDataForReplay(postData: string, contentType: string) {
    if (!looksLikeJsonBody(postData, contentType)) {
        return postData;
    }

    try {
        return JSON.stringify(enableOrderDetailsWhenProductsExist(JSON.parse(postData)));
    } catch {
        return postData;
    }
}

function normalizeStatus(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function validateCheckoutOrderCreated(response: APIResponse, responseBody: string) {
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

    const requiredOrderIdPath = process.env.CHECKOUT_API_ORDER_ID_PATH?.trim();
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

    const successValue = readJsonPath(parsedBody, process.env.CHECKOUT_API_SUCCESS_PATH || 'success');
    if (successValue === false || normalizeStatus(successValue) === 'false') {
        return {
            ok: false,
            validationError: 'HTTP 2xx but response success field is false.',
        };
    }

    const statusValue = readJsonPath(parsedBody, process.env.CHECKOUT_API_STATUS_PATH || 'status');
    if (['failed', 'fail', 'error', 'invalid'].includes(normalizeStatus(statusValue))) {
        return {
            ok: false,
            validationError: `HTTP 2xx but response status field is "${String(statusValue)}".`,
        };
    }

    const knownIdentifier = findValueByKnownKeys(parsedBody, knownOrderIdentifierKeys);
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
            'Set CHECKOUT_API_ORDER_ID_PATH to the response field that proves the order exists.',
        ].join(' '),
    };
}

function getCreatedEvidenceCounts(results: ApiOrderResult[]) {
    return results
        .filter(result => result.ok)
        .reduce<Record<string, number>>((summary, result) => {
            const key = result.createdEvidence || 'missing-created-evidence';
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, {});
}

function getDuplicateCreatedEvidence(results: ApiOrderResult[]) {
    return Object.fromEntries(
        Object.entries(getCreatedEvidenceCounts(results)).filter(([, count]) => count > 1)
    );
}

async function loginCheckoutApi(api: APIRequestContext, required: boolean): Promise<CheckoutApiAuthHeader | undefined> {
    const loginUrl = process.env.CHECKOUT_API_LOGIN_URL?.trim();
    if (!loginUrl) {
        if (required) {
            throw new Error('CHECKOUT_API_LOGIN_URL is required for login checkout API flow.');
        }

        console.log('CHECKOUT_API_LOGIN_URL is not set. Skipping API login/token step.');
        return undefined;
    }

    const method = process.env.CHECKOUT_API_LOGIN_METHOD || 'POST';
    const tokenPath = process.env.CHECKOUT_API_TOKEN_PATH || 'token';
    const headerName = process.env.CHECKOUT_API_AUTH_HEADER_NAME || 'Authorization';
    const tokenPrefix = process.env.CHECKOUT_API_TOKEN_PREFIX ?? 'Bearer';
    const response = await api.fetch(loginUrl, {
        method,
        data: parseLoginBody(process.env.CHECKOUT_API_LOGIN_BODY || ''),
    });

    if (!response.ok()) {
        throw new Error(`Checkout API login failed: ${response.status()} ${response.statusText()}`);
    }

    const body = await response.json().catch(async () => ({ token: await response.text() }));
    const tokenValue = readJsonPath(body, tokenPath);
    if (!tokenValue) {
        throw new Error(`Checkout API login succeeded but token path "${tokenPath}" was not found.`);
    }

    const token = String(tokenValue);
    const value = tokenPrefix ? `${tokenPrefix} ${token}` : token;
    console.log(`Checkout API login succeeded. Token exported as ${headerName}.`);

    return { headerName, token, value };
}

/**
 * B1: Chon che do auth cho checkout API.
 * guest: bo qua login, dung cho website mua truc tiep.
 * login: bat buoc login/lay token, dung cho website can tai khoan.
 * auto: co CHECKOUT_API_LOGIN_URL thi login, khong co thi chay guest.
 */
export async function resolveCheckoutApiAuth(
    api: APIRequestContext,
    mode: CheckoutApiAuthMode = 'auto',
): Promise<CheckoutApiAuthHeader | undefined> {
    if (mode === 'guest') {
        console.log('Checkout API auth mode is guest. Skipping API login/token step.');
        return undefined;
    }

    return loginCheckoutApi(api, mode === 'login');
}

/**
 * Giu lai ham cu cho cac flow dang dung auto-login.
 */
export async function loginCheckoutApiIfConfigured(api: APIRequestContext): Promise<CheckoutApiAuthHeader | undefined> {
    return resolveCheckoutApiAuth(api, 'auto');
}

export function applyCheckoutApiAuthHeader(
    captured: CapturedCheckoutOrderRequest,
    auth: CheckoutApiAuthHeader | undefined,
): CapturedCheckoutOrderRequest {
    if (!auth) {
        return captured;
    }

    return {
        ...captured,
        headers: {
            ...captured.headers,
            [auth.headerName]: auth.value,
        },
        auth,
    };
}

function collectCheckoutApiDetectionCandidate(
    candidates: CheckoutApiDetectionCandidate[],
    response: PageResponse,
    customer: CheckoutCustomer,
) {
    if (candidates.length >= MAX_DETECTION_CANDIDATES) {
        return;
    }

    const request = response.request();
    const method = request.method().toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
        return;
    }

    const postData = request.postData() || '';
    if (!postData) {
        return;
    }

    const rejectedReason = getCheckoutRequestRejectedReason(request, customer);
    if (
        rejectedReason === 'Does not look like checkout/order request'
        && !/api|order|checkout|invoice|payment|qr|customer/i.test(`${request.url()}\n${postData}`)
    ) {
        return;
    }

    const headers = request.headers();
    candidates.push({
        url: request.url(),
        method,
        status: response.status(),
        statusText: response.statusText(),
        contentType: headers['content-type'] || headers['Content-Type'],
        postDataPreview: postData.slice(0, MAX_RESPONSE_BODY_LENGTH),
        rejectedReason,
    });
}

async function exportCheckoutApiDetectionFailureReport(
    page: Page,
    testInfo: TestInfo,
    mode: CheckoutApiPerformanceMode,
    candidates: CheckoutApiDetectionCandidate[],
    reason: string,
) {
    const timestamp = Date.now();
    const baseName = `${safeFilePart(testInfo.project.name)}-${mode}-checkout-api-detection-failure-${timestamp}`;
    const screenshotPath = path.resolve(process.cwd(), 'test-results', 'report', 'err', `${baseName}.png`);
    const reportDir = path.resolve(process.cwd(), 'test-results', 'report', 'api-performance');
    const jsonPath = path.join(reportDir, `${baseName}.json`);
    const markdownPath = path.join(reportDir, `${baseName}.md`);

    if (!page.isClosed()) {
        await dialogHandler.captureFocusedFailureState(page, screenshotPath, [
            page.getByRole('dialog'),
            page.locator('[role="dialog"]'),
            page.locator('main'),
            page.locator('body'),
        ]).catch(() => { });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        project: testInfo.project.name,
        mode,
        reason,
        screenshotPath,
        candidateCount: candidates.length,
        candidates,
    };
    const markdown = [
        `# Checkout API Detection Failure`,
        ``,
        `- Project: ${testInfo.project.name}`,
        `- Mode: ${mode}`,
        `- Reason: ${reason}`,
        `- Screenshot: ${screenshotPath}`,
        `- Candidate requests captured: ${candidates.length}`,
        ``,
        `## Candidate Requests`,
        ``,
        ...candidates.map((candidate, index) => [
            `### ${index + 1}. ${candidate.method} ${candidate.url}`,
            ``,
            `- Status: ${candidate.status ?? 'ERR'} ${candidate.statusText || ''}`,
            `- Content type: ${candidate.contentType || ''}`,
            `- Rejected reason: ${candidate.rejectedReason || 'Accepted by filter'}`,
            candidate.postDataPreview ? `- Post data: ${candidate.postDataPreview}` : '',
            ``,
        ].filter(Boolean).join('\n')),
        candidates.length === 0 ? `No POST/PUT/PATCH API-like responses were captured during checkout detection.\n` : '',
    ].join('\n');

    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(markdownPath, markdown);

    await testInfo.attach('checkout-api-detection-failure-json', {
        path: jsonPath,
        contentType: 'application/json',
    });
    await testInfo.attach('checkout-api-detection-failure-md', {
        path: markdownPath,
        contentType: 'text/markdown',
    });
    await testInfo.attach('checkout-api-detection-failure-screenshot', {
        path: screenshotPath,
        contentType: 'image/png',
    }).catch(() => { });

    console.log(`Checkout API detection failure JSON report: ${jsonPath}`);
    console.log(`Checkout API detection failure Markdown report: ${markdownPath}`);
    console.log(`Checkout API detection failure screenshot: ${screenshotPath}`);

    return { jsonPath, markdownPath, screenshotPath };
}

/**
 * Chay UI mot lan de detect request API dat hang that cua website hien tai.
 */
export async function detectCheckoutOrderApiRequest(
    page: Page,
    testInfo: TestInfo,
    mode: CheckoutApiPerformanceMode = 'guest',
): Promise<CapturedCheckoutOrderRequest> {
    const websiteName = testInfo.project.name;
    const detectionCustomer = buildApiPerformanceCustomer(0);
    const dialogTracker = dialogHandler.setupDialogTracker(page, `${websiteName}-api-detect`);
    const checkoutPage = new CheckoutPage(page, dialogTracker);
    const detectionCandidates: CheckoutApiDetectionCandidate[] = [];
    const responseListener = (response: PageResponse) => {
        collectCheckoutApiDetectionCandidate(detectionCandidates, response, detectionCustomer);
    };

    await page.addInitScript(() => {
        window.print = () => {
            console.log('Print called, preventing default behavior');
            window.dispatchEvent(new CustomEvent('printRequested'));
        };
    });
    page.on('response', responseListener);

    await page.goto(getProjectHomeUrl(testInfo));
    await waitForDomReady(page);
    await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'api-detect-page-load');

    await checkoutPage.selectTab(websiteName);
    await checkoutPage.clickAddProductButton();
    await checkoutPage.proceedToCheckout();
    const orderResponsePromise = page.waitForResponse(
        response => response.ok() && isLikelyCheckoutOrderRequest(response.request(), detectionCustomer),
        { timeout: ORDER_RESULT_TIMEOUT_MS }
    ).catch(() => null);

    await checkoutPage.confirmPayment();
    await checkoutPage.fillCustomerInfo(detectionCustomer);
    await checkoutPage.completeOrder();
    const response = await orderResponsePromise;
    if (!response) {
        page.off('response', responseListener);
        const reason = 'Could not detect checkout order API request from UI flow. Check network request filter or order flow.';
        const { screenshotPath, markdownPath } = await exportCheckoutApiDetectionFailureReport(
            page,
            testInfo,
            mode,
            detectionCandidates,
            reason,
        );
        throw new Error(`${reason} Screenshot: ${screenshotPath}. Detection report: ${markdownPath}`);
    }
    page.off('response', responseListener);

    const request = response.request();
    const headers = sanitizeReplayHeaders(request.headers());
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const postData = request.postData();

    if (!postData) {
        throw new Error(`Detected order API has no postData and cannot be replayed: ${request.url()}`);
    }

    console.log(`Detected checkout order API: ${request.method()} ${request.url()}`);

    return {
        projectName: websiteName,
        url: request.url(),
        method: request.method(),
        headers,
        postData,
        contentType,
        detectionCustomer,
    };
}

async function submitDetectedCheckoutOrder(
    api: APIRequestContext,
    captured: CapturedCheckoutOrderRequest,
    orderNo: number,
): Promise<ApiOrderResult> {
    const customer = buildApiPerformanceCustomer(orderNo);
    const startedAt = Date.now();

    try {
        const response: APIResponse = await api.fetch(captured.url, {
            method: captured.method,
            headers: captured.headers,
            data: buildReplayBody(captured, customer),
        });
        const responseText = await response.text().catch(error => `Could not read response body: ${String(error)}`);
        const validation = validateCheckoutOrderCreated(response, responseText);

        return {
            orderNo,
            ok: validation.ok,
            httpOk: response.ok(),
            status: response.status(),
            statusText: response.statusText(),
            durationMs: Date.now() - startedAt,
            responseBody: responseText.slice(0, MAX_RESPONSE_BODY_LENGTH),
            createdEvidence: validation.createdEvidence,
            validationError: validation.validationError,
        };
    } catch (error) {
        return {
            orderNo,
            ok: false,
            httpOk: false,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Tao nhieu don bang API theo batch de tranh mo nhieu UI gay ton RAM.
 */
export async function createCheckoutOrdersByDetectedApiBatch(
    api: APIRequestContext,
    captured: CapturedCheckoutOrderRequest,
    totalOrders: number,
    batchSize: number,
) {
    const results: ApiOrderResult[] = [];
    let consecutiveFailures = 0;

    for (let start = 1; start <= totalOrders; start += batchSize) {
        const currentBatchSize = Math.min(batchSize, totalOrders - start + 1);
        const batch = Array.from({ length: currentBatchSize }, (_, index) => {
            const orderNo = start + index;
            return submitDetectedCheckoutOrder(api, captured, orderNo);
        });

        const batchResults = await Promise.all(batch);
        results.push(...batchResults);

        const batchSuccessCount = batchResults.filter(result => result.ok).length;
        const batchFailureCount = batchResults.length - batchSuccessCount;
        console.log(
            `API checkout batch ${start}-${start + currentBatchSize - 1}: `
            + `${batchSuccessCount}/${batchResults.length} succeeded, ${batchFailureCount} failed.`
        );

        for (const result of batchResults) {
            consecutiveFailures = result.ok ? 0 : consecutiveFailures + 1;
        }

        if (consecutiveFailures >= API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES) {
            console.log(
                `Stopping API checkout replay after ${consecutiveFailures} consecutive failures. `
                + 'This usually means the target API is rate-limiting, rejecting repeated payloads, or returning backend 5xx.'
            );
            break;
        }

        if (start + currentBatchSize <= totalOrders && API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS > 0) {
            await sleep(API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS);
        }
    }

    return results;
}

export function assertAllApiOrdersCreated(results: ApiOrderResult[], totalOrders: number) {
    const failures = results.filter(result => !result.ok);
    const successCount = results.length - failures.length;
    const duplicateCreatedEvidence = getDuplicateCreatedEvidence(results);
    console.log(`Created orders by API: ${successCount}/${totalOrders}`);
    console.log(`Attempted orders by API: ${results.length}/${totalOrders}`);

    if (failures.length > 0) {
        const failureStatusSummary = Object.entries(
            failures.reduce<Record<string, number>>((summary, result) => {
                const key = result.status ? String(result.status) : 'ERR';
                summary[key] = (summary[key] || 0) + 1;
                return summary;
            }, {})
        ).map(([status, count]) => `${status}: ${count}`);
        const failureSummary = failures
            .slice(0, 10)
            .map(result => [
                `order ${result.orderNo}: ${result.status || 'ERR'} ${result.statusText || result.error || ''}`,
                result.validationError ? `validation: ${result.validationError}` : undefined,
                result.responseBody ? `body: ${result.responseBody}` : undefined,
            ].filter(Boolean).join('\n'));
        throw new Error([
            `${failures.length}/${totalOrders} API checkout orders failed.`,
            `Attempted orders: ${results.length}/${totalOrders}.`,
            `Failure status summary: ${failureStatusSummary.join(', ')}`,
            ...failureSummary,
        ].join('\n'));
    }

    if (Object.keys(duplicateCreatedEvidence).length > 0) {
        throw new Error([
            'API checkout replay returned duplicate order-created evidence.',
            'This usually means the detected API updated the same existing order instead of creating new orders.',
            `Duplicate created evidence: ${JSON.stringify(duplicateCreatedEvidence)}`,
        ].join('\n'));
    }

    expect(successCount).toBe(totalOrders);
}

function summarizeApiOrderResults(results: ApiOrderResult[], totalOrders: number) {
    const failures = results.filter(result => !result.ok);
    const successCount = results.length - failures.length;
    const httpSuccessCount = results.filter(result => result.httpOk).length;
    const evidenceCounts = getCreatedEvidenceCounts(results);
    const duplicateCreatedEvidence = getDuplicateCreatedEvidence(results);
    const durations = results
        .map(result => result.durationMs)
        .filter((duration): duration is number => typeof duration === 'number')
        .sort((left, right) => left - right);
    const percentile = (value: number) => {
        if (durations.length === 0) {
            return undefined;
        }

        const index = Math.min(durations.length - 1, Math.ceil((value / 100) * durations.length) - 1);
        return durations[index];
    };

    return {
        totalOrders,
        attemptedOrders: results.length,
        successCount,
        uniqueCreatedEvidenceCount: Object.keys(evidenceCounts).length,
        duplicateCreatedEvidence,
        httpSuccessCount,
        failureCount: failures.length,
        pass: failures.length === 0 && results.length === totalOrders,
        statusSummary: results.reduce<Record<string, number>>((summary, result) => {
            const key = result.status ? String(result.status) : 'ERR';
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, {}),
        durationMs: {
            min: durations[0],
            p50: percentile(50),
            p95: percentile(95),
            max: durations[durations.length - 1],
        },
    };
}

/**
 * Ghi report API performance ra test-results/report de tester doc lai sau khi run.
 * JSON dung de debug chi tiet, Markdown dung de doc nhanh.
 */
export async function exportCheckoutApiPerformanceReport(
    testInfo: TestInfo,
    mode: CheckoutApiPerformanceMode,
    captured: CapturedCheckoutOrderRequest,
    results: ApiOrderResult[],
    totalOrders: number,
    batchSize: number,
) {
    const reportDir = path.resolve(process.cwd(), 'test-results', 'report', 'api-performance');
    const baseName = `${testInfo.project.name}-${mode}-checkout-api-performance-report`;
    const jsonPath = path.join(reportDir, `${baseName}.json`);
    const markdownPath = path.join(reportDir, `${baseName}.md`);
    const summary = summarizeApiOrderResults(results, totalOrders);
    const successes = results.filter(result => result.ok);
    const failures = results.filter(result => !result.ok);
    const report = {
        generatedAt: new Date().toISOString(),
        project: testInfo.project.name,
        mode,
        request: {
            method: captured.method,
            url: captured.url,
            contentType: captured.contentType,
            hasAuth: Boolean(captured.auth),
        },
        config: {
            totalOrders,
            batchSize,
            batchDelayMs: API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS,
            maxConsecutiveFailures: API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES,
            orderIdPath: process.env.CHECKOUT_API_ORDER_ID_PATH || null,
            successPath: process.env.CHECKOUT_API_SUCCESS_PATH || 'success',
            statusPath: process.env.CHECKOUT_API_STATUS_PATH || 'status',
        },
        summary,
        successes: successes.slice(0, 50),
        failures: failures.slice(0, 50),
        results,
    };
    const markdown = [
        `# Checkout API Performance Report`,
        ``,
        `- Project: ${testInfo.project.name}`,
        `- Mode: ${mode}`,
        `- Endpoint: ${captured.method} ${captured.url}`,
        `- Total orders: ${totalOrders}`,
        `- Attempted orders: ${summary.attemptedOrders}`,
        `- HTTP 2xx: ${summary.httpSuccessCount}`,
        `- Verified created: ${summary.successCount}`,
        `- Unique created evidence: ${summary.uniqueCreatedEvidenceCount}`,
        `- Duplicate created evidence: ${JSON.stringify(summary.duplicateCreatedEvidence)}`,
        `- Failed: ${summary.failureCount}`,
        `- Pass: ${summary.pass}`,
        `- Status summary: ${JSON.stringify(summary.statusSummary)}`,
        `- Duration ms: ${JSON.stringify(summary.durationMs)}`,
        ``,
        `## First Successes`,
        ``,
        ...successes.slice(0, 20).map(result => [
            `### Order ${result.orderNo}`,
            ``,
            `- Status: ${result.status || 'ERR'} ${result.statusText || result.error || ''}`,
            `- Duration ms: ${result.durationMs ?? ''}`,
            result.createdEvidence ? `- Evidence: ${result.createdEvidence}` : '',
            result.responseBody ? `- Body: ${result.responseBody}` : '',
            ``,
        ].filter(Boolean).join('\n')),
        successes.length === 0 ? `No successful API-created orders were verified.\n` : '',
        ``,
        `## First Failures`,
        ``,
        ...failures.slice(0, 20).map(result => [
            `### Order ${result.orderNo}`,
            ``,
            `- Status: ${result.status || 'ERR'} ${result.statusText || result.error || ''}`,
            `- Duration ms: ${result.durationMs ?? ''}`,
            result.validationError ? `- Validation: ${result.validationError}` : '',
            result.responseBody ? `- Body: ${result.responseBody}` : '',
            ``,
        ].filter(Boolean).join('\n')),
    ].join('\n');

    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(markdownPath, markdown);
    await testInfo.attach('checkout-api-performance-report-json', {
        path: jsonPath,
        contentType: 'application/json',
    });
    await testInfo.attach('checkout-api-performance-report-md', {
        path: markdownPath,
        contentType: 'text/markdown',
    });

    console.log(`Checkout API performance JSON report: ${jsonPath}`);
    console.log(`Checkout API performance Markdown report: ${markdownPath}`);

    return { jsonPath, markdownPath };
}

/**
 * Export template request de k6 co the doc va ban tai ma khong can mo UI.
 * File nam trong test-data/k6 de khong bi Playwright don sach khi reset test-results.
 */
export async function exportCheckoutOrderApiTemplate(
    captured: CapturedCheckoutOrderRequest,
    outputPath: string,
) {
    if (isQrOrPaymentOnlyRequest(captured.postData)) {
        throw new Error('Refusing to export k6 template because detected API is QR/payment-only, not checkout order creation.');
    }

    if (isCustomerUpdateOnlyRequest(captured.postData)) {
        throw new Error([
            'Refusing to export k6 template because detected API is updateOrderCustomer, not checkout order creation.',
            'Replaying it only updates the same existing orderCode and will not increase order count.',
        ].join(' '));
    }

    const targetPath = path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify({
        projectName: captured.projectName,
        url: captured.url,
        method: captured.method,
        headers: sanitizeExportedTemplateHeaders(captured.headers, captured.auth),
        postData: normalizeCheckoutOrderPostDataForReplay(captured.postData, captured.contentType),
        contentType: captured.contentType,
        detectionCustomer: captured.detectionCustomer,
        auth: buildExportedAuthMetadata(captured.auth),
    }, null, 2));

    console.log(`Exported checkout API template for k6: ${targetPath}`);
    if (captured.auth) {
        console.log('Login auth token was not written to the k6 template. Set K6_AUTH_TOKEN before running k6 login mode.');
    }
    return targetPath;
}
