# Cach Doc Flow Code Va Viet Testcase Moi

Tai lieu nay giai thich cach doc flow automation trong project Playwright hien tai va cach viet them testcase cho mot chuc nang moi dua tren pattern dang co.

## 1. Buc Tranh Tong Quan

Project dang theo pattern:

```text
playwright.config.ts
-> config/projects.config.ts
-> tests/**/*.spec.ts
-> steps/*.steps.ts
-> components/pages/*.ts
-> components/helpers/*.ts
-> constants/*.ts
-> utils/reportUtils.ts
-> test-results / reports / playwright-report
```

Y nghia tung tang:

- `playwright.config.ts`: cau hinh chung cho Playwright, timeout, worker, reporter, permission, projects.
- `config/projects.config.ts`: danh sach website can chay test.
- `tests/**/*.spec.ts`: file test case mong, chi khai bao scenario va goi flow.
- `steps/*.steps.ts`: dieu phoi flow nghiep vu theo tung buoc.
- `components/pages/*.ts`: Page Object, chua logic thao tac UI nhu click, wait, fill, screenshot, copy.
- `components/helpers/*.ts`: helper dung chung nhu navigation, click element, dialog handler.
- `constants/*.ts`: selector, label, regex dung chung.
- `utils/reportUtils.ts`: ghi report loi.
- `test-results`, `reports`, `playwright-report`: output sau khi chay test.

Mental model de nho:

```text
Config quyet dinh chay website nao.
Spec quyet dinh chay testcase nao.
Steps quyet dinh flow di qua nhung buoc nghiep vu nao.
Page Object quyet dinh click/wait/fill/verify nhu the nao.
Helpers xu ly thao tac dung chung.
Constants giu selector va text.
Reports/Test-results luu bang chung sau khi chay.
```

## 2. Bat Dau Tu package.json

Doc `package.json` de biet project chay bang lenh nao:

```json
{
  "test": "playwright test",
  "test:checkout-invoice": "playwright test tests/ui/checkout/invoice.spec.ts",
  "test:copy-qr": "playwright test tests/ui/checkout/copy-qr-content.spec.ts",
  "test:list": "playwright test --list",
  "typecheck": "tsc --noEmit"
}
```

Y nghia:

- `npm run test`: chay tat ca spec.
- `npm run test:checkout-invoice`: chay flow checkout.
- `npm run test:copy-qr`: chay flow sao chep.
- `npm run test:list`: xem danh sach test Playwright se chay.
- `npm run typecheck`: kiem tra loi TypeScript.

Khi muon hieu flow nao, lay script tuong ung, mo file spec, roi lan theo step.

## 3. Doc playwright.config.ts

File `playwright.config.ts` cho biet:

- Test nam trong `./tests`.
- File test co pattern `**/*.spec.ts`.
- Project website lay tu `createPlaywrightProjects()`.
- Browser chay `headless: true`.
- Clipboard test duoc cap quyen `clipboard-read`, `clipboard-write`.
- Reporter gom HTML report va list reporter.
- Worker dung `SERIAL_WORKERS`, phu hop voi clipboard/shared state.

Diem quan trong: project khong hard-code trong config nay, ma lay tu `config/projects.config.ts`.

## 4. Doc config/projects.config.ts

File `config/projects.config.ts` dinh nghia danh sach website:

```ts
export const SITE_PROJECTS = [
    { name: 'tuoixanhnhanhngon', baseUrlEnv: 'BASE_URL_TUOIXANHNHANHNGON' },
    { name: 'tegianoitro', baseUrlEnv: 'BASE_URL_TEGIANOITRO' },
    { name: 'danongdichthuc', baseUrlEnv: 'BASE_URL_DANONGDICHTHUC' },
    { name: 'hangthietyeu', baseUrlEnv: 'BASE_URL_HANGTHIETYEU' },
    { name: 'nhanquocdan', baseUrlEnv: 'BASE_URL_NHANQUOCDAN' },
    { name: 'si', baseUrlEnv: 'BASE_URL_SI' },
    { name: 'thegioiphaidep', baseUrlEnv: 'BASE_URL_THEGIOIPHAIDEP' },
];
```

Moi item tro thanh mot Playwright project. Vi vay cung mot file spec co the chay lap lai tren nhieu website.

Vi du `copy-qr-content.spec.ts` chi co mot test, nhung Playwright se chay test do tren tung project website.

## 5. Doc File Spec

Vi du flow copy bat dau tu `tests/ui/checkout/copy-qr-content.spec.ts`:

