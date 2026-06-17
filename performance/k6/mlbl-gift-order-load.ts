import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { validateCheckoutOrderCreated } from './helpers/checkout-validation.js';
import {
    buildErrorReport,
    buildMarkdownReport,
} from './helpers/checkout-summary.js';

interface MlblGiftOrderData {
    apiPath: string;
    token: string;
    orderCodePrefix: string;
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    paymentMethod: string;
    staff: Record<string, string>;
    targetGroup: Record<string, string>;
    giftBudget: number;
    giftQuantity?: number;
    combo?: {
        name?: string;
        rule: MlblGiftOrderComboRule;
        product: MlblGiftOrderProduct;
        gift: MlblGiftOrderGift;
    };
    comboSource?: {
        type: 'json-cache';
        path: string;
    };
    productSelector?: MlblGiftOrderSelector;
    giftSelector?: MlblGiftOrderSelector;
    rule?: MlblGiftOrderComboRule;
    products?: MlblGiftOrderProduct[];
    gifts?: MlblGiftOrderGift[];
}

type MlblGiftOrderSelector = {
    sku?: string;
    sheetName?: string;
    nhanHang?: string;
    soLuong?: number;
};

type MlblGiftOrderComboRule = {
    requiredProductQuantity: number;
    rewardGiftQuantity: number;
};

type MlblGiftOrderProduct = {
    giaSauKM: number;
    soLuong: number;
    giaGoc: number;
    hhNvkd: number;
    tAdminNvkd: number;
} & Record<string, unknown>;

type MlblGiftOrderGift = {
    giaTriHangTang: number;
    soLuong: number;
} & Record<string, unknown>;

type MlblGiftOrderComboCache = {
    projectName: string;
    combos: Array<{
        name?: string;
        rule?: MlblGiftOrderComboRule;
        products: MlblGiftOrderProduct[];
        gifts: MlblGiftOrderGift[];
    }>;
}

function resolveProjectPath(filePath: string) {
    if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('./') || filePath.startsWith('../')) {
        return filePath;
    }

    return `../../${filePath}`;
}

function matchesSelector(value: Record<string, unknown>, selector: MlblGiftOrderSelector | undefined) {
    if (!selector || Object.keys(selector).length === 0) {
        return true;
    }

    return Object.entries(selector).every(([key, expected]) => {
        if (key === 'soLuong') {
            return true;
        }

        if (!expected) {
            return true;
        }

        return String(value[key] ?? '').trim().toLowerCase() === String(expected).trim().toLowerCase();
    });
}

function getRequestedGiftQuantity(selector: MlblGiftOrderSelector | undefined) {
    if (selector?.soLuong === undefined) {
        return undefined;
    }

    if (!Number.isFinite(selector.soLuong) || selector.soLuong <= 0) {
        throw new Error(`giftSelector.soLuong must be a positive number. Current value: ${selector.soLuong}`);
    }

    return selector.soLuong;
}

function getScenarioGiftQuantity(sourceData: MlblGiftOrderData) {
    return sourceData.giftSelector?.soLuong ?? sourceData.giftQuantity;
}

function scaleScenarioQuantities(
    products: MlblGiftOrderProduct[],
    gifts: MlblGiftOrderGift[],
    giftSelector: MlblGiftOrderSelector | undefined,
    rule: MlblGiftOrderComboRule | undefined,
) {
    const requestedGiftQuantity = getRequestedGiftQuantity(giftSelector);
    if (requestedGiftQuantity === undefined || gifts.length === 0) {
        return {
            products,
            gifts,
        };
    }

    const baseProductQuantity = rule?.requiredProductQuantity ?? products[0]?.soLuong;
    const baseGiftQuantity = rule?.rewardGiftQuantity ?? gifts[0].soLuong;
    if (!Number.isFinite(baseProductQuantity) || baseProductQuantity <= 0) {
        throw new Error(`Resolved product base quantity must be positive. Current value: ${baseProductQuantity}`);
    }

    if (!Number.isFinite(baseGiftQuantity) || baseGiftQuantity <= 0) {
        throw new Error(`Resolved gift base quantity must be positive. Current value: ${baseGiftQuantity}`);
    }

    const multiplier = requestedGiftQuantity / baseGiftQuantity;
    return {
        products: products.map(product => ({
            ...product,
            soLuong: baseProductQuantity * multiplier,
        })),
        gifts: gifts.map(gift => ({
            ...gift,
            soLuong: baseGiftQuantity * multiplier,
        })),
    };
}

