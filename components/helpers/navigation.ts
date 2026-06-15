import { Page } from '@playwright/test';

export type ProjectTestInfo = {
    project: {
        use: {
            baseURL?: string;
        };
    };
};

/**
 * Lay homepage tu Playwright project baseURL.
 * Moi website/project se co baseURL rieng trong config/projects.config.ts.
 */
export function getProjectHomeUrl(testInfo: ProjectTestInfo) {
    const baseURL = testInfo.project.use.baseURL?.trim();
    return baseURL || '/';
}

/**
 * Parse query param an toan cho ca URL absolute va relative.
 */
export function getUrlSearchParams(url: string) {
    try {
        return new URL(url).searchParams;
    } catch {
        return new URL(url, 'http://localhost').searchParams;
    }
}

/**
 * Canh bao khi query cua homepage bi mat sau navigation, vi mot so site can query de load dung data.
 */
export async function warnIfHomepageQueryWasDropped(page: Page, homeUrl: string) {
    const expectedParams = getUrlSearchParams(homeUrl);
    if ([...expectedParams].length === 0) {
        return;
    }

    const currentParams = getUrlSearchParams(page.url());
    const droppedParams = [...expectedParams].filter(([key, value]) => currentParams.get(key) !== value);
    if (droppedParams.length > 0) {
        const expectedQuery = expectedParams.toString();
        console.warn(`Homepage query was not preserved after load. Expected query: ${expectedQuery}. Current URL: ${page.url()}`);
    }
}
