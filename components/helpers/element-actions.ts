import { Locator, Page } from '@playwright/test';
import { setTimeout as delay } from 'timers/promises';
import * as dialogHandler from './dialog-handler';
import { SHORT_WAIT_MS, UI_READY_TIMEOUT_MS } from '../../config/test.config';

export type ClickElementOptions = {
    visibilityTimeout: number;
    clickTimeout: number;
    waitForNav: boolean;
};

/**
 * Click mot action theo danh sach selector fallback.
 * Dung khi cung mot nut co nhieu cach locate khac nhau giua cac website.
 */
export async function clickElement(
    page: Page,
    selectors: string[],
    actionName: string,
    options: ClickElementOptions = { visibilityTimeout: 3000, clickTimeout: 5000, waitForNav: true },
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    for (const selector of selectors) {
        try {
            const element = page.locator(selector).first();
            if (await element.isVisible({ timeout: options.visibilityTimeout }) && await element.isEnabled().catch(() => true)) {
                await element.click({ timeout: options.clickTimeout });
                if (dialogTracker) {
                    const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, context, SHORT_WAIT_MS);
                }
                if (options.waitForNav) {
                    const waitForReady = waitForDomReady(page, UI_READY_TIMEOUT_MS).catch(() => { });
                    if (dialogTracker) {
                        const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-page-ready`;
                        await Promise.race([
                            waitForReady,
                            dialogHandler.waitAndHandleDialog(page, dialogTracker, context, UI_READY_TIMEOUT_MS),
                        ]).catch(async (error) => {
                            await dialogHandler.checkAndHandleDialog(page, dialogTracker, context);
                            throw error;
                        });
                    } else {
                        await waitForReady;
                    }
                }
                if (dialogTracker) {
                    const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, context, SHORT_WAIT_MS);
                }
                console.log(`${actionName} - Selector: ${selector}`);
                return true;
            }
        } catch {
            if (dialogTracker) {
                const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, context);
            }
            continue;
        }
    }
    console.warn(`${actionName} - Element not found`);
    return false;
}

/**
 * Doi DOM san sang sau navigation/action, khong doi networkidle de giam flaky voi SPA/polling.
 */
export async function waitForDomReady(page: Page, timeout = UI_READY_TIMEOUT_MS): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => { });
    await page.waitForFunction(() => {
        return document.readyState === 'interactive' || document.readyState === 'complete';
    }, undefined, { timeout }).catch(() => { });
}

/**
 * Interval ngan cho cac loop da co condition rieng.
 * Khong dung ham nay thay cho wait theo locator/response khi co condition cu the.
 */
export async function waitForConditionPoll(_page: Page, intervalMs = SHORT_WAIT_MS): Promise<void> {
    await delay(intervalMs);
}

/**
 * Dien input theo danh sach selector fallback, dung cho field co selector thay doi giua site.
 */
export async function fillInput(
    page: Page,
    selectors: string[],
    value: string,
    fieldName: string,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<boolean> {
    for (const selector of selectors) {
        try {
            if (dialogTracker) {
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, `fill-${fieldName.toLowerCase()}-input`);
            }

            const input = page.locator(selector).first();
            if (await input.isVisible({ timeout: 5000 })) {
                await input.fill(value, { timeout: 5000 });
                console.log(`Filled ${fieldName} using selector: ${selector}`);
                return true;
            }
        } catch {
            continue;
        }
    }
    throw new Error(`Could not find ${fieldName} input field`);
}

/**
 * Tim locator visible dau tien trong nhieu locator fallback.
 * Thuong dung khi popup/form co nhieu bien the UI.
 */
export async function firstVisibleLocator(
    locators: Locator[],
    timeoutMs: number,
    page?: Page,
    dialogTracker?: dialogHandler.DialogTracker,
    dialogContext = 'wait-input'
): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (page && dialogTracker) {
            await dialogHandler.waitAndHandleDialog(page, dialogTracker, dialogContext, 250);
        }

        for (const locator of locators) {
            const count = await locator.count().catch(() => 0);
            for (let index = 0; index < count; index++) {
                if (page && dialogTracker) {
                    await dialogHandler.checkAndHandleDialog(page, dialogTracker, dialogContext);
                }

                const candidate = locator.nth(index);
                if (await candidate.isVisible({ timeout: 250 }).catch(() => false)) {
                    return candidate;
                }
            }
        }
    }

    return null;
}

/**
 * Dien tat ca input dang visible va loai trung lap theo vi tri/thuoc tinh DOM.
 * Dung cho form co nhieu input cung muc dich nhung render khac nhau theo site.
 */
export async function fillVisibleInputs(
    locators: Locator[],
    value: string,
    fieldName: string,
    page?: Page,
    dialogTracker?: dialogHandler.DialogTracker
): Promise<number> {
    let filled = 0;
    const seen = new Set<string>();

    for (const locator of locators) {
        if (page && dialogTracker) {
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `fill-${fieldName.toLowerCase()}-input`);
        }

        const count = await locator.count().catch(() => 0);
        for (let index = 0; index < count; index++) {
            if (page && dialogTracker) {
                await dialogHandler.checkAndHandleDialog(page, dialogTracker, `fill-${fieldName.toLowerCase()}-input`);
            }

            const input = locator.nth(index);
            const handle = await input.elementHandle().catch(() => null);
            if (!handle) {
                continue;
            }

            const key = await handle.evaluate((element) => {
                const input = element as HTMLInputElement | HTMLTextAreaElement;
                const rect = input.getBoundingClientRect();
                return [
                    input.tagName,
                    input.placeholder,
                    input.name,
                    input.id,
                    Math.round(rect.left),
                    Math.round(rect.top),
                ].join('|');
            }).catch(() => '');
            if (key && seen.has(key)) {
                continue;
            }
            if (key) {
                seen.add(key);
            }

            if (!await input.isVisible({ timeout: 500 }).catch(() => false)) {
                continue;
            }

            await input.fill(value, { timeout: 5000 });
            filled += 1;
        }
    }

    if (filled > 0) {
        console.log(`Filled ${filled} ${fieldName} input(s)`);
    }

    return filled;
}
