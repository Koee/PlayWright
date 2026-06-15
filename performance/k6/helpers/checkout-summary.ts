function getMetricValue(data, metricName, valueName, fallback = 0) {
    return data.metrics[metricName]?.values?.[valueName] ?? fallback;
}

function collectThresholdResults(data) {
    const results = [];
    for (const [metricName, metric] of Object.entries(data.metrics) as [string, any][]) {
        if (!metric.thresholds) {
            continue;
        }

        for (const [threshold, result] of Object.entries(metric.thresholds) as [string, any][]) {
            results.push({
                metric: metricName,
                threshold,
                ok: Boolean(result.ok),
            });
        }
    }

    return results;
}

export function buildErrorReport(data, config) {
    const thresholdResults = collectThresholdResults(data);
    const failedThresholds = thresholdResults.filter(result => !result.ok);
    const httpReqs = getMetricValue(data, 'http_reqs', 'count');
    const droppedIterations = getMetricValue(data, 'dropped_iterations', 'count');
    const checksFails = getMetricValue(data, 'checks', 'fails');
    const failedHttpRate = getMetricValue(data, 'http_req_failed', 'rate');
    const p95Duration = getMetricValue(data, 'http_req_duration', 'p(95)', undefined);
    const http4xx = getMetricValue(data, 'checkout_http_4xx', 'count');
    const http5xx = getMetricValue(data, 'checkout_http_5xx', 'count');
    const networkErrorCount = getMetricValue(data, 'checkout_network_errors', 'count');
    const systemErrors = [];

    if (http5xx > 0) {
        systemErrors.push(`${http5xx} request(s) returned HTTP 5xx from server.`);
    }
    if (http4xx > 0) {
        systemErrors.push(`${http4xx} request(s) returned HTTP 4xx. Check auth, payload, or validation data.`);
    }
    if (networkErrorCount > 0) {
        systemErrors.push(`${networkErrorCount} request(s) failed before receiving a valid HTTP status.`);
    }
    if (droppedIterations > 0) {
        systemErrors.push(`${droppedIterations} iteration(s) were dropped because k6 could not keep the configured arrival rate.`);
    }
    if (p95Duration !== undefined && p95Duration >= config.p95ThresholdMs) {
        systemErrors.push(`p95 response time ${p95Duration}ms crossed threshold ${config.p95ThresholdMs}ms.`);
    }
    if (checksFails > 0) {
        systemErrors.push(`${checksFails} check(s) failed.`);
    }

    return {
        generatedAt: new Date().toISOString(),
        mode: config.checkoutMode,
        endpoint: {
            method: config.template.method || 'POST',
            url: config.template.url,
        },
        config: {
            projectName: config.projectName,
            totalOrders: config.totalOrders,
            ratePerSecond: config.ratePerSecond,
            maxVus: config.maxVus,
            p95ThresholdMs: config.p95ThresholdMs,
            errorRateThreshold: config.errorRateThreshold,
            droppedIterationsLimit: config.droppedIterationsLimit,
            templatePath: config.templatePath,
            orderIdPath: config.orderIdPath || null,
            successPath: config.successPath,
            statusPath: config.statusPath,
        },
        summary: {
            pass: failedThresholds.length === 0 && systemErrors.length === 0,
            httpReqs,
            verifiedCreatedOrders: getMetricValue(data, 'checkout_orders_created', 'count'),
            http2xx: getMetricValue(data, 'checkout_http_2xx', 'count'),
            http4xx,
            http5xx,
            networkErrors: networkErrorCount,
            checksRate: getMetricValue(data, 'checks', 'rate', undefined),
            checksFails,
            httpReqFailedRate: failedHttpRate,
            httpReqDurationP95: p95Duration,
            droppedIterations,
        },
        failedThresholds,
        thresholds: thresholdResults,
        systemErrors,
    };
}

export function buildMarkdownReport(errorReport) {
    return [
        '# Checkout k6 Error Report',
        '',
        `- Generated at: ${errorReport.generatedAt}`,
        `- Mode: ${errorReport.mode}`,
        `- Endpoint: ${errorReport.endpoint.method} ${errorReport.endpoint.url}`,
        `- Pass: ${errorReport.summary.pass}`,
        `- HTTP requests: ${errorReport.summary.httpReqs}`,
        `- Verified created orders: ${errorReport.summary.verifiedCreatedOrders}`,
        `- HTTP 2xx: ${errorReport.summary.http2xx}`,
        `- HTTP 4xx: ${errorReport.summary.http4xx}`,
        `- HTTP 5xx: ${errorReport.summary.http5xx}`,
        `- Network errors: ${errorReport.summary.networkErrors}`,
        `- Dropped iterations: ${errorReport.summary.droppedIterations}`,
        `- p95 duration ms: ${errorReport.summary.httpReqDurationP95}`,
        '',
        '## System Errors',
        '',
        ...(errorReport.systemErrors.length > 0
            ? errorReport.systemErrors.map(error => `- ${error}`)
            : ['- No system/API errors detected from k6 metrics.']),
        '',
        '## Failed Thresholds',
        '',
        ...(errorReport.failedThresholds.length > 0
            ? errorReport.failedThresholds.map(result => `- ${result.metric}: ${result.threshold}`)
            : ['- No failed thresholds.']),
        '',
    ].join('\n');
}
