import { Dialog, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

export type CapturedDialog = {
    message: string;
    type: string;
    screenshotPath: string;
};

export type DialogTracker = {
    dialog: Dialog | null;
    lastDialog?: {
        message: string;
        type: string;
        context?: string;
        timestamp: number;
    };
};

const errScreenshotDir = path.join('test-results', 'err-screenshots');

async function withTimeout<T>(page: Page, promise: Promise<T>, label: string, timeoutMs = 5000): Promise<T> {
    return Promise.race([
        promise,
        page.waitForTimeout(timeoutMs).then(() => {
            throw new Error(`${label} timed out after ${timeoutMs}ms`);
        }),
    ]);
}

export function setupDialogTracker(page: Page): DialogTracker {
    const tracker: DialogTracker = { dialog: null };
    page.on('dialog', (dialog) => {
        tracker.dialog = dialog;
        tracker.lastDialog = {
            message: dialog.message(),
            type: dialog.type(),
            timestamp: Date.now(),
        };
    });
    return tracker;
}

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

export async function captureFailureState(page: Page, filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { });
    const captured = await captureScreenshotWithDialog(page, filePath);
    if (!captured && !page.isClosed()) {
        await page.screenshot({ path: filePath, fullPage: true }).catch(() => { });
    }
}

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

export async function captureAndDismissDialog(
    page: Page,
    tracker: DialogTracker,
    context: string
): Promise<CapturedDialog> {
    const timestamp = Date.now();
    const safeContext = context.replace(/[^a-z0-9-_]/gi, '-');
    const screenshotPath = path.join(errScreenshotDir, `dialog-${safeContext}-${timestamp}.png`);
    const dialog = tracker.dialog;
    const message = dialog?.message?.() ?? tracker.lastDialog?.message ?? 'Unknown dialog message';
    const type = dialog?.type?.() ?? tracker.lastDialog?.type ?? 'dialog';
    tracker.lastDialog = {
        message,
        type,
        context,
        timestamp,
    };

    console.warn(`[${context}] Browser dialog detected (${type}): "${message}"`);
    const nativeScreenshotCaptured = page.isClosed() ? false : await captureScreenshotWithDialog(page, screenshotPath);

    if (tracker.dialog) {
        await tracker.dialog.dismiss().catch(() => { });
        tracker.dialog = null;
    }

    const screenshotExists = await fs.access(screenshotPath).then(() => true).catch(() => false);
    if (!nativeScreenshotCaptured || !screenshotExists) {
        await captureDialogMessageOverlay(page, screenshotPath, type, message);
    }

    console.warn(`[${context}] Dialog screenshot saved: ${screenshotPath}`);
    return { message, type, screenshotPath };
}

export function buildDialogError(context: string, captured: CapturedDialog): Error {
    return new Error(`[${context}] Browser dialog (${captured.type}): ${captured.message}. Screenshot: ${captured.screenshotPath}`);
}

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

    const timestamp = Date.now();
    const safeContext = context.replace(/[^a-z0-9-_]/gi, '-');
    const screenshotPath = path.join(errScreenshotDir, `dialog-${safeContext}-${timestamp}.png`);
    const captured = {
        message: tracker.lastDialog?.message ?? 'Unknown dialog message',
        type: tracker.lastDialog?.type ?? 'dialog',
        screenshotPath,
    };

    if (!page.isClosed()) {
        await captureDialogMessageOverlay(page, screenshotPath, captured.type, captured.message);
    }

    return {
        error: buildDialogError(context, captured),
        screenshotPath,
    };
}

export async function checkAndHandleDialog(page: Page, tracker: DialogTracker, context: string): Promise<void> {
    if (!tracker.dialog) {
        return;
    }

    const captured = await captureAndDismissDialog(page, tracker, context);
    throw buildDialogError(context, captured);
}

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
