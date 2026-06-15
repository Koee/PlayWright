import { Dialog, Locator, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

export type CapturedDialog = {
    message: string;
    type: string;
    screenshotPath: string;
};

export type DialogTracker = {
    dialog: Dialog | null;
    filePrefix?: string;
    lastDialog?: {
        message: string;
        type: string;
        context?: string;
        timestamp: number;
        screenshotPath?: string;
    };
    pendingCapture?: Promise<CapturedDialog | null>;
    activeCapture?: Promise<CapturedDialog>;
};

const errScreenshotDir = path.join('test-results', 'err-screenshots');

function safeFilePart(value: string | undefined) {
    return value?.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function buildDialogScreenshotPath(tracker: DialogTracker, context: string, timestamp: number) {
    const prefix = safeFilePart(tracker.filePrefix);
    const safeContext = safeFilePart(context) || 'dialog';
    const fileName = prefix
        ? `dialog-${prefix}-${safeContext}-${timestamp}.png`
        : `dialog-${safeContext}-${timestamp}.png`;
    return path.join(errScreenshotDir, fileName);
}

async function withTimeout<T>(page: Page, promise: Promise<T>, label: string, timeoutMs = 5000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        }).then(() => {
            throw new Error(`${label} timed out after ${timeoutMs}ms`);
        }),
    ]);
}

/**
 * Gan listener cho alert/confirm/prompt cua browser.
 * Tracker giu dialog lai de flow co the chup screenshot roi dismiss co kiem soat.
 */
export function setupDialogTracker(page: Page, filePrefix?: string): DialogTracker {
    const tracker: DialogTracker = { dialog: null, filePrefix: safeFilePart(filePrefix) };
    page.on('dialog', (dialog) => {
        const timestamp = Date.now();
        const screenshotPath = buildDialogScreenshotPath(tracker, 'auto', timestamp);
        tracker.dialog = dialog;
        tracker.activeCapture = undefined;
        tracker.lastDialog = {
            message: dialog.message(),
            type: dialog.type(),
            timestamp,
            screenshotPath,
        };
        tracker.pendingCapture = captureScreenshotWithDialog(page, screenshotPath)
            .then((captured) => {
                if (!captured) {
                    return null;
                }

                return {
                    message: dialog.message(),
                    type: dialog.type(),
                    screenshotPath,
                };
            })
            .catch((error) => {
                console.warn(`Could not auto-capture browser dialog: ${(error as Error).message}`);
                return null;
            });
    });
    return tracker;
}

/**
 * Doi dialog native xuat hien trong mot khoang ngan, tra ve true neu tracker bat duoc dialog.
 */
export async function waitForTrackedDialog(page: Page, tracker: DialogTracker, timeout = 1500): Promise<boolean> {
    if (tracker.dialog) {
        return true;
    }

    const dialogAppeared = await page.waitForEvent('dialog', { timeout })
        .then((dialog) => {
            tracker.dialog = tracker.dialog || dialog;
            return true;
        })
        .catch(() => false);

    return dialogAppeared || Boolean(tracker.dialog);
}

/**
 * Chup man hinh khi co dialog/native overlay.
 * Uu tien CDP screenshot vi Playwright screenshot thong thuong co the bi chan boi dialog.
 */
