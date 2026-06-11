# Huong Dan Nguoi Moi

Tai lieu nay giup thanh vien moi hieu nhanh cau truc Playwright automation hien tai, biet doc code tu dau, viet testcase moi o dau va tach helper/data nhu the nao de project de maintain khi mo rong.

## 1. Cau Truc Project Hien Tai

```text
project-root/
+-- tests/
|   +-- checkout/
|       +-- checkout-flow.spec.ts
|       +-- copy-functionality.spec.ts
+-- steps/
|   +-- checkout.steps.ts
|   +-- copy.steps.ts
+-- components/
|   +-- pages/
|   |   +-- CheckoutPage.ts
|   |   +-- CopyPage.ts
|   |   +-- InvoicePage.ts
|   +-- sections/
|   +-- helpers/
|   |   +-- dialog-handler.ts
|   |   +-- element-actions.ts
|   |   +-- navigation.ts
|   +-- assertions/
+-- fixtures/
+-- setup/
+-- config/
+-- constants/
+-- test-data/
|   +-- env/
|       +-- .env
|       +-- .env.example
+-- utils/
+-- scripts/
+-- rules/
+-- playwright.config.ts
+-- package.json
+-- tsconfig.json
+-- README.md
```

Ghi chu:

- `playwright.config.ts` van nam o root de lenh `playwright test` hoat dong theo mac dinh.
- `tests/checkout` chi la entry point cua testcase.
- `steps` dieu phoi flow test theo nghiep vu.
- `components/pages` chua page object va cac thao tac UI/capture chi tiet.
- `components/helpers` chua helper dung chung o muc thap hon.

## 2. Cach Doc Code Cho Nguoi Moi

Nen doc theo thu tu sau:

1. Doc `README.md` de nam command va luu y khi chay full checkout flow.
2. Doc `playwright.config.ts` de hieu danh sach project/site, base URL va timeout mac dinh.
3. Doc `config/projects.config.ts` de hieu moi site dang map voi bien `BASE_URL_*` nao.
4. Doc `config/env.config.ts` va `test-data/env/.env.example` de biet can khai bao bien moi truong nao.
5. Doc spec trong `tests/checkout/` de thay testcase dang goi step nao.
6. Doc `steps/checkout.steps.ts` hoac `steps/copy.steps.ts` de hieu thu tu flow nghiep vu.
7. Doc `components/pages/CheckoutPage.ts`, `components/pages/InvoicePage.ts`, `components/pages/CopyPage.ts` de hieu thao tac UI chi tiet.
8. Doc `components/helpers/*` de biet helper nao da co san.
9. Doc `constants/*` de dung lai selector/test id thay vi hard-code lai trong spec.
10. Doc `utils/reportUtils.ts` neu can hieu cach ghi report loi.

Nguyen tac doc code hien tai: `tests/` la entry point, `steps/` la flow nghiep vu, `components/pages/` la chi tiet thao tac UI, `components/helpers/` la helper dung chung.

## 3. Viet Testcase Moi O Dau

### Test script

- Test lien quan checkout/copy: them file moi trong `tests/checkout/`.
- Test lien quan auth sau nay: tao `tests/auth/`.
- Test lien quan dashboard sau nay: tao `tests/dashboard/`.
- Dat ten file theo format: `<feature-or-flow>.spec.ts`.

Vi du:

```text
tests/checkout/apply-discount.spec.ts
tests/auth/login.spec.ts
tests/dashboard/order-filter.spec.ts
```

### Test steps

Neu mot flow co nhieu buoc va duoc dung lai o nhieu spec, tach vao `steps/`.

Vi du:

```text
steps/checkout.steps.ts
steps/copy.steps.ts
```

Spec chi nen doc nhu kich ban test: arrange, action, assertion. Logic thao tac dai phai dua vao `steps/` hoac `components/pages/`.

### Page object va UI component

- Page-level action: `components/pages/`.
- Thanh phan UI tai su dung: `components/sections/`.
- Helper thao tac browser/element: `components/helpers/`.
- Assertion dung chung: `components/assertions/`.

Vi du:

```text
components/pages/CheckoutPage.ts
components/pages/CopyPage.ts
components/pages/InvoicePage.ts
components/sections/ProductCard.ts
components/assertions/invoice.assertions.ts
```

