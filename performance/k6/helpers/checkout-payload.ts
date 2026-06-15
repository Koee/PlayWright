export const knownOrderIdentifierKeys = [
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

export function resolveTemplatePath(path) {
    if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('./') || path.startsWith('../')) {
        return path;
    }

    return `../../${path}`;
}

export function isQrOrPaymentOnlyTemplate(template) {
    return /createQRCode|qrCode/i.test(template.postData || '');
}

export function isCustomerUpdateOnlyTemplate(template) {
    return /updateOrderCustomer/i.test(template.postData || '');
}

export function tryParseJson(rawBody) {
    if (!rawBody || !String(rawBody).trim()) {
        return undefined;
    }

    try {
        return JSON.parse(rawBody);
    } catch {
        return undefined;
    }
}

export function readJsonPath(value, jsonPath) {
    return String(jsonPath || '')
        .split('.')
        .filter(Boolean)
        .reduce((current, key) => {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            return current[key];
        }, value);
}

export function findValueByKnownKeys(value) {
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

function findFirstOrderCode(rawBody) {
    const knownIdentifier = findValueByKnownKeys(tryParseJson(rawBody));
    if (knownIdentifier) {
        return String(knownIdentifier.value);
    }

    return rawBody.match(/ONLINE-[A-Z0-9-]+/i)?.[0];
}

function isProductLikeKey(key) {
    return /product|item|goods|sku|variant|combo|package|cart|san.?pham|ten.?sp|ma.?sp|hang.?hoa/i.test(key);
}

function isCustomerPhoneKey(key, pathKey = key) {
    return /phone|mobile|tel|sdt|dien.?thoai/i.test(key) && !isProductLikeKey(pathKey);
}

function isCustomerNameKey(key, pathKey = key) {
    return /customer.?name|recipient.?name|receiver.?name|buyer.?name|full.?name|user.?name|contact.?name|ten.?khach|ten.?nguoi.?dat|ten.?nguoi.?nhan|ho.?ten|name$/i.test(key)
        && !isProductLikeKey(pathKey);
}

function isCustomerAddressKey(key, pathKey = key) {
    return /address|dia.?chi/i.test(key) && !isProductLikeKey(pathKey);
}

function replaceCustomerValues(value, detectionCustomer, customer, pathKey = '') {
    if (Array.isArray(value)) {
        return value.map(item => replaceCustomerValues(item, detectionCustomer, customer, pathKey));
    }

    if (value && typeof value === 'object') {
        const output = {};
        for (const [key, item] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase();
            const currentPath = pathKey ? `${pathKey}.${normalizedKey}` : normalizedKey;
            if (isCustomerPhoneKey(normalizedKey, currentPath)) {
                output[key] = customer.phone;
            } else if (isCustomerNameKey(normalizedKey, currentPath)) {
                output[key] = customer.name;
            } else if (isCustomerAddressKey(normalizedKey, currentPath)) {
                output[key] = customer.address;
            } else {
                output[key] = replaceCustomerValues(item, detectionCustomer, customer, currentPath);
            }
        }
        return output;
    }

    if (typeof value === 'string') {
        return value
            .split(detectionCustomer.name).join(customer.name)
            .split(detectionCustomer.phone).join(customer.phone);
    }

    return value;
}

function replaceOrderCodeValues(value, originalOrderCode, replayOrderCode) {
    if (!originalOrderCode) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => replaceOrderCodeValues(item, originalOrderCode, replayOrderCode));
    }

    if (value && typeof value === 'object') {
        const output = {};
        for (const [key, item] of Object.entries(value)) {
            output[key] = replaceOrderCodeValues(item, originalOrderCode, replayOrderCode);
        }
        return output;
    }

    if (typeof value === 'string') {
        return value.split(originalOrderCode).join(replayOrderCode);
    }

    return value;
}

function enableOrderDetailsWhenProductsExist(value) {
    if (Array.isArray(value)) {
        return value.map(item => enableOrderDetailsWhenProductsExist(item));
    }

    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            output[key] = enableOrderDetailsWhenProductsExist(item);
        }

        if (Array.isArray(output.products) && output.products.length > 0 && Object.prototype.hasOwnProperty.call(output, 'skipDetail')) {
            output.skipDetail = false;
        }

        return output;
    }

    return value;
}

export function buildCustomer(orderNo, vuNumber) {
    const sequence = String(orderNo).padStart(6, '0');
    const vuPart = String(vuNumber % 10);

    return {
        name: `Nguyễn Văn A - PerforTest ${orderNo}`,
        phone: `098${vuPart}${sequence}`.slice(0, 10),
        address: 'Performance Address',
    };
}

function buildOrderCode(originalOrderCode, orderNo, vuNumber, scenarioIteration) {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const datePart = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const suffixBase = 36 ** 6;
    const seed = (Date.now() + orderNo * 1009 + vuNumber * 9176 + scenarioIteration * 53 + Math.floor(Math.random() * suffixBase)) % suffixBase;
    let suffix = Math.floor(seed).toString(36).toUpperCase().padStart(6, '0').slice(-6);
    if (/^\d+$/.test(suffix)) {
        suffix = `${String.fromCharCode(65 + (Math.floor(seed) % 26))}${suffix.slice(1)}`;
    }
    const basePrefix = originalOrderCode?.match(/^(.+)-\d{6}-\d{6}-[A-Z0-9]+$/i)?.[1];

    return `${basePrefix || 'ONLINE-K6-PERF'}-${datePart}-${timePart}-${suffix}`;
}

export function buildBody(template, customer, iterationFallback, vuNumber, scenarioIteration) {
    const postData = template.postData || '';
    const originalOrderCode = findFirstOrderCode(postData);
    const replayOrderCode = buildOrderCode(originalOrderCode, Number(customer.phone.slice(-6)) || iterationFallback, vuNumber, scenarioIteration);
    const contentType = template.contentType || template.headers?.['content-type'] || '';
    const trimmedPostData = postData.trim();
    const looksLikeJson = contentType.includes('application/json')
        || trimmedPostData.startsWith('{')
        || trimmedPostData.startsWith('[');

    if (looksLikeJson) {
        const parsed = JSON.parse(postData);
        return {
            body: JSON.stringify(enableOrderDetailsWhenProductsExist(
                replaceOrderCodeValues(
                    replaceCustomerValues(parsed, template.detectionCustomer, customer),
                    originalOrderCode,
                    replayOrderCode
                )
            )),
            orderCode: replayOrderCode,
        };
    }

    const replayBody = postData
        .split(template.detectionCustomer.name).join(customer.name)
        .split(template.detectionCustomer.phone).join(customer.phone);
    return {
        body: originalOrderCode ? replayBody.split(originalOrderCode).join(replayOrderCode) : replayBody,
        orderCode: replayOrderCode,
    };
}

export function buildHeaders(template, env) {
    const headers = { ...(template.headers || {}) };
    const envToken = env.K6_AUTH_TOKEN;
    const authHeaderName = env.K6_AUTH_HEADER_NAME || template.auth?.headerName;
    const authPrefix = env.K6_AUTH_TOKEN_PREFIX ?? 'Bearer';

    if (template.auth?.headerName && template.auth?.value) {
        headers[template.auth.headerName] = template.auth.value;
    }

    if (envToken && authHeaderName) {
        headers[authHeaderName] = authPrefix ? `${authPrefix} ${envToken}` : envToken;
    }

    return headers;
}