```ts
import { test } from '@playwright/test';
import { runCopyFunctionality } from '../../steps/copy.steps';

test.describe('Copy Functionality (Sao Chep - NDS) - All Websites', () => {
    test.setTimeout(360000);

    test('Copy Functionality - Sequential Tabs', async ({ page }, testInfo) => {
        await runCopyFunctionality(page, testInfo);
    });
});
```

File spec chi lam 3 viec:

- Tao test suite.
- Set timeout.
- Goi `runCopyFunctionality(page, testInfo)`.

Spec khong nen chua logic chi tiet. Spec chi la cua vao cua testcase.

Flow checkout tuong tu trong `tests/ui/checkout/invoice.spec.ts`:

```ts
await completeCheckoutFlow(page, testInfo);
```

Muốn hiểu nghiệp vụ thật, đi tiếp sang file trong `steps`.

## 6. Doc Step File

Voi copy flow, doc `steps/copy.steps.ts`.

Flow hien tai:

```ts
const copyPage = new CopyPage(page);
await copyPage.ensureScreenshotDirectories();

const websiteName = testInfo.project.name;
const tabsForWebsite = copyPage.getTabsForWebsite(websiteName);
const homeUrl = getProjectHomeUrl(testInfo);

await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });

for (const tabConfig of tabsForWebsite) {
    const result = await copyPage.testCopyInTab(websiteName, tabConfig, homeUrl, {
        navigateBeforeTest: false,
    });
    results.push(result);
}
```

Y tuong chinh:

- Tao `CopyPage`.
- Tao thu muc luu screenshot/clipboard.
- Lay ten website hien tai tu `testInfo.project.name`.
- Lay danh sach tab can test theo website.
- Mo homepage mot lan.
- Lap qua tung tab.
- Moi tab goi `copyPage.testCopyInTab(...)`.
- Gom ket qua.
- Assert tat ca tab pass.

Day la pattern nen hoc theo khi viet flow moi: step file dieu phoi nghiep vu, Page Object xu ly chi tiet UI.

## 7. Doc Page Object

File quan trong cua copy flow la `components/pages/CopyPage.ts`.

Phan class o dau file la mat ngoai de step goi:

```ts
export class CopyPage {
    constructor(private readonly page: Page) { }

    async ensureScreenshotDirectories() {
        return ensureScreenshotDirectories();
    }

    getTabsForWebsite(websiteName: string): TabConfig[] {
        return getTabsForWebsite(websiteName);
    }

    async testCopyInTab(websiteName: string, tabConfig: TabConfig, homeUrl: string, options?: CopyTabTestOptions) {
        return testCopyInTab(this.page, websiteName, tabConfig, homeUrl, options);
    }
}
```

Ben duoi la cac function noi bo lam viec that.

Dung doc `CopyPage.ts` tu tren xuong mot leo. Hay doc theo chuoi function:

```text
runCopyFunctionality
-> copyPage.testCopyInTab
   -> closeCopySurfaceIfOpen
   -> prepareCopyCardFromTab
      -> selectTab
      -> selectProductAndPrepareCopyCard
         -> waitForQrLoadedThenCopyEnabled
            -> waitForQrCopyCardReady
            -> waitForCopyButtonVisible
            -> waitForCopyButtonActive
   -> clickCopyButton
   -> waitForCopyStateChange
   -> readAndSaveClipboardContentOnly
   -> takeAndSaveScreenshot neu fail
```

## 8. Hieu testCopyInTab

`testCopyInTab(...)` la flow cua mot tab:

- Log tab dang test.
- Neu `navigateBeforeTest = true` thi tu `page.goto(homeUrl)`.
- Neu `navigateBeforeTest = false` thi reuse page hien tai va dong copy surface neu dang mo.
- Goi `prepareCopyCardFromTab`.
- Click nut copy.
- Cho trang thai chuyen sang copied.
- Doc clipboard.
- Luu text/image clipboard vao `test-results/pass-screenshots`.
- Neu loi thi ghi report va chup screenshot fail.

Trong `steps/copy.steps.ts`, flow dang goi:

```ts
await copyPage.testCopyInTab(websiteName, tabConfig, homeUrl, {
    navigateBeforeTest: false,
});
```

Nghia la homepage chi mo mot lan, sau do lan luot test cac tab tren cung session.

## 9. Hieu Cau Hinh Tab

Trong `CopyPage.ts` co:

