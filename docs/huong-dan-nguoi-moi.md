# Huong Dan Cho ban

Tai lieu nay giup ban tham gia project nhanh nhat co the. Muc tieu khong phai doc het source code ngay tu dau, ma la biet:

- Chay test nhu the nao.
- Doc flow code theo thu tu nao de khong bi roi.
- Khi viet test moi thi bat dau tu file nao.
- Khi can sua UI action, selector, timeout, report, data thi tim o dau.

Project nay la Playwright + TypeScript, dung de automation cac flow checkout/copy tren nhieu website.

---

## 1. Ban Can Hieu 1 Y Tuong Chinh

Code trong project duoc chia theo lop:

```text
tests/        -> noi khai bao testcase, goi step chinh
steps/        -> noi sap xep flow nghiep vu theo tung buoc
components/   -> noi thao tac UI chi tiet
helpers/      -> helper dung chung cho click, dialog, navigation, error
constants/    -> selector, text, test id, timeout/config dung lai
test-data/    -> data test, env, file mau
utils/        -> report/log utility
```

Hay nho cong thuc nay:

```text
Spec khong nen lam viec nang.
Spec chi goi step.
Step dieu phoi flow.
Page Object thao tac UI.
Helper xu ly viec dung chung.
Constants chua gia tri lap lai.
```

Vi du flow checkout:

```text
tests/ui/checkout/invoice.spec.ts
  -> steps/checkout.steps.ts
      -> components/pages/CheckoutPage.ts
      -> components/pages/InvoicePage.ts
          -> components/helpers/dialog-handler.ts
          -> components/helpers/element-actions.ts
          -> components/helpers/page-error.ts
          -> constants/*
```

Vi du flow copy:

```text
tests/ui/checkout/copy-functionality.spec.ts
tests/ui/checkout/copy-project-stages.spec.ts
  -> steps/copy.steps.ts
      -> components/pages/CopyPage.ts
          -> components/helpers/dialog-handler.ts
          -> components/helpers/element-actions.ts
          -> components/helpers/navigation.ts
          -> components/helpers/page-error.ts
```

---

## 2. 30 Phut Dau Nen Doc Gi

Dung thu tu nay. Dung doc lan man het project.

### Buoc 1: Doc command va cau hinh chay test

Doc:

```text
README.md
package.json
playwright.config.ts
```

Can nam:

- Lenh nao de chay test.
- Test nam trong folder nao.
- Playwright dang tao project/site nhu the nao.
- Timeout, screenshot, video, trace dang cau hinh o dau.

### Buoc 2: Doc danh sach website/project

Doc:

```text
config/projects.config.ts
config/env.config.ts
config/test.config.ts
test-data/env/.env
```

Can nam:

- Moi website map voi bien `BASE_URL_*` nao.
- URL lay tu env, khong hardcode trong test.
- Timeout dung chung nam trong `config/test.config.ts`.

### Buoc 3: Doc spec de biet test bat dau tu dau

Doc:

```text
tests/ui/checkout/invoice.spec.ts
tests/ui/checkout/copy-functionality.spec.ts
tests/ui/checkout/copy-project-stages.spec.ts
```

Can nam:

- Spec chi khai bao ten test, tag, timeout va goi step.
- Neu spec dai qua nhieu logic UI, do la dau hieu can tach xuong `steps/` hoac `components/pages/`.

### Buoc 4: Doc step de hieu flow nghiep vu

Doc:

```text
steps/checkout.steps.ts
steps/copy.steps.ts
```

Can nam:

- Checkout flow co nhung buoc nao.
- Copy flow co nhung buoc nao.
- Step nao goi page object nao.
- Loi duoc capture/report o dau.

### Buoc 5: Doc page object theo flow minh dang lam

Neu lam checkout, doc:

```text
components/pages/CheckoutPage.ts
components/pages/InvoicePage.ts
```

Neu lam copy, doc:

```text
components/pages/CopyPage.ts
```

Can nam:

- Function nao click tab.
- Function nao add product.
- Function nao checkout/order.
- Function nao wait QR/copy.
- Function nao capture invoice/screenshot.

### Buoc 6: Chi doc helper khi can sua logic dung chung

Doc khi can:

```text
components/helpers/element-actions.ts
components/helpers/dialog-handler.ts
components/helpers/navigation.ts
components/helpers/page-error.ts
utils/reportUtils.ts
constants/*
```

Khong nen sua helper neu chua chac, vi helper anh huong nhieu flow.

---

## 3. Cach Chay Project

Cai dependency:

```bash
npm install
```

Tao env local tu file mau:

Kiem tra Playwright co nhan test khong:

```bash
npm run test:list
```

Kiem tra TypeScript:

```bash
npm run typecheck
```

Chay tat ca test:

```bash
npm test
```

Chay checkout:

```bash
npm run test:checkout
```