export async function captureScreenshotWithDialog(page: Page, filePath: string): Promise<boolean> {
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { });

        try {
            const cdpSession = await page.context().newCDPSession(page);
            await withTimeout(page, cdpSession.send('Page.bringToFront'), 'Page.bringToFront').catch(() => { });
            const { data } = await withTimeout(page, cdpSession.send('Page.captureScreenshot', {
                format: 'png',
                fromSurface: true,
            }), 'Page.captureScreenshot');
            await fs.writeFile(filePath, Buffer.from(data, 'base64'));
            return true;
        } catch (cdpError) {
            console.warn(`CDP screenshot failed: ${(cdpError as Error).message}, trying fallback...`);
        }

        await withTimeout(page, page.screenshot({ path: filePath, fullPage: false }), 'page.screenshot').catch(() => { });
        await fs.access(filePath);
        return true;
    } catch (error) {
        console.warn(`All screenshot methods failed: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Chup trang thai loi tong quat, dung fallback khi flow fail ma chua co screenshot rieng.
 */
export async function captureFailureState(page: Page, filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { });
    const captured = await captureScreenshotWithDialog(page, filePath);
    if (!captured && !page.isClosed()) {
        await page.screenshot({ path: filePath, fullPage: false }).catch(() => { });
    }
}

/**
 * Chup vung UI quan trong truoc, sau do moi fallback sang page screenshot.
 * Dung khi loi nam trong popup/card/form can anh gan hon.
 */
export async function captureFocusedFailureState(
    page: Page,
    filePath: string,
    targets: Locator[] = []
): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { });

    for (const target of targets) {
        const count = await target.count().catch(() => 0);
        for (let index = 0; index < count; index++) {
            const candidate = target.nth(index);
            const visible = await candidate.isVisible({ timeout: 500 }).catch(() => false);
            if (!visible) {
                continue;
            }

            await candidate.screenshot({
                path: filePath,
                animations: 'disabled',
                timeout: 5000,
            }).catch(() => { });

            if (await fs.access(filePath).then(() => true).catch(() => false)) {
                return;
            }
        }
    }

    if (!page.isClosed()) {
        await page.screenshot({ path: filePath, fullPage: false }).catch(() => { });
    }
}

/**
 * Tao overlay HTML hien message dialog de screenshot van doc duoc noi dung dialog.
 */
export async function captureDialogMessageOverlay(
    page: Page,
    filePath: string,
    dialogType: string,
    dialogMessage: string
): Promise<boolean> {
    if (page.isClosed()) {
        return false;
    }

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { });
        await page.evaluate(({ dialogType, dialogMessage }) => {
            document.querySelector('[data-testid="pw-dialog-diagnostic-overlay"]')?.remove();

            const overlay = document.createElement('div');
            overlay.setAttribute('data-testid', 'pw-dialog-diagnostic-overlay');
            overlay.style.cssText = [
                'position: fixed',
                'inset: 0',
                'z-index: 2147483647',
                'background: rgba(0, 0, 0, 0.45)',
                'display: flex',
                'align-items: flex-start',
                'justify-content: center',
                'padding-top: 40px',
                'font-family: Arial, sans-serif',
            ].join(';');

            const dialog = document.createElement('div');
            dialog.style.cssText = [
                'width: min(560px, calc(100vw - 48px))',
                'background: #fff',
                'border: 1px solid #c7c7c7',
                'border-radius: 16px',
                'box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35)',
                'padding: 24px 28px',
                'color: #111',
                'white-space: pre-wrap',
                'font-size: 16px',
                'line-height: 1.55',
            ].join(';');

            const title = document.createElement('div');
            title.textContent = `${window.location.host} - ${dialogType}`;
            title.style.cssText = 'font-weight: 700; font-size: 20px; margin-bottom: 14px;';

            const message = document.createElement('div');
            message.textContent = dialogMessage;

            dialog.append(title, message);
            overlay.append(dialog);
            document.body.append(overlay);
        }, { dialogType, dialogMessage });

        await page.screenshot({ path: filePath, fullPage: false });
        await page.evaluate(() => document.querySelector('[data-testid="pw-dialog-diagnostic-overlay"]')?.remove()).catch(() => { });
        return true;
    } catch (error) {
        console.warn(`Could not capture dialog diagnostic overlay: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Chup screenshot, lay message/type, dismiss dialog va tra ve thong tin loi.
 */
export async function captureAndDismissDialog(
    page: Page,
    tracker: DialogTracker,
    context: string
): Promise<CapturedDialog> {
    if (tracker.activeCapture) {
        return tracker.activeCapture;
    }

    tracker.activeCapture = (async () => {
        const timestamp = Date.now();
        const dialog = tracker.dialog;
        const message = dialog?.message?.() ?? tracker.lastDialog?.message ?? 'Unknown dialog message';
        const type = dialog?.type?.() ?? tracker.lastDialog?.type ?? 'dialog';
        const pendingCapture = await tracker.pendingCapture?.catch(() => null);
        const screenshotPath = pendingCapture?.screenshotPath
            ?? tracker.lastDialog?.screenshotPath
            ?? buildDialogScreenshotPath(tracker, context, timestamp);
        tracker.lastDialog = {
            message,
            type,
            context,
            timestamp,
            screenshotPath,
        };

        console.warn(`[${context}] Browser dialog detected (${type}): "${message}"`);
        const screenshotAlreadyExists = await fs.access(screenshotPath).then(() => true).catch(() => false);
        if (!screenshotAlreadyExists && !page.isClosed()) {
            await captureScreenshotWithDialog(page, screenshotPath);
        }

        if (tracker.dialog) {
            await tracker.dialog.dismiss().catch(() => { });
            tracker.dialog = null;
        }

        if (!page.isClosed()) {
            await captureDialogMessageOverlay(page, screenshotPath, type, message);
        }

        const screenshotExists = await fs.access(screenshotPath).then(() => true).catch(() => false);
        if (!screenshotExists) {
            console.warn(`[${context}] Dialog screenshot was not created: ${screenshotPath}`);
        }

        console.warn(`[${context}] Dialog screenshot saved: ${screenshotPath}`);
        return { message, type, screenshotPath };
    })();

    return tracker.activeCapture;
}

export function buildDialogError(context: string, captured: CapturedDialog): Error {
    return new Error(`[${context}] Browser dialog (${captured.type}): ${captured.message}. Screenshot: ${captured.screenshotPath}`);
}

/**
 * Bien dialog da bat duoc thanh Error co screenshot path.
 * Dung trong catch block khi flow fail nhung dialog chua duoc xu ly.
 */
export async function capturePendingDialogError(
    page: Page,
    tracker: DialogTracker | undefined,
    context: string
): Promise<{ error: Error; screenshotPath: string } | null> {
    if (!tracker?.dialog && !tracker?.lastDialog) {
        return null;
    }

    if (!page.isClosed() && tracker.dialog) {
        const captured = await captureAndDismissDialog(page, tracker, context);
        return {
            error: buildDialogError(context, captured),
            screenshotPath: captured.screenshotPath,
        };
    }

    const pendingCapture = await tracker.pendingCapture?.catch(() => null);
    const timestamp = Date.now();
    const screenshotPath = pendingCapture?.screenshotPath
        ?? tracker.lastDialog?.screenshotPath
        ?? buildDialogScreenshotPath(tracker, context, timestamp);
    const captured = {
        message: tracker.lastDialog?.message ?? 'Unknown dialog message',
        type: tracker.lastDialog?.type ?? 'dialog',
        screenshotPath,
    };

    const screenshotExists = await fs.access(screenshotPath).then(() => true).catch(() => false);
    if (!screenshotExists && !page.isClosed()) {
        await captureDialogMessageOverlay(page, screenshotPath, captured.type, captured.message);
    }

    return {
        error: buildDialogError(context, captured),
        screenshotPath,
    };
}

/**
 * Neu tracker dang co dialog thi chup/dismiss va throw error ngay.
 */
export async function checkAndHandleDialog(page: Page, tracker: DialogTracker, context: string): Promise<void> {
    if (!tracker.dialog) {
        return;
    }

    const captured = await captureAndDismissDialog(page, tracker, context);
    throw buildDialogError(context, captured);
}

/**
 * Doi dialog trong timeout ngan; neu co thi xu ly nhu loi blocking.
 */
export async function waitAndHandleDialog(
    page: Page,
    tracker: DialogTracker,
    context: string,
    timeout = 1500
): Promise<void> {
    if (await waitForTrackedDialog(page, tracker, timeout)) {
        await checkAndHandleDialog(page, tracker, context);
    }
}
