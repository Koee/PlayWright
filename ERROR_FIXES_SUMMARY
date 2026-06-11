# Error Fixes Summary: Invoice Screenshot and Error Report Issues

## Problem Description
The test automation was encountering errors when trying to capture invoice screenshots and generate error reports:
- `locator._expect: Target page, context or browser has been closed`
- `page.screenshot: Target page, context or browser has been closed`
- Cannot capture invoice error screenshot because the page is already closed
- Cannot create error report via `appendErrorReport`

## Root Causes
1. **Page/Context Closure**: When errors occurred during invoice capture, the page or browser context might already be closed, causing subsequent operations to fail.
2. **Missing Error Handling**: The code didn't properly check if the page was closed before attempting operations.
3. **Cascading Failures**: When one operation failed due to page closure, fallback operations also failed because they didn't check the page state.

## Fixes Applied

### 1. Fixed `captureInvoiceErrorState` Function (Lines 388-423)
**Changes:**
- Added check for `page.isClosed()` at the beginning
- Added specific error handling for "has been closed" and "Target page" errors
- Ensured directory creation before screenshot
- Returns `false` gracefully when page is closed

**Before:**
```typescript
async function captureInvoiceErrorState(page: Page, testInfo: any): Promise<boolean> {
    // No check for page closure
    const errorRegex = /.../i;
    // ... could fail if page closed
}
```

**After:**
```typescript
async function captureInvoiceErrorState(page: Page, testInfo: any): Promise<boolean> {
    // Check if page is closed before attempting any operations
    if (page.isClosed()) {
        console.warn('⚠️ Page is closed; cannot check for invoice error state');
        return false;
    }
    // ... rest of implementation with proper error handling
}
```

### 2. Fixed `captureInvoiceScreenshot` Function (Lines 425-497)
**Changes:**
- Added check for `page.isClosed()` at the beginning
- Enhanced error handling to detect page closure errors
- Only attempts fallback screenshot if page is still open
- Returns empty string when page is closed instead of throwing
- Added proper error message checking for "has been closed" and "Target page"

**Key Improvements:**
```typescript
async function captureInvoiceScreenshot(page: Page, testInfo: any): Promise<string> {
    try {
        // Check if page is closed before starting
        if (page.isClosed()) {
            console.warn('⚠️ Page is closed; cannot capture invoice screenshot');
            return '';
        }
        // ... main logic
    } catch (error) {
        const errorMsg = (error as Error).message;
        
        // Check if error is due to closed page/context
        if (errorMsg.includes('has been closed') || 
            errorMsg.includes('Target page') || 
            page.isClosed()) {
            console.warn('⚠️ Page/context closed during invoice capture; cannot take fallback screenshot');
            return '';
        }
        
        // Fallback: full page screenshot (only if page is still open)
        if (!page.isClosed()) {
            try {
                await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                await page.screenshot({ path: screenshotPath, fullPage: true });
                return screenshotPath;
            } catch (fallbackError) {
                console.warn(`⚠️ Could not take fallback screenshot: ${(fallbackError as Error).message}`);
            }
        }
        return '';
    }
}
```

### 3. Fixed Main `captureInvoice` Function (Lines 499-551)
**Changes:**
- Improved error handling in the main try-catch block
- Check for page closure before attempting error screenshots
- Only waits for network idle if page is still open
- Better handling of closed page scenarios

**Key Improvements:**
```typescript
try {
    // ... main logic
} catch (error) {
    const errorMsg = (error as Error).message;
    console.warn(`⚠️ Error in invoice capture process: ${errorMsg}`);

    // Check if error is due to closed page
    if (errorMsg.includes('has been closed') || 
        errorMsg.includes('Target page') || 
        page.isClosed()) {
        console.warn('⚠️ Page/context closed during invoice capture; skipping error screenshot');
    } else {
        // Only attempt screenshot if page is open and error is not page-closure related
        const errorPath = path.join('test-results', `${testInfo.project.name}-invoice-error.png`);
        if (!page.isClosed()) {
            try {
                await fs.mkdir(path.dirname(errorPath), { recursive: true });
                await page.screenshot({ path: errorPath, fullPage: true });
                console.log(`Error screenshot saved: ${errorPath}`);
            } catch (screenshotError) {
                console.warn(`⚠️ Could not take invoice error screenshot: ${(screenshotError as Error).message}`);
            }
        }
    }
}

// Wait for page to stabilize (only if page is still open)
if (!page.isClosed()) {
    await page.waitForLoadState('networkidle').catch(() => { });
}
```

### 4. Improved Result Handling (Line 527)
**Changes:**
- Check the result of `captureInvoiceScreenshot` before logging success
- Handle cases where screenshot capture returns empty string

```typescript
const screenshotResult = await captureInvoiceScreenshot(page, testInfo);
if (screenshotResult) {
    console.log('✅ Invoice captured successfully');
} else {
    console.warn('⚠️ Invoice screenshot could not be captured (page may have closed)');
}
```

## Benefits of These Fixes

1. **Robust Error Handling**: The code now gracefully handles scenarios where the page or context is closed unexpectedly.

2. **No Crashes**: The test will no longer crash when trying to capture screenshots on closed pages.

3. **Better Logging**: Clear warning messages indicate when operations are skipped due to page closure.

4. **Error Report Generation**: The `appendErrorReport` function will continue to work correctly because:
   - It doesn't depend on the page being open (it only writes files)
   - The main test's catch block properly handles page closure before calling `appendErrorReport`
   - Error information is still captured and reported even if screenshots fail

5. **Fallback Mechanisms**: Multiple layers of fallback ensure that some information is captured even in error scenarios.

## Testing Recommendations

1. **Test with Page Closure**: Intentionally close the page during invoice capture to verify the error handling works correctly.

2. **Test with Network Errors**: Simulate network failures to ensure the code handles API errors gracefully.

3. **Test Error Report Generation**: Verify that error reports are still generated correctly even when screenshots fail.

4. **Test All Websites**: Run the full test suite across all configured websites to ensure the fixes work universally.

## Files Modified

- `tests/checkout-flow.spec.ts`: Main test file with all the fixes
- `tests/utils/error-report.ts`: No changes needed (already robust)

## Verification

✅ TypeScript compilation successful with no errors  
✅ All page closure checks implemented  
✅ All screenshot operations protected with page state checks  
✅ Error handling improved throughout the invoice capture process  
✅ Error report generation remains functional

---

## 🔧 Additional Refactoring: Hardcoded Test Data → `.env`

### Problem
- Customer name (`Nguyễn Văn A`) and phone (`0989336888`) were hardcoded directly in `tests/checkout-flow.spec.ts`
- Violates **Critical rule #5** in review checklist: *Hardcoded sensitive data*
- Không thể thay đổi data test mà không sửa code

### Solution
1. **Created `.env` file** with `TEST_CUSTOMER_NAME` and `TEST_CUSTOMER_PHONE` variables
2. **Updated `playwright.config.ts`**: Uncommented and activated `dotenv` loading (lines 8-11)
3. **Updated `tests/checkout-flow.spec.ts`**: Replaced hardcoded values with `process.env.*` with fallback defaults
4. **Added `.env` to `.gitignore`**: Ensures sensitive data is not committed

### Files Changed
| File | Change |
|------|--------|
| `.env` (new) | Chứa `TEST_CUSTOMER_NAME` và `TEST_CUSTOMER_PHONE` |
| `.gitignore` | Added `.env` entry |
| `playwright.config.ts` | Enabled `dotenv.config()` import/execution |
| `tests/checkout-flow.spec.ts` | `testCustomer` reads from `process.env.*` with fallback |