function resolveScenario(sourceData: MlblGiftOrderData) {
    if (sourceData.combo) {
        return scaleScenarioQuantities(
            [sourceData.combo.product],
            [sourceData.combo.gift],
            {
                ...sourceData.giftSelector,
                soLuong: getScenarioGiftQuantity(sourceData),
            },
            sourceData.combo.rule,
        );
    }

    if (sourceData.products?.length && sourceData.gifts?.length) {
        return scaleScenarioQuantities(
            sourceData.products.filter(product => matchesSelector(product, sourceData.productSelector)),
            sourceData.gifts.filter(gift => matchesSelector(gift, sourceData.giftSelector)),
            sourceData.giftSelector,
            sourceData.rule,
        );
    }

    if (!sourceData.comboSource) {
        throw new Error('MLBL gift order data must define products/gifts or comboSource.');
    }

    if (sourceData.comboSource.type !== 'json-cache') {
        throw new Error(`Unsupported MLBL gift order combo source: ${sourceData.comboSource.type}`);
    }

    const cache = JSON.parse(open(resolveProjectPath(sourceData.comboSource.path)).replace(/^\uFEFF/, '')) as MlblGiftOrderComboCache;
    const combo = cache.combos.find(candidate => {
        return candidate.products.some(product => matchesSelector(product, sourceData.productSelector))
            && candidate.gifts.some(gift => matchesSelector(gift, sourceData.giftSelector));
    });

    if (!combo) {
        throw new Error(`Could not resolve MLBL gift order combo from ${sourceData.comboSource.path}`);
    }

    return scaleScenarioQuantities(
        combo.products.filter(product => matchesSelector(product, sourceData.productSelector)),
        combo.gifts.filter(gift => matchesSelector(gift, sourceData.giftSelector)),
        sourceData.giftSelector,
        combo.rule,
    );
}

const projectName = __ENV.K6_PROJECT_NAME || 'si';
const dataPath = resolveProjectPath(__ENV.K6_MLBL_DATA_PATH || 'test-data/json/mlbl-gift-order-si.json');
const data = JSON.parse(open(dataPath).replace(/^\uFEFF/, '')) as MlblGiftOrderData;
const scenario = resolveScenario(data);
const baseUrl = __ENV.K6_MLBL_BASE_URL || 'https://si.timdaythay.com/';
const apiUrl = resolveApiUrl(baseUrl, data.apiPath);
const totalOrders = Number(__ENV.K6_TOTAL_ORDERS || 20);
const ratePerSecond = Number(__ENV.K6_RATE_PER_SECOND || 5);
const maxVus = Number(__ENV.K6_MAX_VUS || 20);
const p95ThresholdMs = Number(__ENV.K6_P95_THRESHOLD_MS || 3000);
const errorRateThreshold = Number(__ENV.K6_ERROR_RATE_THRESHOLD || 0.01);
const droppedIterationsLimit = Number(__ENV.K6_DROPPED_ITERATIONS_LIMIT || 0);
const orderIdPath = __ENV.K6_ORDER_ID_PATH || __ENV.MLBL_GIFT_ORDER_ID_PATH || '';
const successPath = __ENV.K6_SUCCESS_PATH || __ENV.MLBL_GIFT_ORDER_SUCCESS_PATH || 'success';
const statusPath = __ENV.K6_STATUS_PATH || __ENV.MLBL_GIFT_ORDER_STATUS_PATH || 'status';

const runConfig = {
    checkoutMode: 'mlbl-gift-order',
    projectName,
    templatePath: dataPath,
    totalOrders,
    ratePerSecond,
    maxVus,
    p95ThresholdMs,
    errorRateThreshold,
    droppedIterationsLimit,
    orderIdPath,
    successPath,
    statusPath,
    template: {
        method: 'POST',
        url: apiUrl,
    },
};