### Data

- JSON data: `test-data/json/`.
- File upload/download fixture: `test-data/files/`.
- Bien moi truong mau: `test-data/env/.env.example`.
- Secret thuc te dat trong `test-data/env/.env`, khong commit file nay.

### Constants

Nhung selector, test id, timeout, message dung lai nhieu lan nen dat trong `constants/`.

Vi du:

```text
constants/testIds.ts
constants/selectors.ts
constants/timeouts.ts
constants/messages.ts
```

## 4. Cach Chay Du An

Cai dependency:

```bash
npm install
```

Tao `test-data/env/.env` tu file mau:

```bash
copy test-data\env\.env.example test-data\env\.env
```

Liet ke test de kiem tra config/import:

```bash
npm run test:list
```

Type-check:

```bash
npm run typecheck
```

Chay toan bo test:

```bash
npm test
```

Chay checkout flow:

```bash
npm run test:checkout
```

Chay copy flow:

```bash
npm run test:copy
```

Chay mot file theo path moi:

```bash
npx playwright test tests/checkout/copy-functionality.spec.ts
```

Chay mot project/site:

```bash
npx playwright test --project=si
```

Neu gap loi `No tests found`, hay kiem tra:

- Dang chay lenh tu project root.
- Khong dung path cu `tests/checkout-flow.spec.ts` hoac `tests/copy-functionality.spec.ts`.
- Chay `npm run test:list` de xac nhan Playwright nhan du spec trong `tests/checkout/`.
- Bien `BASE_URL_*` trong `test-data/env/.env` da co gia tri URL day du, vi runner se validate URL khi load config.

Don screenshot/report cu:

```bash
npm run cleanup:screenshots
```

Luu y quan trong: full checkout flow co the tao don hang that tren URL dang cau hinh. Chi chay full flow tren moi truong test/staging hoac data an toan.

## 5. Checklist Truoc Khi Commit/Merge

- `npm run typecheck` phai pass.
- `npm run test:list` phai thay du test mong muon.
- Moi site moi phai them vao `config/projects.config.ts` va them bien mau vao `test-data/env/.env.example`.
- Khong hard-code secret, token, tai khoan that trong code.
- Khong them selector trung lap neu da co trong `constants/`.
- Khong viet helper dai trong spec neu helper do co kha nang dung lai.
- Neu sua checkout/copy flow, can kiem tra screenshot/report path van dung.
- Neu them bien moi truong, cap nhat `test-data/env/.env.example`.
- Neu them command moi, cap nhat `README.md` va file huong dan nay.

## 6. Danh Gia Hien Tai Va Huong Nang Cap

Da tot:

- Test runner da nhan du suite qua `npm run test:list`.
- Project da co `tsconfig.json`, co the type-check bang `npm run typecheck`.
- Hai spec dai da duoc lam mong: spec goi step runner, khong con chua logic UI dai.
- Checkout flow da tach sang `steps/checkout.steps.ts`, `CheckoutPage.ts` va `InvoicePage.ts`.
- Copy flow da tach sang `steps/copy.steps.ts` va `CopyPage.ts`.
- Helper dung chung da duoc tach ra `components/helpers`.
- Config env/timeout da tach ra `config`.
- Rule files da gom vao `rules`.
- README va tai lieu onboarding da co noi de nguoi moi bat dau.

Can cai thien tiep:

- `InvoicePage.ts` va `CopyPage.ts` van con dai. Khi co thoi gian nen tach nho tiep sang `components/sections` nhu `ProductCard`, `CopyCard`, `InvoicePopup`.
- Mot so UI text/log dang bi mojibake encoding. Can chuan hoa UTF-8 de selector va log de doc hon.
- Can them `constants/messages.ts` va `constants/timeouts.ts` neu message/timeout bat dau lap lai nhieu.
- Can xac dinh chien luoc test data cho doanh nghiep: staging data, cleanup order, mock API hoac test account rieng.
- Nen them tag nhu `@smoke`, `@regression`, `@checkout` khi suite lon hon.

Ket luan: cau truc hien tai da de tiep can hon ban dau va co du diem neo cho nguoi moi doc flow, them test va tach helper. Huong nang cap tiep theo la tach cac page object dai thanh section objects va chuan hoa encoding/selector contract voi frontend.
