import { Locator, Page } from '@playwright/test';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';
import * as dialogHandler from './dialog-handler';

export const blockingPageErrorRegex =
    /Internal\s+server\s+error|500\s+Internal|API\s+error|L\u1ed7i\s+(l\u1ea5y|l\u01b0u)\s+\u0111\u01a1n\s+h\u00e0ng|Loi\s+(lay|luu)\s+don\s+hang|Quota exceeded|Read requests|sheets\.googleapis\.com|project_number|Kh\u00f4ng\s+th\u1ec3\s+t\u1ea3i\s+d\u1eef\s+li\u1ec7u|Khong\s+the\s+tai\s+du\s+lieu|Network\s+Error|Failed\s+to\s+fetch/i;

export type BlockingPageError = {
    message: string;
    screenshotPath: string;
};

const errScreenshotDir = path.join('test-results', 'err-screenshots');
const blockingErrorPrefix = 'Blocking page/API error detected';

function safeContext(context: string) {
    return context.replace(/[^a-z0-9-_]/gi, '-').slice(0, 80) || 'page-error';
}

async function waitForMonitorInterval(intervalMs: number) {
    await delay(intervalMs);
}

/**
 * Doc body va tim cac loi blocking nhu API error, 500, quota hoac network error.
 */
export async function getBlockingPageErrorText(page: Page): Promise<string | null> {
    if (page.isClosed()) {
        return null;
    }

    const bodyText = await page.locator('body').innerText({ timeout: 500 }).catch(() => '');
    const match = bodyText.match(blockingPageErrorRegex);
    if (!match) {
        return null;
    }

    const compactText = bodyText.replace(/\s+/g, ' ').trim();
    return compactText.slice(0, 500) || match[0];
}

/**
 * Neu page co loi blocking thi chup target lien quan va throw error kem screenshot.
 */
export async function throwIfBlockingPageError(
    page: Page,
    context: string,
    targets: Locator[] = []
): Promise<void> {
    const errorText = await getBlockingPageErrorText(page);
    if (!errorText) {
        return;
    }

    const screenshotPath = path.join(errScreenshotDir, `${safeContext(context)}-${Date.now()}.png`);
    await dialogHandler.captureFocusedFailureState(page, screenshotPath, [
        ...targets,
        page.locator('body'),
    ]);
    throw new Error(`[${context}] ${blockingErrorPrefix}: ${errorText}. Screenshot: ${screenshotPath}`);
}

/**
 * Nhan dien error da duoc helper page-error/dialog-handler tao ra.
 */
export function isBlockingPageError(error: unknown): boolean {
    return error instanceof Error && (
        error.message.includes(blockingErrorPrefix)
        || error.message.includes('Browser dialog')
    );
}

/**
 * Chay promise chinh song song voi monitor loi page/dialog.
 * Dung khi dang doi UI nhung van muon fail nhanh neu page hien API error.
 */
export async function waitForPromiseOrBlockingPageError<T>(
    page: Page,
    promise: Promise<T>,
    context: string,
    timeoutMs: number,
    targets: Locator[] = [],
    dialogTracker?: dialogHandler.DialogTracker
): Promise<T> {
    let settled = false;
    const guardedPromise = promise.finally(() => {
        settled = true;
    });

    const monitorPromise = (async () => {
        const deadline = Date.now() + timeoutMs;
        while (!settled && Date.now() < deadline) {
            if (dialogTracker) {
                await dialogHandler.waitAndHandleDialog(page, dialogTracker, context, 100);
            }
            await throwIfBlockingPageError(page, context, targets);
            await waitForMonitorInterval(500);
        }

        return new Promise<never>(() => { });
    })();

    return Promise.race([guardedPromise, monitorPromise]);
}
