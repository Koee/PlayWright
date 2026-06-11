import { Page } from '@playwright/test';

export type ProjectTestInfo = {
    project: {
        use: {
            baseURL?: string;
        };
    };
};

export function getProjectHomeUrl(testInfo: ProjectTestInfo) {
    const baseURL = testInfo.project.use.baseURL?.trim();
    return baseURL || '/';
}

export function getUrlSearchParams(url: string) {
    try {
        return new URL(url).searchParams;
    } catch {
        return new URL(url, 'http://localhost').searchParams;
    }
}

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
