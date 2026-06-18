/// <reference path="./k6.d.ts" />

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import exec from 'k6/execution';
import {
    buildBody,
    buildCustomer,
    buildHeaders,
    isCustomerUpdateOnlyTemplate,
    isQrOrPaymentOnlyTemplate,
    resolveTemplatePath,
} from './helpers/checkout-payload.js';
import { validateCheckoutOrderCreated } from './helpers/checkout-validation.js';
import {
    buildErrorReport,
    buildMarkdownReport,
} from './helpers/checkout-summary.js';

interface CheckoutTemplate {
    projectName?: string;
    method?: string;
    url: string;
    headers?: Record<string, string>;
    contentType?: string;
    postData?: string;
}

const checkoutMode = __ENV.K6_CHECKOUT_MODE || 'guest';
const requestedProjectName = __ENV.K6_PROJECT_NAME || 'unknown-project';
const templatePath = resolveTemplatePath(
    __ENV.K6_CHECKOUT_TEMPLATE_PATH || `test-data/k6/${requestedProjectName}-${checkoutMode}-checkout-order-api-template.json`
);
const template = JSON.parse(open(templatePath).replace(/^\uFEFF/, ''));
const projectName = __ENV.K6_PROJECT_NAME || template.projectName || requestedProjectName;
if (isQrOrPaymentOnlyTemplate(template)) {
    throw new Error(`Template ${templatePath} points to QR/payment API, not checkout order API. Regenerate it with Playwright @api-template-${checkoutMode}.`);
}
if (isCustomerUpdateOnlyTemplate(template)) {
    throw new Error(`Template ${templatePath} points to updateOrderCustomer, which only updates an existing orderCode. Regenerate it with a real checkout-create API.`);
}

const totalOrders = Number(__ENV.K6_TOTAL_ORDERS || 200);
const ratePerSecond = Number(__ENV.K6_RATE_PER_SECOND || 20);
const maxVus = Number(__ENV.K6_MAX_VUS || 50);
const p95ThresholdMs = Number(__ENV.K6_P95_THRESHOLD_MS || 3000);
const errorRateThreshold = Number(__ENV.K6_ERROR_RATE_THRESHOLD || 0.01);
const droppedIterationsLimit = Number(__ENV.K6_DROPPED_ITERATIONS_LIMIT || 0);
const orderIdPath = __ENV.K6_ORDER_ID_PATH || '';
const successPath = __ENV.K6_SUCCESS_PATH || 'success';
const statusPath = __ENV.K6_STATUS_PATH || 'status';

const runConfig = {
    checkoutMode,
    projectName,
    template,
    templatePath,
    totalOrders,
    ratePerSecond,
    maxVus,
    p95ThresholdMs,
    errorRateThreshold,
    droppedIterationsLimit,
    orderIdPath,
    successPath,
    statusPath,
};

export const options = {
    scenarios: {
        checkout_order_api_load: {
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

export default function () {
    const orderNo = exec.scenario.iterationInTest + 1;
    if (orderNo > totalOrders) {
        return;
    }

    const customer = buildCustomer(orderNo, __VU);
    const payload = buildBody(template, customer, __ITER + 1, __VU, exec.scenario.iterationInTest);
    const response = http.request(template.method || 'POST', template.url, payload.body, {
        headers: buildHeaders(template, __ENV),
        tags: {
            flow: 'checkout_order',
            endpoint: 'detected_order_api',
            order_code: payload.orderCode,
        },
    });

    const validation = validateCheckoutOrderCreated(response, runConfig);
    const ok = check(response, {
        'checkout order API status is 2xx': res => res.status >= 200 && res.status < 300,
        'checkout order API body proves order was created': () => validation.ok,
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
        console.error(`Checkout order ${orderNo} was not verified: ${validation.reason}`);
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
        mode: checkoutMode,
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
    const reportBaseName = `${projectName}-${checkoutMode}-checkout-order-load`;
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
        [`test-results/report/k6/${reportBaseName}-summary.json`]: rawSummary,
        [`test-results/report/k6/${reportBaseName}-report.json`]: reportJson,
        [`test-results/report/k6/${reportBaseName}-report.md`]: reportMarkdown,
        [`test-results/report/k6/${reportBaseName}-error-report.json`]: reportJson,
        [`test-results/report/k6/${reportBaseName}-error-report.md`]: reportMarkdown,
        'test-results/report/k6/checkout-order-load-summary.json': rawSummary,
        'test-results/report/k6/checkout-order-load-report.json': reportJson,
        'test-results/report/k6/checkout-order-load-report.md': reportMarkdown,
        'test-results/report/k6/checkout-order-load-error-report.json': reportJson,
        'test-results/report/k6/checkout-order-load-error-report.md': reportMarkdown,
    };
}
