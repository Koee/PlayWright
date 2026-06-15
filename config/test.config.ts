// Worker count is centralized here because clipboard tests share OS/browser state.
export const SERIAL_WORKERS = 1;

// Default Playwright action/navigation timeout declarations.
export const ACTION_TIMEOUT_MS = 15000;
export const NAVIGATION_TIMEOUT_MS = 30000;

// Polling and UI readiness timeout declarations used across page objects.
export const SHORT_WAIT_MS = 500;
export const UI_READY_TIMEOUT_MS = 10000;
export const PRODUCT_READY_TIMEOUT_MS = 10000;

// Copy/QR/order waits are longer because QR generation and checkout APIs can be slow.
export const COPY_READY_TIMEOUT_MS = 30000;
export const QR_READY_TIMEOUT_MS = 90000;
export const ORDER_RESULT_TIMEOUT_MS = 20000;

// So lan dat hang cho testcase bulk checkout.
// Khi can tang/giam so don, chi can sua gia tri config nay.
export const BULK_CHECKOUT_ORDER_COUNT = 2;

// So lan dat hang dong thoi cho testcase performance checkout.
// Nen de rieng voi bulk checkout tuan tu vi test nay tao tai cung luc.
export const PERFORMANCE_CHECKOUT_ORDER_COUNT = 5;

// So don va batch/rate cho performance checkout bang API.
// - API_PERFORMANCE_CHECKOUT_ORDER_COUNT: tong so don can tao.
// - API_PERFORMANCE_CHECKOUT_BATCH_SIZE: so request tao don chay song song trong moi batch Playwright.
// - API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND: so request/giay cua k6.
// k6 doc default tu file nay qua scripts/run-k6-checkout.js:
// - API_PERFORMANCE_CHECKOUT_ORDER_COUNT -> K6_TOTAL_ORDERS
// - API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND -> K6_RATE_PER_SECOND va K6_MAX_VUS
// Neu muon ban tai lon hon rieng cho k6, van co the override bang env K6_* truoc khi chay npm script.
// Test nay se detect API dat hang tu UI truoc, sau do replay payload bang API de tranh mo nhieu UI.
export const API_PERFORMANCE_CHECKOUT_ORDER_COUNT = 20;
export const API_PERFORMANCE_CHECKOUT_BATCH_SIZE = 5;
export const API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND = 5;
export const API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS = 1000;
export const API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES = 20;