```ts
const tabsToTestDefault = [
    { tabName: labels.singleBag, displayName: 'Tui-Don', selectors: [...] },
    { tabName: labels.doubleBag, displayName: 'Tui-Doi', selectors: [...] },
    { tabName: labels.versatileBag, displayName: 'Tui-Da-Dang', selectors: [...] },
];

const tabsToTestSi = [
    { tabName: labels.box, displayName: 'Chon-Thung', selectors: [...] },
];

const getTabsForWebsite = (websiteName: string): TabConfig[] => {
    return websiteName === 'si' ? tabsToTestSi : tabsToTestDefault;
};
```

Y nghia:

- Website `si` chi test tab chon thung.
- Cac website con lai test tui don, tui doi, tui da dang.
- Neu muon them tab moi cho copy flow, thuong sua o day.

## 10. Hieu Selector Va Label

`constants/vietnamese.ts` chua label va regex tieng Viet.

`constants/selectors.ts` chua selector dung chung, vi du:

```ts
export const productCardSelector = [
    '[data-testid^="product-"]',
    '[data-testid^="combo-card-"]',
    ...
].join(', ');
```

Khi thay:

```ts
page.locator(productCardSelector)
```

thi hieu la code dang tim product card bang nhieu selector khac nhau de support nhieu website.

## 11. Flow Checkout

Checkout flow nam o `steps/checkout.steps.ts`.

Chuoi chinh:

```text
invoice.spec.ts
-> completeCheckoutFlow
   -> page.goto(homeUrl)
   -> checkoutPage.selectTab
   -> checkoutPage.clickAddProductButton
   -> checkoutPage.proceedToCheckout
   -> checkoutPage.confirmPayment
   -> checkoutPage.fillCustomerInfo
   -> checkoutPage.completeOrder
   -> invoicePage.captureInvoice
```

Page Object lien quan:

- `components/pages/CheckoutPage.ts`: select tab, add product, checkout, confirm payment, fill customer info, complete order.
- `components/pages/InvoicePage.ts`: detect invoice, capture invoice, detect API/page error.

Checkout flow co them `dialogHandler` de bat alert/confirm/prompt va capture failure state.

## 12. Cach Debug Khi Test Fail

Khi test fail, doc theo thu tu:

1. Terminal log: xem fail o step nao.
2. `test-results/err-screenshots`: xem anh loi.
3. `reports`: xem error report neu co.
4. `playwright-report`: xem HTML report.
5. Quay lai function tuong ung trong `steps` hoac `components/pages`.

Vi du:

- Fail o `Failed to select tab`: doc `selectTab`.
- Fail o `QR/copy card did not finish loading`: doc `prepareCopyCardFromTab`, `selectProductAndPrepareCopyCard`, `waitForQrLoadedThenCopyEnabled`.
- Fail o `Clipboard should contain copied content`: doc `readAndSaveClipboardContentOnly`.

## 13. Cach Viet Them Testcase Cho Chuc Nang Moi

Khi viet testcase moi, hay giu dung 3 tang:

```text
tests/.../*.spec.ts  -> steps/...steps.ts -> components/pages/...Page.ts
```

Quy tac:

- Spec chi khai bao testcase va goi step.
- Step dieu phoi business flow.
- Page Object chua thao tac UI chi tiet.
- Helper/constant chi tao khi logic duoc dung lai nhieu noi.

### Buoc 1: Tao Spec Moi

Vi du muon test chuc nang search:

```text
tests/checkout/search-functionality.spec.ts
```

Noi dung mau:

```ts
import { test } from '@playwright/test';
import { runSearchFunctionality } from '../../steps/search.steps';

test.describe('Search Functionality - All Websites', () => {
    test.setTimeout(120000);

    test('search product by keyword', async ({ page }, testInfo) => {
        await runSearchFunctionality(page, testInfo);
    });
});
```

### Buoc 2: Tao Step File

Vi du:

```text
steps/search.steps.ts
```

Noi dung mau:

```ts
import { expect, Page, TestInfo } from '@playwright/test';
import { getProjectHomeUrl, warnIfHomepageQueryWasDropped } from '../components/helpers/navigation';
import { SearchPage } from '../components/pages/SearchPage';

export async function runSearchFunctionality(page: Page, testInfo: TestInfo) {
    const searchPage = new SearchPage(page);
    const websiteName = testInfo.project.name;
    const homeUrl = getProjectHomeUrl(testInfo);
    const keyword = process.env.TEST_SEARCH_KEYWORD || 'test';

    console.log(`Testing search on ${websiteName}: ${keyword}`);

    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    await warnIfHomepageQueryWasDropped(page, homeUrl);

    await searchPage.search(keyword);
    const hasResults = await searchPage.hasSearchResults();

    await expect(hasResults, `Search should show results for "${keyword}" on ${websiteName}`).toBe(true);
}
```

