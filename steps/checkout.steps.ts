/// <reference types="node" />
import { expect, Page, TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { randomInt } from 'crypto';
import { getProjectHomeUrl, warnIfHomepageQueryWasDropped } from '../components/helpers/navigation';
import * as dialogHandler from '../components/helpers/dialog-handler';
import { waitForDomReady } from '../components/helpers/element-actions';
import { CheckoutPage } from '../components/pages/CheckoutPage';
import { InvoicePage } from '../components/pages/InvoicePage';
import { appendErrorReport } from '../utils/reportUtils';

let checkoutCustomerSequence = 0;

/**
 * Tuy chon bo sung cho checkout flow.
 * runLabel dung khi mot testcase goi flow nhieu lan va can tach rieng screenshot/report tung lan.
 */
export type CompleteCheckoutFlowOptions = {
    runLabel?: string;
};

/**
 * Chuan hoa mot phan ten file de co the dung an toan cho screenshot/report artifact.
 */
function safeArtifactPart(value: string) {
    return value.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

/**
 * Tao ten artifact theo website va runLabel.
 * Vi du: "si-order-01" giup anh pass/err cua bulk test khong bi ghi de.
 */
function buildArtifactName(websiteName: string, runLabel?: string) {
    return safeArtifactPart(runLabel ? `${websiteName}-${runLabel}` : websiteName);
}

/**
 * Tao day so duy nhat cho phone test ma khong phu thuoc Date.now().
 */
function buildUniqueNumericSuffix(length: number) {
    checkoutCustomerSequence += 1;
    const sequencePartLength = Math.min(3, length);
    const sequencePart = String(checkoutCustomerSequence % (10 ** sequencePartLength)).padStart(sequencePartLength, '0');
    const randomPartLength = length - sequencePartLength;
    const randomPart = randomPartLength > 0
        ? String(randomInt(0, 10 ** randomPartLength)).padStart(randomPartLength, '0')
        : '';

    return `${randomPart}${sequencePart}`;
}

/**
 * Tao data khach hang test cho checkout flow.
 * Env co the override ten/phone, con lai sinh unique theo run de tranh trung data.
 */
function buildTestCustomer(runLabel?: string) {
    // Test customer data declaration. Env values override the default generated data.
    const customerId = safeArtifactPart(runLabel || `customer-${checkoutCustomerSequence + 1}`);
    const namePrefix = process.env.TEST_CUSTOMER_NAME || 'Test Customer';
    const phonePrefix = process.env.TEST_CUSTOMER_PHONE?.replace(/\D/g, '').slice(0, 3) || '09';
    const phoneSuffixLength = Math.max(10 - phonePrefix.length, 1);
    const phoneSuffix = buildUniqueNumericSuffix(phoneSuffixLength);

    return {
        name: `${namePrefix} ${customerId}`,
        phone: `${phonePrefix}${phoneSuffix}`.slice(0, 10),
    };
}

/**
 * Flow checkout tong: mo website, chon san pham, dat hang, chup invoice va ghi report khi loi.
 * File spec chi nen goi ham nay, moi thao tac UI chi tiet nam trong CheckoutPage/InvoicePage.
 */
export async function completeCheckoutFlow(page: Page, testInfo: TestInfo, options: CompleteCheckoutFlowOptions = {}) {
    const websiteName = testInfo.project.name;
    // Artifact name duoc gan them runLabel de test dat nhieu don khong ghi de anh pass/err cua nhau.
    const artifactName = buildArtifactName(websiteName, options.runLabel);
    const testCustomer = buildTestCustomer(artifactName);
    const artifactTestInfo = { ...testInfo, artifactName };
    let dialogTracker: dialogHandler.DialogTracker | undefined;
    console.log(`\n${'='.repeat(80)}\nStarting checkout flow: ${artifactName}\n${'='.repeat(80)}`);

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
        dialogTracker = dialogHandler.setupDialogTracker(page, artifactName);
        const checkoutPage = new CheckoutPage(page, dialogTracker);
        const invoicePage = new InvoicePage(page, dialogTracker);

        // Project homepage URL comes from Playwright project baseURL.
        const homeUrl = getProjectHomeUrl(testInfo);
        console.log(`Step 1: Navigating to homepage: ${homeUrl}`);
        await page.goto(homeUrl);
        await waitForDomReady(page);
        await warnIfHomepageQueryWasDropped(page, homeUrl);

        // Check for dialog that might have appeared during navigation
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'page-load');

        // PRIORITY CHECK: Detect API errors at page load before proceeding
        console.log('WAIT Checking for early page load errors...');
        const earlyError = await invoicePage.checkEarlyPageErrors(artifactTestInfo);
        if (earlyError) {
            throw new Error(`API error detected at initial page load - unable to proceed with test. Screenshot: ${earlyError}`);
        }
        console.log('OK No early page errors detected, continuing...');

        console.log('Step 2: Selecting tab...');
        await checkoutPage.selectTab(websiteName);
        // Check for API errors after selecting tab
        let apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'select-tab');
        if (apiError) throw new Error(`API error detected after selecting tab. Screenshot: ${apiError}`);
        // Check for dialog that might have appeared during tab selection
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'select-tab');

        console.log('Step 3: Clicking "+" button to add product...');
        await checkoutPage.clickAddProductButton();
        // Check for API errors after adding product
        apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'add-product');
        if (apiError) throw new Error(`API error detected after adding product. Screenshot: ${apiError}`);
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'add-product');

        console.log('Step 4: Proceeding to checkout...');
        await checkoutPage.proceedToCheckout();
        // Check for API errors after proceeding to checkout
        apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'proceed-checkout');
        if (apiError) throw new Error(`API error detected during checkout. Screenshot: ${apiError}`);
        // Check for dialog that might have appeared during proceed to checkout
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'proceed-checkout');

        console.log('Step 5: Confirming payment...');
        await checkoutPage.confirmPayment();
        // Check for API errors after confirming payment
        apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'confirm-payment');
        if (apiError) throw new Error(`API error detected after confirming payment. Screenshot: ${apiError}`);
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'confirm-payment');

        console.log('Step 6: Filling customer information...');
        await checkoutPage.fillCustomerInfo(testCustomer);
        // Check for API errors after filling customer info
        apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'fill-info');
        if (apiError) throw new Error(`API error detected after filling customer information. Screenshot: ${apiError}`);
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'fill-info');

        console.log('Step 7: Completing order...');
        await checkoutPage.completeOrder();
        // Check for API errors after completing order
        apiError = await invoicePage.checkAndCaptureApiError(artifactTestInfo, 'complete-order');
        if (apiError) throw new Error(`API error detected after completing order. Screenshot: ${apiError}`);
        await dialogHandler.checkAndHandleDialog(page, dialogTracker, 'complete-order');

        console.log('Step 8: Capturing invoice...');
        const invoiceScreenshotPath = await invoicePage.captureInvoice(artifactTestInfo);
        await expect(
            invoiceScreenshotPath,
            `Invoice screenshot should be captured for ${artifactName}`
        ).toBeTruthy();

        console.log(`${'='.repeat(80)}\nOK Checkout completed successfully for: ${artifactName}\n${'='.repeat(80)}\n`);

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

        console.error(`\nERROR Error during checkout for ${artifactName}:`, errorForReport);

        // Checkout failure screenshot file name and save location.
        const errorScreenshot = path.resolve(process.cwd(), 'test-results', 'err-screenshots', `${artifactName}_error.png`);
        let screenshotSaved = false;
        let screenshotPathForReport: string | undefined;
        const errorMessage = errorForReport.message || '';
        const existingScreenshot = errorMessage.match(/(?:See\s+)?screenshot:\s*([^\r\n]+)/i)?.[1]?.trim();

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
                        await page.screenshot({ path: errorScreenshot, fullPage: false });
                        console.log(`OK Error screenshot saved (fallback) to: ${errorScreenshot}`);
                    }
                    screenshotSaved = true;
                }
                // Relative screenshot path written into report-loi.* files.
                screenshotPathForReport = screenshotPathForReport || path.join('test-results', 'err-screenshots', `${artifactName}_error.png`);
            } catch (screenshotError) {
                console.warn(`WARN Could not take failure screenshot: ${(screenshotError as Error).message}`);
            }
        } else {
            console.warn('WARN Cannot capture failure screenshot because the page is already closed.');
        }

        // Append a Vietnamese error report entry
        console.log(`REPORT Attempting to write error report for ${artifactName}...`);
        try {
            await appendErrorReport(artifactName, errorForReport, screenshotSaved ? screenshotPathForReport : undefined);
            console.log(`OK Error report written successfully for ${artifactName}`);
        } catch (reportError) {
            console.error(`ERROR Failed to write error report for ${artifactName}: ${(reportError as Error).message}`);
            console.error(`   Stack: ${(reportError as Error).stack}`);
        }

        throw errorForReport;
    }

}

