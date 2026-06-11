/// <reference types="node" />
import { expect, Page, TestInfo } from '@playwright/test';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import { CopyPage } from '../components/pages/CopyPage';

export async function runCopyFunctionality(page: Page, testInfo: TestInfo) {
        const copyPage = new CopyPage(page);
        await copyPage.ensureScreenshotDirectories();

        const websiteName = testInfo.project.name;
        const tabsForWebsite = copyPage.getTabsForWebsite(websiteName);
        const homeUrl = getProjectHomeUrl(testInfo);
        const results: { tab: string; success: boolean; screenshotPath: string | null; clipboardAttachment: string | null }[] = [];

        console.log(`\nTarget website: ${websiteName}`);
        console.log(`Tabs to test: ${tabsForWebsite.map((tab) => tab.tabName).join(' | ')}`);

        for (const tabConfig of tabsForWebsite) {
            const result = await copyPage.testCopyInTab(websiteName, tabConfig, homeUrl);
            results.push({
                tab: tabConfig.tabName,
                success: result.success,
                screenshotPath: result.screenshotPath,
                clipboardAttachment: result.clipboardAttachment,
            });
        }

        console.log(`\nCopy test summary for ${websiteName}:`);
        for (const result of results) {
            console.log(`${result.success ? 'PASS' : 'FAIL'} - ${result.tab} - ${result.clipboardAttachment || result.screenshotPath || 'Not saved'}`);
        }

        const failedTabs = results.filter((result) => !result.success).map((result) => result.tab);
        const missingClipboardTabs = results.filter((result) => result.success && !result.clipboardAttachment).map((result) => result.tab);

        await expect(failedTabs, `All configured tabs should pass. Failed tabs: ${failedTabs.join(', ') || 'none'}`).toEqual([]);
        await expect(missingClipboardTabs, `Clipboard content should be saved for every passed tab. Missing: ${missingClipboardTabs.join(', ') || 'none'}`).toEqual([]);

}

