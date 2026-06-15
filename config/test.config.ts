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
