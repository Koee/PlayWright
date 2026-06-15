/// <reference types="node" />
import { expect, Page, TestInfo } from '@playwright/test';
import { getProjectHomeUrl, warnIfHomepageQueryWasDropped } from '../components/helpers/navigation';
import { CopyPage } from '../components/pages/CopyPage';
import * as dialogHandler from '../components/helpers/dialog-handler';

/**
 * Khoi tao flow copy dung chung: tao dialog tracker, CopyPage, danh sach tab va mo homepage.
 * Hai flow copy NDS va copy theo stage deu dung ham nay de tranh lap setup.
 */
async function setupCopyFlow(page: Page, testInfo: TestInfo, dialogContext: string) {
        const websiteName = testInfo.project.name;
        const dialogTracker = dialogHandler.setupDialogTracker(page, websiteName);
        const copyPage = new CopyPage(page, dialogTracker);
        await copyPage.ensureScreenshotDirectories();
        const tabsForWebsite = copyPage.getTabsForWebsite(websiteName);
        const homeUrl = getProjectHomeUrl(testInfo);

        console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
        await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
        await warnIfHomepageQueryWasDropped(page, homeUrl);
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, dialogContext);

        return {
            websiteName,
            dialogTracker,
            copyPage,
            tabsForWebsite,
            homeUrl,
        };
}

/**
 * Flow copy NDS: moi tab chon san pham, doi QR/copy card, bam copy va luu clipboard.
 */
export async function runCopyFunctionality(page: Page, testInfo: TestInfo) {
        const {
            websiteName,
            copyPage,
            tabsForWebsite,
            homeUrl,
        } = await setupCopyFlow(page, testInfo, 'copy-initial-page-load');
        const results: { tab: string; success: boolean; screenshotPath: string | null; clipboardAttachment: string | null }[] = [];

        console.log(`\nTarget website: ${websiteName}`);
        console.log(`Tabs to test: ${tabsForWebsite.map((tab) => tab.tabName).join(' | ')}`);

        for (const tabConfig of tabsForWebsite) {
            const result = await copyPage.testCopyInTab(websiteName, tabConfig, homeUrl, {
                navigateBeforeTest: false,
            });
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

/**
 * Flow copy theo stage don hang: luu noi dung NDS, XNDH va TTDH cho tung tab.
 * Sau moi tab se reload de reset UI truoc khi sang tab tiep theo.
 */
export async function runProjectCopyStages(page: Page, testInfo: TestInfo) {
        const {
            websiteName,
            dialogTracker,
            copyPage,
            tabsForWebsite,
            homeUrl,
        } = await setupCopyFlow(page, testInfo, 'project-copy-initial-page-load');
        const results: {
            tab: string;
            success: boolean;
            stages: string[];
            screenshotPath: string | null;
        }[] = [];

        console.log(`\nTarget website: ${websiteName}`);
        console.log(`Project copy tabs to test: ${tabsForWebsite.map((tab) => tab.tabName).join(' | ')}`);

        for (let index = 0; index < tabsForWebsite.length; index++) {
            const tabConfig = tabsForWebsite[index];
            const result = await copyPage.testProjectCopyStagesInTab(websiteName, tabConfig);
            // Summary values shown in terminal after each tab finishes.
            results.push({
                tab: tabConfig.tabName,
                success: result.success,
                stages: result.stageResults.map((stage) => `${stage.stage}:${stage.clipboardAttachment}`),
                screenshotPath: result.screenshotPath,
            });

            if (index === tabsForWebsite.length - 1) {
                continue;
            }

            console.log(`Refreshing page after completing tab: ${tabConfig.tabName}`);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await warnIfHomepageQueryWasDropped(page, homeUrl);
            await dialogHandler.checkAndHandleDialog(page, dialogTracker, `project-copy-refresh-${index + 1}`);
        }

        console.log(`\nProject copy stage summary for ${websiteName}:`);
        for (const result of results) {
            console.log(`${result.success ? 'PASS' : 'FAIL'} - ${result.tab} - ${result.stages.join(' | ') || result.screenshotPath || 'Not saved'}`);
        }

        // Final assertions: every tab must save all three stage files.
        const failedTabs = results.filter((result) => !result.success).map((result) => result.tab);
        const incompleteTabs = results.filter((result) => result.success && result.stages.length !== 3).map((result) => result.tab);

        await expect(failedTabs, `All configured project copy tabs should pass. Failed tabs: ${failedTabs.join(', ') || 'none'}`).toEqual([]);
        await expect(incompleteTabs, `Each passed tab should save NDS, XNDH and TTDH. Incomplete tabs: ${incompleteTabs.join(', ') || 'none'}`).toEqual([]);
}