export const options = {
    scenarios: {
        mlbl_gift_order_api_load: {
            executor: 'constant-arrival-rate',
            rate: ratePerSecond,
            timeUnit: '1s',
            duration: `${Math.ceil(totalOrders / ratePerSecond)}s`,
            preAllocatedVUs: Math.min(maxVus, Math.max(ratePerSecond, 1)),
            maxVUs: maxVus,
        },
    },
    thresholds: {
        http_req_failed: [`rate<${errorRateThreshold}`],
        http_req_duration: [`p(95)<${p95ThresholdMs}`],
        checks: ['rate>0.99'],
        dropped_iterations: [`count<=${droppedIterationsLimit}`],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const createdOrders = new Counter('checkout_orders_created');
const failedOrders = new Rate('checkout_orders_failed');
const http2xxResponses = new Counter('checkout_http_2xx');
const http4xxResponses = new Counter('checkout_http_4xx');
const http5xxResponses = new Counter('checkout_http_5xx');
const networkErrors = new Counter('checkout_network_errors');
const orderResults = new Counter('checkout_order_results');
const successfulOrderCases = new Counter('checkout_order_success');
const failedOrderCases = new Counter('checkout_order_failure');
const verifiedCreatedCases = new Counter('checkout_order_verified_created');
const http4xxFailureCases = new Counter('checkout_order_http_4xx_failure');
const http5xxFailureCases = new Counter('checkout_order_http_5xx_failure');
const networkFailureCases = new Counter('checkout_order_network_failure');
const validationFailureCases = new Counter('checkout_order_validation_failure');

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function resolveApiUrl(base: string, apiPath: string) {
    const trimmedBase = base.replace(/[?#].*$/, '').replace(/\/+$/, '');
    const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

    return `${trimmedBase}${normalizedPath}`;
}

function buildOrderCode(orderNo: number, vuNumber: number, scenarioIteration: number) {
    const now = new Date();
    const datePart = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const suffixBase = 36 ** 6;
    const seed = (Date.now() + orderNo * 1009 + vuNumber * 9176 + scenarioIteration * 53 + Math.floor(Math.random() * suffixBase)) % suffixBase;
    let suffix = Math.floor(seed).toString(36).toUpperCase().padStart(6, '0').slice(-6);
    if (/^\d+$/.test(suffix)) {
        suffix = `${String.fromCharCode(65 + (Math.floor(seed) % 26))}${suffix.slice(1)}`;
    }

    return `${data.orderCodePrefix}-${datePart}-${timePart}-${suffix}`;
}

function buildProducts() {
    return scenario.products.map(product => ({
        ...product,
        tienSauKM: product.giaSauKM * product.soLuong,
    }));
}

function buildPayload(orderNo: number, vuNumber: number, scenarioIteration: number) {
    const products = buildProducts();
    const totalAmount = products.reduce((sum, product) => sum + product.giaSauKM * product.soLuong, 0);
    const totalHoaHongSale = products.reduce((sum, product) => sum + product.hhNvkd * product.soLuong, 0);
    const totalThuongAdmin = products.reduce((sum, product) => sum + product.tAdminNvkd * product.soLuong, 0);
    const tongGiaTriHangHoa = products.reduce((sum, product) => sum + product.giaGoc * product.soLuong, 0);
    const tongGtQuaTangDaChon = scenario.gifts.reduce((sum, gift) => sum + gift.giaTriHangTang * gift.soLuong, 0);
    const orderCode = buildOrderCode(orderNo, vuNumber, scenarioIteration);

    return {
        orderCode,
        body: JSON.stringify({
            _token: __ENV.MLBL_GIFT_ORDER_TOKEN || data.token,
            action: 'insertOrder',
            orderData: {
                orderCode,
                customerName: __ENV.K6_CUSTOMER_NAME || data.customer.name,
                customerPhone: __ENV.K6_CUSTOMER_PHONE || data.customer.phone,
                customerAddress: __ENV.K6_CUSTOMER_ADDRESS || data.customer.address,
                paymentMethod: __ENV.MLBL_GIFT_ORDER_PAYMENT_METHOD || data.paymentMethod,
                ...data.staff,
                ...data.targetGroup,
                products,
                gift: {
                    items: scenario.gifts,
                },
                tongGiaTriHangHoa,
                tongGiaTriDangBan: totalAmount,
                tongMuaLoi: 0,
                totalAmount,
                tongGtQuaTang: data.giftBudget,
                tongGtQuaTangDaChon,
                tongGtQuaTangConLai: data.giftBudget - tongGtQuaTangDaChon,
                totalHoaHongSale,
                totalThuongAdmin,
                pay1Lan: totalAmount,
                pay1LanStatus: '',
                deposit: 0,
                depositStatus: '',
                payLan2: 0,
                payLan2Status: '',
                skipDetail: false,
                orderType: 'ORDER',
            },
            config: {
                baseURL: baseUrl.replace(/[?#].*$/, '').replace(/\/+$/, ''),
            },
        }),
    };
}

export default function () {
    const orderNo = exec.scenario.iterationInTest + 1;
    if (orderNo > totalOrders) {
        return;
    }

    const payload = buildPayload(orderNo, __VU, exec.scenario.iterationInTest);
    const response = http.request('POST', apiUrl, payload.body, {
        headers: {
            accept: '*/*',
            'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'content-type': 'text/plain',
        },
        tags: {
            flow: 'mlbl_gift_order',
            endpoint: 'mlbl_insert_order',
            order_code: payload.orderCode,
            project: projectName,
        },
    });

    const validation = validateCheckoutOrderCreated(response, runConfig);
    const ok = check(response, {
        'MLBL gift order API status is 2xx': res => res.status >= 200 && res.status < 300,
        'MLBL gift order API body proves order was created': () => validation.ok,
    });

    if (response.status >= 200 && response.status < 300) {
        http2xxResponses.add(1);
    } else if (response.status >= 400 && response.status < 500) {
        http4xxResponses.add(1);
    } else if (response.status >= 500) {
        http5xxResponses.add(1);
    } else {
        networkErrors.add(1);
    }

    if (!validation.ok && orderNo <= 5) {
        console.error(`MLBL gift order ${orderNo} was not verified: ${validation.reason}`);
    }

    const result = validation.ok && ok ? 'success' : 'failure';
    let category = 'validation_failed';
    if (validation.ok && ok) {
        category = 'verified_created';
    } else if (response.status >= 400 && response.status < 500) {
        category = 'http_4xx';
    } else if (response.status >= 500) {
        category = 'http_5xx';
    } else if (response.status <= 0) {
        category = 'network_error';
    }

    orderResults.add(1, {
        result,
        category,
        mode: 'mlbl-gift-order',
        project: projectName,
    });
    if (result === 'success') {
        successfulOrderCases.add(1);
    } else {
        failedOrderCases.add(1);
    }
    if (category === 'verified_created') {
        verifiedCreatedCases.add(1);
    } else if (category === 'http_4xx') {
        http4xxFailureCases.add(1);
    } else if (category === 'http_5xx') {
        http5xxFailureCases.add(1);
    } else if (category === 'network_error') {
        networkFailureCases.add(1);
    } else {
        validationFailureCases.add(1);
    }
    createdOrders.add(validation.ok ? 1 : 0);
    failedOrders.add(!validation.ok || !ok);
}

export function handleSummary(data) {
    const httpReqs = data.metrics.http_reqs?.values?.count || 0;
    const droppedIterations = data.metrics.dropped_iterations?.values?.count || 0;
    const p95Duration = data.metrics.http_req_duration?.values?.['p(95)'];
    const errorReport = buildErrorReport(data, runConfig);
    const reportBaseName = `${projectName}-mlbl-gift-order-load`;
    const rawSummary = JSON.stringify(data, null, 2);
    const reportJson = JSON.stringify(errorReport, null, 2);
    const reportMarkdown = buildMarkdownReport(errorReport);

    return {
        stdout: JSON.stringify({
            configured_total_orders: totalOrders,
            configured_project_name: projectName,
            configured_rate_per_second: ratePerSecond,
            configured_max_vus: maxVus,
            configured_p95_threshold_ms: p95ThresholdMs,
            checks_rate: data.metrics.checks?.values?.rate,
            http_req_failed_rate: data.metrics.http_req_failed?.values?.rate,
            http_req_duration_p95: p95Duration,
            http_reqs: httpReqs,
            dropped_iterations: droppedIterations,
            checkout_orders_verified_created: data.metrics.checkout_orders_created?.values?.count,
            checkout_orders_success: errorReport.resultBreakdown.success,
            checkout_orders_failure: errorReport.resultBreakdown.failure,
            note: droppedIterations > 0
                ? 'Some iterations were dropped because the configured rate needs more VUs/server capacity than available.'
                : 'No dropped iterations.',
        }, null, 2),
        [`test-results/k6/${reportBaseName}-summary.json`]: rawSummary,
        [`test-results/k6/${reportBaseName}-report.json`]: reportJson,
        [`test-results/k6/${reportBaseName}-report.md`]: reportMarkdown,
        [`test-results/k6/${reportBaseName}-error-report.json`]: reportJson,
        [`test-results/k6/${reportBaseName}-error-report.md`]: reportMarkdown,
    };
}