Chay copy NDS:

```bash
npm run test:copy
```

Chay mot spec:

```bash
npx playwright test tests/ui/checkout/copy-project-stages.spec.ts
```

Chay mot website/project:

```bash
npx playwright test --project=si
```

Chay theo tag:

```bash
npx playwright test --grep "@copy-stages"
npx playwright test --grep "@smoke"
```

Don screenshot/report cu:

```bash
npm run cleanup:screenshots
```

Luu y: checkout flow co the tao don hang that tren URL dang cau hinh. Chi chay full flow tren moi truong test/staging an toan.

---

## 4. Hieu Flow Checkout

Entry point:

```text
tests/ui/checkout/invoice.spec.ts
```

Spec goi:

```text
completeCheckoutFlow(page, testInfo)
```

Function nam o:

```text
steps/checkout.steps.ts
```

Thu tu flow:

```text
1. Mo homepage theo baseURL cua project.
2. Check page co loi API/dialog som khong.
3. Chon tab theo website.
4. Bam nut + de them san pham.
5. Di toi checkout.
6. Xac nhan thanh toan.
7. Dien thong tin khach hang test.
8. Hoan tat don hang.
9. Tim va chup invoice.
10. Neu fail, chup screenshot va ghi report loi.
```

File phu trach tung phan:

```text
CheckoutPage.ts
  - selectTab()
  - clickAddProductButton()
  - proceedToCheckout()
  - confirmPayment()
  - fillCustomerInfo()
  - completeOrder()

InvoicePage.ts
  - checkEarlyPageErrors()
  - checkAndCaptureApiError()
  - captureInvoice()
```

Khi sua checkout:

- Sua thu tu flow o `steps/checkout.steps.ts`.
- Sua thao tac UI o `CheckoutPage.ts`.
- Sua invoice/screenshot/error detection o `InvoicePage.ts`.
- Sua selector/test id dung chung trong `constants/`.

Khong nen:

- Viet selector dai truc tiep trong spec.
- Them `waitForTimeout`.
- Hardcode URL, phone, email, password that.

---

## 5. Hieu Flow Copy

Entry point:

```text
tests/ui/checkout/copy-functionality.spec.ts
tests/ui/checkout/copy-project-stages.spec.ts
```

Spec goi:

```text
runCopyFunctionality(page, testInfo)
runProjectCopyStages(page, testInfo)
```

Function nam o:

```text
steps/copy.steps.ts
```

### Copy NDS flow

```text
1. Mo homepage.
2. Lay danh sach tab can test theo website.
3. Moi tab:
   - Chon tab.
   - Chon san pham.
   - Doi QR/copy card san sang.
   - Bam copy.
   - Doi trang thai "Da sao chep".
   - Doc clipboard va luu file.
4. Assert tat ca tab pass va co file clipboard.
```

### Copy project stages flow

```text
1. Mo homepage.
2. Moi tab:
   - Chon tab.
   - Chon san pham va doi copy card san sang.
   - Copy NDS.
   - Bam Dat Hang.
   - Copy XNDH.
   - Bam xac nhan don/thanh toan.
   - Copy TTDH.
   - Reload truoc khi sang tab tiep theo.
3. Assert moi tab co du 3 stage: NDS, XNDH, TTDH.
```

File phu trach chinh:

```text
CopyPage.ts
  - getTabsForWebsite()
  - testCopyInTab()
  - testProjectCopyStagesInTab()
  - selectTab()
  - waitForQrLoadedThenCopyEnabled()
  - clickCopyButton()
  - waitForCopyStateChange()
  - readAndSaveClipboardContentOnly()
  - copyAndSaveProjectStage()
```

Khi sua copy:

- Sua flow tong o `steps/copy.steps.ts`.
- Sua logic UI/clipboard/QR o `components/pages/CopyPage.ts`.
- Neu them website/tab moi, xem `getTabsForWebsite()` va tab config trong `CopyPage.ts`.

---

## 6. Ban Muon Lam Viec Gi Thi Bat Dau O Dau

### Truoc khi tao testcase moi hoac sua flow nhieu file

Neu task tao testcase moi, them flow API/k6, doi data phuc tap, hoac sua nhieu hon 1 file, phai lap kich ban ngan truoc khi code.

Luu kich ban vao:

```text
docs/superpowers/plans/YYYY-MM-DD-ten-task.md
```

Kich ban toi thieu can co:

```text
Muc tieu:
- Ket qua can dat.

Pham vi:
- File se doc/sua.

Khong lam:
- Viec ngoai scope, refactor, full test.

Huong sua:
- 2-5 buoc ngan.

Verify:
- Lenh nho nhat can chay.
```

Vi du da co:

```text
docs/superpowers/plans/2026-06-16-mlbl-gift-order-scenario-cache.md
```

Luu y:

