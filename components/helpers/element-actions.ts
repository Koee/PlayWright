import { Page } from '@playwright/test';
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
    fieldName: string
): Promise<boolean> {
    for (const selector of selectors) {
        try {
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
