import { Locator, Page } from '@playwright/test';
import * as dialogHandler from './dialog-handler';

export type ClickElementOptions = {
    visibilityTimeout: number;
    clickTimeout: number;
    waitForNav: boolean;
};

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
                if (options.waitForNav) {
                    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                }
                if (dialogTracker) {
                    const context = `${actionName.toLowerCase().replace(/\s+/g, '-')}-click`;
                    await dialogHandler.waitAndHandleDialog(page, dialogTracker, context, 500);
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
