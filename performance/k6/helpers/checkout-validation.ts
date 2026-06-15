import {
    findValueByKnownKeys,
    readJsonPath,
    tryParseJson,
} from './checkout-payload.js';

function normalizeStatus(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function validateCheckoutOrderCreated(response, config) {
    if (response.status < 200 || response.status >= 300) {
        return {
            ok: false,
            reason: `HTTP status is not 2xx: ${response.status}`,
        };
    }

    const parsedBody = tryParseJson(response.body);
    if (!parsedBody || typeof parsedBody !== 'object') {
        return {
            ok: false,
            reason: 'Response is HTTP 2xx but body is not JSON, cannot prove order was created.',
        };
    }

    if (config.orderIdPath) {
        const orderId = readJsonPath(parsedBody, config.orderIdPath);
        if (orderId !== undefined && orderId !== null && String(orderId).trim() !== '') {
            return { ok: true, evidence: `${config.orderIdPath}=${String(orderId)}` };
        }

        return {
            ok: false,
            reason: `HTTP 2xx but required order id path "${config.orderIdPath}" was not found.`,
        };
    }

    const successValue = readJsonPath(parsedBody, config.successPath);
    if (successValue === false || normalizeStatus(successValue) === 'false') {
        return {
            ok: false,
            reason: 'HTTP 2xx but response success field is false.',
        };
    }

    const statusValue = readJsonPath(parsedBody, config.statusPath);
    if (['failed', 'fail', 'error', 'invalid'].includes(normalizeStatus(statusValue))) {
        return {
            ok: false,
            reason: `HTTP 2xx but response status field is "${String(statusValue)}".`,
        };
    }

    const knownIdentifier = findValueByKnownKeys(parsedBody);
    if (knownIdentifier) {
        return {
            ok: true,
            evidence: `${knownIdentifier.key}=${String(knownIdentifier.value)}`,
        };
    }

    if (successValue === true || ['success', 'succeeded', 'ok', 'created'].includes(normalizeStatus(statusValue))) {
        return {
            ok: true,
            evidence: successValue === true ? 'success=true' : `status=${String(statusValue)}`,
        };
    }

    return {
        ok: false,
        reason: 'HTTP 2xx but no order-created evidence found in response body. Set K6_ORDER_ID_PATH when needed.',
    };
}
