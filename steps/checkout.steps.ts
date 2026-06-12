/// <reference types="node" />
import { expect, Page, TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { getProjectHomeUrl, warnIfHomepageQueryWasDropped } from '../components/helpers/navigation';
import * as dialogHandler from '../components/helpers/dialog-handler';
import { CheckoutPage } from '../components/pages/CheckoutPage';
import { InvoicePage } from '../components/pages/InvoicePage';
import { appendErrorReport } from '../utils/reportUtils';

function buildTestCustomer() {
    return {
        name: process.env.TEST_CUSTOMER_NAME || `Test Customer ${Date.now()}`,
        phone: process.env.TEST_CUSTOMER_PHONE || `09${Date.now().toString().slice(-8)}`,
    };
}

export async function completeCheckoutFlow(page: Page, testInfo: TestInfo) {
    const testCustomer = buildTestCustomer();
    const websiteName = testInfo.project.name;
    let dialogTracker: dialogHandler.DialogTracker | undefined;
    console.log(`\n${'='.repeat(80)}\nStarting checkout flow: ${websiteName}\n${'='.repeat(80)}`);

    try {
        // Inject script to suppress native print dialog BEFORE navigation
        await page.addInitScript(() => {
            window.print = () => {
                console.log('Print called, preventing default behavior');
                window.dispatchEvent(new CustomEvent('printRequested'));
            };
        });

        // -------------------------------------------------------
        // SET UP GLOBAL DIALOG TRACKER (alert/confirm/prompt)
        // This must be done BEFORE any step that could trigger a dialog.
        // The handler is synchronous - it stores the dialog reference
        // without dismissing it, so we can capture a CDP screenshot.
        // -------------------------------------------------------
        dialogTracker = dialogHandler.setupDialogTracker(page);
        const checkoutPage = new CheckoutPage(page, dialogTracker);
        const invoicePage = new InvoicePage(page);

        const homeUrl = getProjectHomeUrl(testInfo);
        console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
        await page.goto(homeUrl);
        // Wait for page to be fully interactive instead of fixed timeout
        await page.waitForLoadState('domcontentloaded');
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
            console.warn('Page did not reach networkidle during initial load, continuing with DOM-ready state.');
        });
        await warnIfHomepageQueryWasDropped(page, homeUrl);

        // Check for dialog that might have appeared during navigation
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'page-load');

        // PRIORITY CHECK: Detect API errors at page load before proceeding
        console.log('WAIT Checking for early page load errors...');
        const earlyError = await invoicePage.checkEarlyPageErrors(testInfo);
        if (earlyError) {
            throw new Error('API error detected at initial page load - unable to proceed with test');
        }
        console.log('OK No early page errors detected, continuing...');

        console.log('Step 2: Selecting tab...');
        await checkoutPage.selectTab(websiteName);
        // Check for API errors after selecting tab
        let apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'select-tab');
        if (apiError) throw new Error('API error detected after selecting tab');
        // Check for dialog that might have appeared during tab selection
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'select-tab');

        console.log('Step 3: Clicking "+" button to add product...');
        await checkoutPage.clickAddProductButton();
        // Check for API errors after adding product
        apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'add-product');
        if (apiError) throw new Error('API error detected after adding product');
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'add-product');

        console.log('Step 4: Proceeding to checkout...');
        await checkoutPage.proceedToCheckout();
        // Check for API errors after proceeding to checkout
        apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'proceed-checkout');
        if (apiError) throw new Error('API error detected during checkout');
        // Check for dialog that might have appeared during proceed to checkout
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'proceed-checkout');

        console.log('Step 5: Confirming payment...');
        await checkoutPage.confirmPayment();
        // Check for API errors after confirming payment
        apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'confirm-payment');
        if (apiError) throw new Error('API error detected after confirming payment');
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'confirm-payment');

        console.log('Step 6: Filling customer information...');
        await checkoutPage.fillCustomerInfo(testCustomer);
        // Check for API errors after filling customer info
        apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'fill-info');
        if (apiError) throw new Error('API error detected after filling customer information');
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'fill-info');

        console.log('Step 7: Completing order...');
        await checkoutPage.completeOrder();
        // Check for API errors after completing order
        apiError = await invoicePage.checkAndCaptureApiError(testInfo, 'complete-order');
        if (apiError) throw new Error('API error detected after completing order');
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'complete-order');

        console.log('Step 8: Capturing invoice...');
        const invoiceScreenshotPath = await invoicePage.captureInvoice(testInfo);
        await expect(
            invoiceScreenshotPath,
            `Invoice screenshot should be captured for ${websiteName}`
        ).toBeTruthy();

        console.log(`${'='.repeat(80)}\nOK Checkout completed successfully for: ${websiteName}\n${'='.repeat(80)}\n`);

    } catch (error) {
        let errorForReport = error as Error;
        let dialogScreenshotPath: string | undefined;

        if (dialogTracker?.dialog || dialogTracker?.lastDialog) {
            try {
                const pendingDialog = await dialogHandler.capturePendingDialogError(page, dialogTracker, 'unhandled-dialog');
                if (pendingDialog) {
                    errorForReport = pendingDialog.error;
                    dialogScreenshotPath = pendingDialog.screenshotPath;
                }
            } catch (dialogError) {
                console.warn(`WARN Could not capture pending browser dialog: ${(dialogError as Error).message}`);
            }
        }

        console.error(`\nERROR Error during checkout for ${websiteName}:`, errorForReport);

        // Use absolute path for screenshot inside test-results/err-screenshots folder
        const errorScreenshot = path.resolve(process.cwd(), 'test-results', 'err-screenshots', `${websiteName}_error.png`);
        let screenshotSaved = false;
        let screenshotPathForReport: string | undefined;
        const errorMessage = errorForReport.message || '';
        const existingScreenshot = errorMessage.match(/Screenshot:\s*([^\r\n]+)/)?.[1]?.trim();

        if (dialogScreenshotPath) {
            screenshotSaved = await fs.access(path.resolve(process.cwd(), dialogScreenshotPath)).then(() => true).catch(() => false);
            screenshotPathForReport = dialogScreenshotPath;
        } else if (existingScreenshot) {
            const existingScreenshotPath = path.resolve(process.cwd(), existingScreenshot);
            screenshotSaved = await fs.access(existingScreenshotPath).then(() => true).catch(() => false);
            screenshotPathForReport = existingScreenshot;
        }

        if (!screenshotSaved && !page.isClosed()) {
            try {
                await dialogHandler.captureFailureState(page, errorScreenshot);
                screenshotSaved = await fs.access(errorScreenshot).then(() => true).catch(() => false);
                if (screenshotSaved) {
                    console.log(`Error screenshot saved to: ${errorScreenshot}`);
                } else {
                    await fs.mkdir(path.dirname(errorScreenshot), { recursive: true });
                    // Try CDP screenshot first (captures native dialogs if any are still showing)
                    try {
                        const cdpSession = await page.context().newCDPSession(page);
                        const { data } = await cdpSession.send('Page.captureScreenshot', {
                            format: 'png',
                            fromSurface: true,
                        });
                        const buffer = Buffer.from(data, 'base64');
                        await fs.writeFile(errorScreenshot, buffer);
                        console.log(`OK Error screenshot saved (CDP) to: ${errorScreenshot}`);
                    } catch (cdpError) {
                        // Fallback to regular screenshot
                        await page.screenshot({ path: errorScreenshot, fullPage: true });
                        console.log(`OK Error screenshot saved (fallback) to: ${errorScreenshot}`);
                    }
                    screenshotSaved = true;
                }
                // Use relative path from project root for the report (more portable)
                screenshotPathForReport = screenshotPathForReport || path.join('test-results', 'err-screenshots', `${websiteName}_error.png`);
            } catch (screenshotError) {
                console.warn(`WARN Could not take failure screenshot: ${(screenshotError as Error).message}`);
            }
        } else {
            console.warn('WARN Cannot capture failure screenshot because the page is already closed.');
        }

        // Append a Vietnamese error report entry
        console.log(`REPORT Attempting to write error report for ${websiteName}...`);
        try {
            await appendErrorReport(websiteName, errorForReport, screenshotSaved ? screenshotPathForReport : undefined);
            console.log(`OK Error report written successfully for ${websiteName}`);
        } catch (reportError) {
            console.error(`ERROR Failed to write error report for ${websiteName}: ${(reportError as Error).message}`);
            console.error(`   Stack: ${(reportError as Error).stack}`);
        }

        throw errorForReport;
    }

}