### Buoc 3: Tao Page Object

Vi du:

```text
components/pages/SearchPage.ts
```

Noi dung mau:

```ts
import { Page } from '@playwright/test';

export class SearchPage {
    constructor(private readonly page: Page) {}

    async search(keyword: string) {
        const searchInput = this.page
            .locator('input[type="search"], input[placeholder*="tim"], input[placeholder*="Tìm"]')
            .first();

        await searchInput.waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.fill(keyword);
        await searchInput.press('Enter');
        await this.page.waitForLoadState('networkidle').catch(() => {});
    }

    async hasSearchResults() {
        const productCards = this.page.locator(
            '[data-testid^="product-"], [data-testid^="combo-card-"], .product-card'
        );

        return productCards.first().isVisible({ timeout: 10000 }).catch(() => false);
    }
}
```

Sau do co the chay:

```powershell
npx playwright test tests/checkout/search-functionality.spec.ts
```

Hoac neu them script vao `package.json`:

```json
"test:search": "playwright test tests/checkout/search-functionality.spec.ts"
```

thi chay:

```powershell
npm run test:search
```

## 14. Mau Ap Dung Cho Mot Chuc Nang Khac

Neu chuc nang moi la "kiem tra nut X co hoat dong", flow nen viet nhu sau:

```text
tests/checkout/x-functionality.spec.ts
-> steps/x.steps.ts
   -> page.goto(homeUrl)
   -> xPage.prepareStateIfNeeded()
   -> xPage.clickX()
   -> xPage.verifyXResult()
-> components/pages/XPage.ts
   -> prepareStateIfNeeded()
   -> clickX()
   -> verifyXResult()
```

Spec mau:

```ts
import { test } from '@playwright/test';
import { runXFunctionality } from '../../steps/x.steps';

test.describe('X Functionality - All Websites', () => {
    test('should complete X flow', async ({ page }, testInfo) => {
        await runXFunctionality(page, testInfo);
    });
});
```

Step mau:

```ts
import { expect, Page, TestInfo } from '@playwright/test';
import { getProjectHomeUrl } from '../components/helpers/navigation';
import { XPage } from '../components/pages/XPage';

export async function runXFunctionality(page: Page, testInfo: TestInfo) {
    const xPage = new XPage(page);
    const homeUrl = getProjectHomeUrl(testInfo);

    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });

    await xPage.prepareStateIfNeeded();
    await xPage.clickX();

    const result = await xPage.verifyXResult();
    await expect(result, 'X functionality should work').toBe(true);
}
```

Page Object mau:

```ts
import { Page } from '@playwright/test';

export class XPage {
    constructor(private readonly page: Page) {}

    async prepareStateIfNeeded() {
        await this.page.waitForLoadState('domcontentloaded');
    }

    async clickX() {
        await this.page.getByRole('button', { name: /x/i }).click();
    }

    async verifyXResult() {
        return this.page.getByText(/success|thanh cong/i).isVisible({ timeout: 10000 }).catch(() => false);
    }
}
```

## 15. Khi Nao Nen Sua File Nao

- Them testcase moi: tao file moi trong `tests`.
- Flow moi dai hon vai buoc: tao file moi trong `steps`.
- Can click/fill/wait/verify UI: tao hoac sua Page Object trong `components/pages`.
- Selector/text dung lai nhieu noi: dua vao `constants`.
- Logic thao tac dung chung nhieu flow: dua vao `components/helpers`.
- Bao loi/screenshot/report dung chung: dua vao `utils`.

## 16. Checklist Truoc Khi Commit Testcase Moi

- Spec doc nhu mot scenario, khong qua day logic UI.
- Step co ten ro nghia, vi du `runSearchFunctionality`, `runVoucherFunctionality`.
- Page Object expose action cap nguoi dung, vi du `search`, `applyVoucher`, `verifyResult`.
- Co `expect` o step/spec de testcase that su fail khi behavior sai.
- Co timeout phu hop neu flow can doi API/UI lau.
- Neu flow ghi file/screenshot, tao thu muc truoc khi ghi.
- Chay `npm run typecheck`.
- Chay spec moi bang `npx playwright test path/to/spec.ts`.
