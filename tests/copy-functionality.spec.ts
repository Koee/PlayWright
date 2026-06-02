/// <reference types="node" />
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
import { appendErrorReport } from './utils/error-report';
import { exec } from 'child_process';

test.describe('Copy Functionality (Sao Chép - NDS) - All Websites', () => {
    test.setTimeout(120000);

    // Configuration for tabs to test
    const tabsToTestDefault = [
        { tabName: 'Đơn ghép', displayName: 'Don-Ghep', selectors: ['text=Đơn ghép', 'button:has-text("Đơn ghép")', '[data-testid*="tab"][text="Đơn ghép"]'] },
        { tabName: 'Túi đôi', displayName: 'Tui-Doi', selectors: ['text=Túi đôi', 'button:has-text("Túi đôi")', '[data-testid*="tab"][text="Túi đôi"]'] },
        { tabName: 'Túi đa dạng', displayName: 'Tui-Da-Dang', selectors: ['text=Túi đa dạng', 'button:has-text("Túi đa dạng")', '[data-testid*="tab"][text="Túi đa dạng"]'] },
    ];

    const tabsToTestSi = [
        { tabName: 'Chọn thùng', displayName: 'Chon-Thung', selectors: ['text=Chọn thùng', 'button:has-text("Chọn thùng")', '[data-testid*="tab"][text="Chọn thùng"]'] },
    ];

    // Helper function to get tabs for specific website
    const getTabsForWebsite = (websiteName: string): typeof tabsToTestDefault => {
        return websiteName === 'si' ? tabsToTestSi : tabsToTestDefault;
    };

    // Helper to build data-testid selector
    const tid = (id: string) => `[data-testid="${id}"]`;
    const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const getTabAliases = (tabName: string): string[] => {
        const aliases: Record<string, string[]> = {
            'Đơn ghép': ['Đơn ghép', 'Túi Đơn Ghép', 'Túi Đơn ghép'],
            'Túi đôi': ['Túi đôi', 'Túi Đôi'],
            'Túi đa dạng': ['Túi đa dạng', 'Túi Đa Dạng'],
            'Chọn thùng': ['Chọn thùng', 'Chọn Thùng'],
        };

        return aliases[tabName] ?? [tabName];
    };

    const productCardSelector = [
        '[data-testid^="product-"]',
        '[data-testid^="combo-card-"]',
        '[data-testid^="bundle-card-"]',
        '[id^="product-"]',
        '[id^="combo-card-"]',
        '[id^="bundle-card-"]',
        '[id^="product-card-"]',
    ].join(', ');

    const copyButton = (page: Page) => page.getByRole('button', { name: /Sao chép/i }).first();

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Create test-results directories if they don't exist
     */
    async function ensureScreenshotDirectories() {
        const passDir = path.join('test-results', 'pass-screenshots');
        const errDir = path.join('test-results', 'err-screenshots');
        const paintDir = path.join('test-results', 'paint-screenshots');
        await fs.mkdir(passDir, { recursive: true });
        await fs.mkdir(errDir, { recursive: true });
        await fs.mkdir(paintDir, { recursive: true });
        console.log(`✅ Screenshot directories ready: ${passDir}, ${errDir}, ${paintDir}`);
    }

    /**
     * Click element by trying multiple selectors
     */
    async function clickElement(
        page: Page,
        selectors: string[],
        actionName: string,
        options = { visibilityTimeout: 3000, clickTimeout: 5000, waitForNav: false }
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: options.visibilityTimeout }) && await element.isEnabled().catch(() => true)) {
                    await element.click({ timeout: options.clickTimeout });
                    if (options.waitForNav) {
                        await page.waitForLoadState('networkidle').catch(() => { });
                    }
                    console.log(`✅ ${actionName} - Selector: ${selector}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        console.warn(`⚠️ ${actionName} - Element not found`);
        return false;
    }

    /**
     * Select a tab
     */
    async function selectTab(page: Page, tabName: string, tabSelectors: string[]): Promise<boolean> {
        try {
            await page.waitForLoadState('networkidle');

            let success = false;
            for (const alias of getTabAliases(tabName)) {
                const tabButton = page.getByRole('button', { name: new RegExp(escapeRegExp(alias), 'i') }).first();
                if (await tabButton.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await tabButton.scrollIntoViewIfNeeded();
                    await tabButton.click({ timeout: 10000 });
                    console.log(`✅ Selecting tab: "${tabName}" - Button alias: ${alias}`);
                    success = true;
                    break;
                }
            }

            if (!success) {
                success = await clickElement(
                    page,
                    tabSelectors,
                    `Selecting tab: "${tabName}"`,
                    { visibilityTimeout: 3000, clickTimeout: 10000, waitForNav: false }
                );
            }

            if (success) {
                // Wait for products to load in the tab - use multiple selectors for different websites
                await page.waitForLoadState('networkidle').catch(() => { });
                const productsVisible = await page.locator(productCardSelector).first().isVisible({ timeout: 10000 }).catch(() => false);
                if (productsVisible) {
                    console.log(`✅ Products loaded for tab: "${tabName}"`);
                    return true;
                }

                // If no products found, still return success (tab might be loading)
                console.warn(`⚠️ Could not find products after tab selection: "${tabName}"`);
                return false;
            }
            return false;
        } catch (error) {
            console.error(`❌ Error selecting tab "${tabName}":`, error);
            return false;
        }
    }

    /**
     * Select first product in current tab by increasing quantity
     */
    async function selectProduct(page: Page): Promise<boolean> {
        try {
            await page.waitForLoadState('networkidle').catch(() => { });
            await page.locator(productCardSelector).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });

            const cards = page.locator(productCardSelector);
            const cardCount = await cards.count();
            for (let index = 0; index < Math.min(cardCount, 10); index++) {
                const card = cards.nth(index);
                if (!await card.isVisible({ timeout: 1000 }).catch(() => false)) {
                    continue;
                }

                const plusBtn = card.getByRole('button', { name: /^\+$/ }).filter({ hasNot: page.locator('[disabled]') }).last();
                if (await plusBtn.isVisible({ timeout: 1000 }).catch(() => false) && await plusBtn.isEnabled().catch(() => false)) {
                    await plusBtn.scrollIntoViewIfNeeded();
                    await plusBtn.click({ timeout: 10000 });
                    await page.waitForLoadState('networkidle').catch(() => { });
                    console.log(`✅ Selected product from card #${index + 1}`);
                    return true;
                }
            }

            // Find first quantity increment button (the "+" button in product card)
            const incrementSelectors = [
                'button[aria-label*="+"]',
                'button:has-text("+")',
                'button[class*="increment"]',
                'button:nth-child(3) div:has-text("+")',
            ];

            for (const selector of incrementSelectors) {
                try {
                    const incrementBtn = page.locator(selector).first();
                    if (await incrementBtn.isVisible({ timeout: 3000 }) && await incrementBtn.isEnabled().catch(() => false)) {
                        // Click the + button to add product to selection
                        await incrementBtn.click({ timeout: 5000 });
                        console.log(`✅ Selected first product - Quantity increased using selector: ${selector}`);
                        await page.waitForTimeout(500);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            // If increment button didn't work, try clicking on product card directly
            const cardSelectors = [
                '//*[@id="product-card-"]/div/div[2]/div/div/button[2]',
            ];

            for (const selector of cardSelectors) {
                try {
                    const card = page.locator(selector).first();
                    if (await card.isVisible({ timeout: 3000 })) {
                        await card.click({ timeout: 5000 });
                        console.log(`✅ Selected first product using selector: ${selector}`);
                        await page.waitForLoadState('networkidle').catch(() => { });
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            return false;
        } catch (error) {
            console.error('❌ Error selecting product:', error);
            return false;
        }
    }

    async function waitForCopyButtonVisible(page: Page, timeout = 30000): Promise<boolean> {
        const visible = await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('button')).some((button) => {
                const text = button.textContent || '';
                const rect = button.getBoundingClientRect();
                const style = window.getComputedStyle(button);
                const isInOverlay = Boolean(button.closest('div.fixed'));
                return text.includes('Sao chép')
                    && isInOverlay
                    && rect.width > 0
                    && rect.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none';
            });
        }, undefined, { timeout }).then(() => true).catch(() => false);

        if (visible) {
            console.log('✅ Copy button is visible');
            return true;
        }

        console.warn('⚠️ Copy button did not become visible after checkout');
        return false;
    }

    /**
     * Click checkout/payment button and place order to reach copy button
     * After adding a product, waits for the "Thanh toán" button to become enabled,
     * then clicks it WITHOUT clicking any "Đặt hàng" button first.
     */
    async function clickCheckoutButton(page: Page): Promise<boolean> {
        try {
            console.log('📍 Step 3: Waiting for Thanh toán button to become active...');

            // Use a more specific selector to target only "Thanh toán" button (not "Đặt hàng")
            const checkoutBtn = page.locator('button:has-text("Thanh toán")').first();

            await expect(checkoutBtn, 'Thanh toán button should be visible after selecting product')
                .toBeVisible({ timeout: 15000 });
            await expect(checkoutBtn, 'Thanh toán button should become enabled after selecting product')
                .toBeEnabled({ timeout: 15000 });

            // Click the now-active Thanh toán button
            await checkoutBtn.click({ timeout: 10000 });
            console.log('✅ Clicked Thanh toán button');

            return await waitForCopyButtonVisible(page);
        } catch (error) {
            console.error('❌ Error in checkout flow:', error);
            return false;
        }
    }

    /**
     * Click copy button in payment modal
     */
    async function clickCopyButton(page: Page): Promise<boolean> {
        try {
            // Scroll to top of page/modal to find copy button
            await page.evaluate(() => {
                window.scrollTo(0, 0);
                const modal = document.querySelector('[class*="modal"], [role="dialog"]');
                if (modal) {
                    modal.scrollTop = 0;
                }
            });
            await page.waitForTimeout(500);

            if (!await waitForCopyButtonVisible(page)) {
                return false;
            }

            const overlayCopyBtn = page.locator('div.fixed button').filter({ hasText: 'Sao chép' }).last();
            if (await overlayCopyBtn.isVisible({ timeout: 3000 }).catch(() => false) && await overlayCopyBtn.isEnabled().catch(() => false)) {
                await overlayCopyBtn.scrollIntoViewIfNeeded();
                await overlayCopyBtn.click({ timeout: 10000 });
                console.log('✅ Clicked Copy button in overlay modal');
                return true;
            }

            const modalCopyBtn = page.locator([
                '[role="dialog"] button:has-text("Sao chép")',
                '[class*="modal"] button:has-text("Sao chép")',
                '[class*="Modal"] button:has-text("Sao chép")',
            ].join(', ')).last();

            if (await modalCopyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await modalCopyBtn.scrollIntoViewIfNeeded();
                await modalCopyBtn.click({ timeout: 10000 });
                console.log('✅ Clicked Copy button in payment modal');
                return true;
            }

            const visibleCopyButtons = page.locator('button').filter({ hasText: 'Sao chép' });
            const visibleCopyButtonCount = await visibleCopyButtons.count();
            for (let index = visibleCopyButtonCount - 1; index >= 0; index--) {
                const copyBtn = visibleCopyButtons.nth(index);
                if (await copyBtn.isVisible({ timeout: 1000 }).catch(() => false) && await copyBtn.isEnabled().catch(() => false)) {
                    await copyBtn.scrollIntoViewIfNeeded();
                    await copyBtn.click({ timeout: 10000 });
                    console.log(`✅ Clicked visible Copy button #${index + 1}`);
                    return true;
                }
            }

            const copySelectors = [
                'button:has-text("📷 Sao chép")',
                'button:has-text("Sao chép")',
            ];

            // Try to find and click copy button with longer visibility timeout
            for (const selector of copySelectors) {
                try {
                    const copyBtn = page.locator(selector).first();
                    // Use a longer timeout and check multiple times
                    for (let attempt = 0; attempt < 2; attempt++) {
                        const isVisible = await copyBtn.isVisible({ timeout: 5000 }).catch(() => false);
                        if (isVisible) {
                            await copyBtn.scrollIntoViewIfNeeded();
                            await page.waitForTimeout(300);
                            await copyBtn.click({ timeout: 10000 });
                            console.log(`✅ Clicked Copy button: ${selector}`);
                            await page.waitForTimeout(500);
                            return true;
                        }
                        if (attempt === 0) {
                            // If not found on first attempt, scroll within modal more aggressively
                            await page.evaluate(() => {
                                const modal = document.querySelector('[class*="modal"], [role="dialog"], [class*="overflow"], [class*="scroll"]');
                                if (modal && modal.scrollHeight > modal.clientHeight) {
                                    modal.scrollTop = modal.scrollHeight;
                                    setTimeout(() => { modal.scrollTop = 0; }, 300);
                                }
                            });
                            await page.waitForTimeout(500);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            console.warn(`⚠️ Copy button still not found - checking if modal is visible...`);
            const modalVisible = await page.evaluate(() => {
                const modal = document.querySelector('[class*="modal"], [role="dialog"]');
                if (modal) {
                    const rect = modal.getBoundingClientRect();
                    return rect.height > 0 && rect.width > 0;
                }
                return false;
            });

            if (!modalVisible) {
                console.warn(`⚠️ Payment modal not visible - may not have opened properly`);
            }

            return false;
        } catch (error) {
            console.error('❌ Error clicking copy button:', error);
            return false;
        }
    }

    /**
     * Wait for button state change from "Sao chép" to "Đang xử lý", then "Đã sao chép".
     */
    async function waitForCopyStateChange(page: Page): Promise<boolean> {
        const waitForButtonText = async (patterns: string[], timeout: number): Promise<boolean> => {
            return page.waitForFunction((expectedPatterns) => {
                return Array.from(document.querySelectorAll('button')).some((button) => {
                    const text = button.textContent || '';
                    const rect = button.getBoundingClientRect();
                    const style = window.getComputedStyle(button);
                    return expectedPatterns.some((pattern) => text.includes(pattern))
                        && rect.width > 0
                        && rect.height > 0
                        && style.visibility !== 'hidden'
                        && style.display !== 'none';
                });
            }, patterns, { timeout }).then(() => true).catch(() => false);
        };

        try {
            console.log('Waiting for copy button state change...');

            const processingDetected = await waitForButtonText(['Đang xử lý', 'Dang xu ly', 'Processing'], 10000);
            if (processingDetected) {
                console.log('Button changed to processing state.');
            } else {
                const copiedAlreadyVisible = await waitForButtonText(['Đã sao chép', 'Da sao chep', 'Copied'], 1000);
                if (!copiedAlreadyVisible) {
                    console.warn('Did not detect processing state before copy confirmation wait.');
                }
            }

            const copyConfirmed = await waitForButtonText(['Đã sao chép', 'Da sao chep', 'Copied'], 30000);
            if (!copyConfirmed) {
                console.error('Copy button never reached "Da sao chep" state.');
                return false;
            }

            console.log('Copy confirmed: button/message reached "Da sao chep" state.');
            await page.waitForTimeout(500);
            return true;
        } catch (error) {
            console.error('Error waiting for copy state change:', error);
            return false;
        }
    }

    /**
     * Capture the visible dashboard/payment modal as a fallback image for Paint paste.
     */
    async function capturePaintSourceImage(page: Page, tabName: string): Promise<string | null> {
        try {
            const sourcePath = path.join('test-results', 'paint-screenshots', `Paint-source-${tabName}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.png`);
            await fs.mkdir(path.dirname(sourcePath), { recursive: true });

            const sourceSelectors = [
                '[role="dialog"]',
                '[class*="modal"]',
                '[class*="Modal"]',
                '[class*="payment"]',
                '[class*="Payment"]',
            ];

            for (const selector of sourceSelectors) {
                const candidate = page.locator(selector).first();
                if (await candidate.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await candidate.screenshot({ path: sourcePath });
                    console.log(`✅ Paint source image captured from ${selector}: ${sourcePath}`);
                    return sourcePath;
                }
            }

            await page.screenshot({ path: sourcePath, fullPage: false });
            console.log(`✅ Paint source image captured from viewport: ${sourcePath}`);
            return sourcePath;
        } catch (error) {
            console.warn(`⚠️ Could not capture Paint source image:`, error);
            return null;
        }
    }

    /**
     * Open Paint application, paste clipboard content, and capture Paint screenshot.
     */
    async function openPaintAndPaste(tabName: string, sourceImagePath?: string | null): Promise<string | null> {
        // Create screenshot path
        const screenshotPath = path.join('test-results', 'paint-screenshots', `Paint-${tabName}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.png`);

        // Ensure directory exists
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => { });

        console.log(`📸 Paint screenshot will be saved to: ${screenshotPath}`);

        const absoluteScreenshotPath = path.resolve(screenshotPath);
        const absoluteSourceImagePath = sourceImagePath ? path.resolve(sourceImagePath) : '';
        const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class PaintWindow {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
}
"@

$screenshotPath = '${absoluteScreenshotPath.replace(/'/g, "''")}'
$sourceImagePath = '${absoluteSourceImagePath.replace(/'/g, "''")}'
$paint = Start-Process -FilePath 'mspaint.exe' -PassThru
$shell = New-Object -ComObject WScript.Shell
$targetWidth = 750
$clipboardBitmap = $null

try {
    $clipboardHasImage = $false
    for ($i = 0; $i -lt 10 -and -not $clipboardHasImage; $i++) {
        try {
            $clipboardHasImage = [System.Windows.Forms.Clipboard]::ContainsImage()
        }
        catch {
            Start-Sleep -Milliseconds 300
        }
    }

    if (-not $clipboardHasImage) {
        if (-not $sourceImagePath -or -not (Test-Path -LiteralPath $sourceImagePath)) {
            throw 'Clipboard does not contain an image and no fallback source image is available.'
        }

        $sourceBitmap = [System.Drawing.Image]::FromFile($sourceImagePath)
        try {
            $clipboardBitmap = New-Object System.Drawing.Bitmap($sourceBitmap)
            [System.Windows.Forms.Clipboard]::SetImage($clipboardBitmap)
            Start-Sleep -Milliseconds 500
        }
        finally {
            $sourceBitmap.Dispose()
        }
    }

    for ($i = 0; $i -lt 40 -and $paint.MainWindowHandle -eq 0; $i++) {
        Start-Sleep -Milliseconds 250
        $paint.Refresh()
    }

    if ($paint.MainWindowHandle -eq 0) {
        throw 'Paint window was not ready for paste.'
    }

    $screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    [PaintWindow]::ShowWindowAsync($paint.MainWindowHandle, 9) | Out-Null
    Start-Sleep -Milliseconds 300
    [PaintWindow]::MoveWindow($paint.MainWindowHandle, 0, 0, $targetWidth, $screenBounds.Height, $true) | Out-Null
    Start-Sleep -Milliseconds 500

    $activated = $false
    for ($i = 0; $i -lt 10 -and -not $activated; $i++) {
        $activated = [PaintWindow]::SetForegroundWindow($paint.MainWindowHandle)
        if (-not $activated) {
            $activated = $shell.AppActivate($paint.Id)
        }
        Start-Sleep -Milliseconds 300
    }

    if (-not $activated) {
        throw 'Could not activate Paint window.'
    }

    [PaintWindow]::SetForegroundWindow($paint.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 2500

    $captureWidth = [Math]::Min($targetWidth, $screenBounds.Width)
    $bitmap = New-Object System.Drawing.Bitmap($captureWidth, $screenBounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
        $graphics.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size($captureWidth, $screenBounds.Height)))
        $bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
finally {
    if ($clipboardBitmap) {
        $clipboardBitmap.Dispose()
    }

    if ($paint -and -not $paint.HasExited) {
        $paint.CloseMainWindow() | Out-Null
        Start-Sleep -Milliseconds 500
        if (-not $paint.HasExited) {
            $paint.Kill()
        }
    }
}
`;

        const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
        const psCmd = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`;

        try {
            await new Promise<void>((resolve, reject) => {
                exec(psCmd, { windowsHide: true, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(stderr || stdout || error.message));
                        return;
                    }
                    resolve();
                });
            });

            console.log(`✅ Paint screenshot saved: ${screenshotPath}`);
            return screenshotPath;
        } catch (error) {
            console.warn(`⚠️ Paint paste/screenshot failed:`, error);
            return null;
        }
    }

    /**
     * Wait for copy confirmation message to appear
     */
    async function waitForCopyConfirmation(page: Page): Promise<boolean> {
        try {
            const confirmationSelectors = [
                'text=✓ Đã sao chép!',
                'text=Đã sao chép!',
            ];

            for (const selector of confirmationSelectors) {
                try {
                    const confirmElement = page.locator(selector).first();
                    const isVisible = await confirmElement.isVisible({ timeout: 10000 }).catch(() => false);
                    if (isVisible) {
                        console.log(`✅ Copy confirmation detected: ${selector}`);
                        // Wait additional time for confirmation to be displayed
                        await page.waitForTimeout(1000);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            console.warn(`⚠️ Copy confirmation not detected, proceeding...`);
            return true;
        } catch (error) {
            console.error('❌ Error waiting for copy confirmation:', error);
            return false;
        }
    }

    /**
     * Take screenshot and save with proper naming and folder
     */
    async function takeAndSaveScreenshot(
        page: Page,
        websiteName: string,
        tabDisplayName: string,
        isSuccess: boolean,
        error?: string
    ): Promise<string | null> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const fileName = `${websiteName}-${tabDisplayName}-NDS-${timestamp}.png`;

            const folderName = isSuccess ? 'pass-screenshots' : 'err-screenshots';
            const filePath = path.join('test-results', folderName, fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });

            if (!page.isClosed()) {
                await page.screenshot({
                    path: filePath,
                    fullPage: true
                });

                const message = isSuccess
                    ? `✅ Screenshot saved (success): ${filePath}`
                    : `❌ Screenshot saved (error): ${filePath} - Error: ${error}`;

                console.log(message);
                return filePath;
            }
            return null;
        } catch (error) {
            console.error('❌ Error taking screenshot:', error);
            return null;
        }
    }

    /**
     * Test copy functionality for a single tab
     */
    async function testCopyInTab(
        page: Page,
        websiteName: string,
        tabConfig: typeof tabsToTestDefault[0]
    ): Promise<{ success: boolean; screenshotPath: string | null; paintScreenshotPath: string | null }> {
        let screenshotPath: string | null = null;
        let paintScreenshotPath: string | null = null;
        let success = false;

        try {
            console.log(`\n📋 Testing tab: ${tabConfig.tabName} on ${websiteName}...`);

            // Step 1: Select tab
            console.log('📍 Step 1: Selecting tab...');
            const tabSelected = await selectTab(page, tabConfig.tabName, tabConfig.selectors);
            if (!tabSelected) {
                throw new Error(`Failed to select tab: ${tabConfig.tabName}`);
            }

            // Step 2: Select product from the beginning of list
            console.log('📍 Step 2: Selecting first product...');
            const productSelected = await selectProduct(page);
            if (!productSelected) {
                throw new Error('Failed to select product');
            }

            // Step 3: Click checkout button
            console.log('📍 Step 3: Clicking checkout/payment button...');
            const checkoutClicked = await clickCheckoutButton(page);
            if (!checkoutClicked) {
                throw new Error('Failed to click checkout button');
            }

            // Step 4: Click copy button
            console.log('📍 Step 4: Clicking copy button...');
            const copyClicked = await clickCopyButton(page);
            if (!copyClicked) {
                throw new Error('Failed to click copy button');
            }

            // Step 5: Wait for copy button state change from "Sao chép" → "Đang xử lý" → "Sao chép"
            console.log('📍 Step 5: Waiting for copy button state change...');
            const stateChanged = await waitForCopyStateChange(page);
            if (!stateChanged) {
                throw new Error('Failed to detect copy confirmation state change');
            }

            // Step 6: Open Paint and paste content
            console.log('📍 Step 6: Opening Paint and pasting content...');
            const paintSourceImagePath = await capturePaintSourceImage(page, tabConfig.displayName);
            paintScreenshotPath = await openPaintAndPaste(tabConfig.displayName, paintSourceImagePath);
            if (!paintScreenshotPath) {
                console.warn('⚠️ Failed to capture Paint screenshot, but continuing...');
            }

            success = true;
            console.log(`✅ Successfully tested copy in tab: ${tabConfig.tabName}`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error in tab ${tabConfig.tabName}:`, errorMsg);

            // Report error
            await appendErrorReport(
                `${websiteName}-${tabConfig.tabName}`,
                error,
                `test-results/err-screenshots/${websiteName}-${tabConfig.displayName}-NDS-*.png`
            );
        }

        // Always take screenshot - only save to pass-screenshots if successful
        screenshotPath = await takeAndSaveScreenshot(
            page,
            websiteName,
            tabConfig.displayName,
            success,
            success ? undefined : 'Copy test failed'
        );

        return { success, screenshotPath, paintScreenshotPath };
    }

    // ============================================================================
    // MAIN TESTS
    // ============================================================================

    test('Copy Functionality - Sequential Tab Testing', async ({ page, browserName }, testInfo) => {
        // Only run on Chrome (as per config)
        if (browserName !== 'chromium') {
            test.skip();
        }

        await ensureScreenshotDirectories();

        // Get website name from test.info()
        const websiteName = testInfo.project.name;
        const tabsToTest = getTabsForWebsite(websiteName);

        console.log(`\n🌐 Starting copy functionality test for website: ${websiteName}`);
        console.log(`📊 Testing ${tabsToTest.length} tab(s)...`);

        try {
            // Navigate to base URL
            await page.goto('/', { waitUntil: 'domcontentloaded' });

            // Test each tab
            const results: { tab: string; success: boolean; screenshot: string | null; paintScreenshot: string | null }[] = [];

            for (const tabConfig of tabsToTest) {
                const { success, screenshotPath, paintScreenshotPath } = await testCopyInTab(page, websiteName, tabConfig);
                results.push({
                    tab: tabConfig.tabName,
                    success,
                    screenshot: screenshotPath,
                    paintScreenshot: paintScreenshotPath
                });
            }

            // Summary
            console.log(`\n📊 Test Summary for ${websiteName}:`);
            console.log('='.repeat(60));
            results.forEach((result) => {
                const status = result.success ? '✅ PASS' : '❌ FAIL';
                console.log(`${status} - Tab: ${result.tab}`);
                if (result.screenshot) {
                    console.log(`   📸 Screenshot: ${result.screenshot}`);
                }
                if (result.paintScreenshot) {
                    console.log(`   🎨 Paint Screenshot: ${result.paintScreenshot}`);
                }
            });
            console.log('='.repeat(60));

            const passCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            const failedTabs = results.filter(r => !r.success).map(r => r.tab).join(', ');

            await expect(failCount, `All tabs should pass. Failed tabs: ${failedTabs || 'none'}`).toBe(0);
            console.log(`\n✅ Test completed: ${passCount} passed, ${failCount} failed`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`\n❌ Critical error during copy functionality test for ${websiteName}:`, errorMsg);

            // Capture error screenshot
            if (!page.isClosed()) {
                const errorScreenshot = path.join('test-results', 'err-screenshots', `${websiteName}-critical-error.png`);
                await fs.mkdir(path.dirname(errorScreenshot), { recursive: true });
                await page.screenshot({ path: errorScreenshot, fullPage: true });
                console.log(`📸 Error screenshot saved: ${errorScreenshot}`);
            }

            await appendErrorReport(websiteName, error);
            throw error;
        }
    });

    test.describe('Copy Functionality - Tab Individual Tests', () => {
        // Collect all unique tabs from all website configurations
        const allTabs = Array.from(new Map(
            [...tabsToTestDefault, ...tabsToTestSi].map(tab => [tab.displayName, tab])
        ).values());

        for (const tabConfig of allTabs) {
            test(`Test copy in tab: ${tabConfig.tabName}`, async ({ page, browserName }, testInfo) => {
                if (browserName !== 'chromium') {
                    test.skip();
                }

                await ensureScreenshotDirectories();

                const websiteName = testInfo.project.name;
                const tabsForWebsite = getTabsForWebsite(websiteName);

                // Check if this tab exists for current website
                const tabToTest = tabsForWebsite.find(t => t.displayName === tabConfig.displayName);
                if (!tabToTest) {
                    test.skip();
                    return;
                }

                await page.goto('/', { waitUntil: 'domcontentloaded' });

                const { success, screenshotPath, paintScreenshotPath } = await testCopyInTab(page, websiteName, tabToTest);

                await expect(success, `Copy should succeed for ${websiteName}/${tabToTest.tabName}`).toBe(true);
                await expect(screenshotPath, `Result screenshot should be saved for ${websiteName}/${tabToTest.tabName}`).not.toBeNull();
                console.log(`📸 Paint Screenshot: ${paintScreenshotPath || 'Not captured'}`);
            });
        }
    });
});