- Khong can plan dai cho typo hoac sua 1 dong ro rang.
- Neu task co tao testcase moi, flow API, k6, data dong, hoac report moi thi nen co plan.
- Khong commit plan neu user chua yeu cau commit.

### Them testcase moi

1. Tao file spec trong `tests/<feature>/`.
2. Trong spec, chi goi mot step function.
3. Tao/sua step trong `steps/`.
4. Neu can thao tac UI, tao/sua page object trong `components/pages/`.

Vi du:

```text
tests/checkout/apply-discount.spec.ts
steps/checkout.steps.ts
components/pages/CheckoutPage.ts
```

### Them mot buoc moi vao checkout

Sua:

```text
steps/checkout.steps.ts
components/pages/CheckoutPage.ts
```

Quy tac:

- Step ghi buoc nghiep vu.
- Page object chua click/fill/wait UI chi tiet.

### Them mot buoc moi vao copy

Sua:

```text
steps/copy.steps.ts
components/pages/CopyPage.ts
```

Quy tac:

- Neu chi doi thu tu buoc, sua `steps/copy.steps.ts`.
- Neu doi cach click/wait/read clipboard, sua `CopyPage.ts`.

### Them website moi

Sua:

```text
config/projects.config.ts
test-data/env/.env
```

Can lam:

- Them project name va env key vao `SITE_PROJECTS`.
- Them bien `BASE_URL_*` va gia tri that vao `.env` local.
- Chay `npm run test:list`.

### Them selector/test id/message dung chung

Sua:

```text
constants/testIds.ts
constants/selectors.ts
constants/vietnamese.ts
```

Khong nen copy-paste selector o nhieu file.

### Them data test

Dung folder:

```text
test-data/json/    -> data JSON
test-data/files/   -> file upload/download mau
test-data/env/     -> env mau va env local
types/             -> type/interface cho payload phuc tap
```

Khong commit secret that trong `.env`.

### Them API helper hoac mock response

Nen dat:

```text
utils/ hoac fixtures/       -> API helper/setup data
test-data/json/             -> mock response/payload mau
types/                      -> request/response type
constants/                  -> endpoint/status/message lap lai
```

Quy tac:

- Base URL lay tu env/config.
- Endpoint lap lai dua vao constants.
- Payload/response phuc tap nen co type.
- Mock response phai giong schema that.

### Them API order co qua tang / data dong

Khong nen hardcode truc tiep san pham va qua tang trong spec neu moi website co rule khac nhau.

Nen dung mo hinh:

```text
tests/api/.../*.spec.ts
  -> steps/...steps.ts
      -> components/helpers/*payload.ts
          -> test-data/json/<scenario>.json
```

Trong do:

- `scenario.json` chua day du combo product + gift + rule de tester chi can sua 1 file.
- `combo.rule.requiredProductQuantity` va `combo.rule.rewardGiftQuantity` mo ta ty le mua/nhan qua.
- `giftQuantity` la so luong qua muon nhan trong testcase.
- Helper build payload se tinh so luong san pham tu rule, tinh tong tien, sinh orderCode, va tra ve payload cuoi.
- k6 nen doc cung file scenario de Playwright API va performance khong lech data.
- Neu sau nay can sinh data tu Excel/API lon, co the generate cache nho rieng, nhung khong nen bat tester sua nhieu file cho mot testcase.

Vi du flow MLBL gift order:

```text
tests/api/checkout/mlbl-gift-order-api.spec.ts
  -> steps/mlbl-gift-order.steps.ts
      -> components/helpers/mlbl-gift-order-payload.ts
          -> test-data/json/mlbl-gift-order-si.json
```

File scenario:

```json
{
  "projectName": "si",
  "giftQuantity": 1,
  "combo": {
    "rule": {
      "requiredProductQuantity": 77,
      "rewardGiftQuantity": 1
    },
    "product": {
      "sku": "40000263"
    },
    "gift": {
      "sku": "SPE0000450"
    }
  }
}
```

Quy tac:

- Neu Excel/sheet lon, khong doc toan file trong moi test run. Hay extract truoc thanh JSON nho neu can tu dong hoa data.
- Moi website co the co file scenario rieng: `mlbl-gift-order-si.json`, `mlbl-gift-order-hangthietyeu.json`, ...
- Khi can doi san pham A de duoc qua B, uu tien sua `combo.product`, `combo.gift`, va `combo.rule`, khong sua spec.
- Neu tang so luong qua, doi `giftQuantity`; helper se scale so luong san pham theo `combo.rule`. Vi du `requiredProductQuantity = 77`, `rewardGiftQuantity = 1`, `giftQuantity = 2` thi payload se mua 154 san pham va nhan 2 qua.
- Neu payload co `skipDetail`, can set `false` khi muon don day sang `order_detail`.

Lenh lien quan MLBL gift order:

```bash
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si
npm run k6:mlbl-gift-order:smoke
```

---

## 7. Cac Helper Quan Trong

### `components/helpers/element-actions.ts`

Dung cho thao tac element dung chung:

- `clickElement()` click theo nhieu selector fallback.
- `fillInput()` dien input theo selector fallback.
- `firstVisibleLocator()` tim locator dau tien visible.
- `waitForDomReady()` doi DOM san sang.
- `waitForConditionPoll()` doi interval ngan trong cac loop co condition rieng.

Chi sua file nay khi logic dung chung cho nhieu page object.

### `components/helpers/dialog-handler.ts`

Dung cho browser dialog:

- Track alert/confirm/prompt.
- Capture screenshot khi dialog xuat hien.
- Dismiss dialog va throw error co message ro.

Neu test fail vi popup native cua browser, doc file nay.

### `components/helpers/navigation.ts`

Dung cho URL/navigation:

- Lay homepage tu Playwright project baseURL.
- Canh bao neu query cua homepage bi drop.

### `components/helpers/page-error.ts`

Dung de phat hien loi blocking tren page:

- Internal server error.
- API error.
- Google Sheets quota/read request error.
- Network/fetch error.

Neu flow fail vi page hien loi API, doc file nay va `InvoicePage.ts`.

### `utils/reportUtils.ts`

Dung de ghi report loi vao folder report.

---

## 8. Quy Tac Viet Code De Khong Bi Review Lai Nhieu

Luon lam:

- Dat ten test theo y nghia: `should ... when ...`.
- Them tag: `@smoke`, `@slow`, `@checkout`, `@copy`, `@copy-stages`.
- Dung timeout chung trong `config/test.config.ts`.
- Dung selector on dinh: role, label, test id, constants.
- Moi test phai co assertion ro.
- Khi fail, nen co screenshot/report de debug.
- Chay `npm run typecheck` va `npm run test:list` truoc khi bao xong.

Khong lam:

- Khong dung `page.waitForTimeout()`.
- Khong commit `test.only`, `page.pause()`, debug log tam thoi.
- Khong hardcode URL/secret/token/password.
- Khong viet flow UI dai trong spec.
- Khong dung `force: true` neu chua co ly do rat ro.
- Khong them helper dung chung neu logic moi chi dung 1 noi.

---

## 9. Checklist Khi Intern Nhan Task

Truoc khi code:

- Task thuoc flow nao: checkout, copy, config, data, API, report?
- Entry spec la file nao?
- Step function nao dang dieu phoi flow?
- Page object nao dang thao tac UI?
- Da co helper/constants nao dung lai duoc chua?

Trong khi code:

- Sua dung lop trach nhiem.
- Neu code lap lai 2+ noi, can nghi den helper/constants.
- Neu selector/text lap lai, dua vao constants.
- Neu data phu thuoc moi truong, dua vao env/config.

Truoc khi gui review:

```bash
npm run typecheck
npm run test:list
```

Neu co thay doi flow quan trong, chay them spec lien quan:

```bash
npx playwright test tests/ui/checkout/invoice.spec.ts --project=si
npx playwright test tests/ui/checkout/copy-functionality.spec.ts --project=si
npx playwright test tests/ui/checkout/copy-project-stages.spec.ts --project=si
```

---

## 10. Loi Thuong Gap Va Cach Tu Kiem Tra

### `No tests found`

Kiem tra:

- Dang o project root chua.
- Path spec dung chua.
- Chay `npm run test:list`.

### Missing env

Kiem tra:

- Da tao `test-data/env/.env` chua.
- Bien `BASE_URL_*` co trong `.env` chua.

### Test flaky vi cho UI

Kiem tra:

- Co `waitForTimeout` khong.
- Co selector qua mong manh khong.
- Co click khi button chua visible/enabled khong.
- Co dialog/API error bi nuot khong.

### Clipboard/copy fail

Kiem tra:

- Browser co permission clipboard trong `playwright.config.ts`.
- Copy button da active chua.
- QR/copy card da load chua.
- File clipboard da duoc save vao `test-results/pass-screenshots` chua.

### Checkout tao don that

Kiem tra:

- Base URL co phai staging/test khong.
- Test data co an toan khong.
- Co can cleanup data sau test khong.

---

## 11. Ket Luan Ngan

Neu ban moi vao project, hay di theo duong nay:

```text
README.md
  -> playwright.config.ts
  -> config/*
  -> tests/checkout/*.spec.ts
  -> steps/*.steps.ts
  -> components/pages/*
  -> helpers/constants khi can
```

Khi viet code moi:

```text
Spec goi step.
Step goi page object.
Page object goi helper/constants.
Data/API/config dat dung folder.
```

Chi can giu dung flow nay,ban co the bat dau sua task nho ma khong can hieu het toan bo project ngay tu ngay dau.
