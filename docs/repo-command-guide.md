# Repo Command Guide

Mac dinh chay lenh tu root project.

## Setup chung

1. Cai dependencies neu may moi clone repo:

```powershell
npm install
```

2. Kiem tra env trong `test-data/env/.env`.

Playwright projects dang co:

```text
tuoixanhnhanhngon, tegianoitro, danongdichthuc, hangthietyeu, nhanquocdan, si, thegioiphaidep
```

3. Neu chi chay mot website, them `--project=<project>`.

Vi du:

```powershell
npx playwright test tests/ui/checkout/invoice.spec.ts --project=si
```

4. Report Playwright:

```powershell
npx playwright show-report
```

Ket qua chinh:

```text
playwright-report
test-results
```

## Kich ban UI invoice

Muc dich: chay flow checkout UI, in phieu/capture invoice.

### Setup

- Can `BASE_URL_<PROJECT>` trong `test-data/env/.env`.
- Chon project can test, vi du `si`.

### Lenh run

```powershell
npm run test:checkout-invoice -- --project=si
```

Hoac chay truc tiep:

```powershell
npx playwright test tests/ui/checkout/invoice.spec.ts --project=si
```

### Report

```powershell
npx playwright show-report
```

Can xem:

```text
playwright-report
test-results
```

## Kich ban UI copy function

Muc dich: kiem tra copy QR/content/clipboard.

### Setup

- Can `BASE_URL_<PROJECT>` trong `test-data/env/.env`.
- Nen chay rieng khi debug clipboard.

### Lenh run

```powershell
npm run test:copy-qr -- --project=si
```

Hoac:

```powershell
npx playwright test tests/ui/checkout/copy-qr-content.spec.ts --project=si
```

### Report

```powershell
npx playwright show-report
```

## Kich ban UI bulk checkout

Muc dich: chay nhieu don checkout bang UI, gom 2 mode: tuan tu va dong thoi.

### Setup

- Can `BASE_URL_<PROJECT>` trong `test-data/env/.env`.
- So don dat o `config/test.config.ts`:

```text
BULK_CHECKOUT_ORDER_COUNT
PERFORMANCE_CHECKOUT_ORDER_COUNT
```

### Lenh run

Chay ca sequential va performance:

```powershell
npm run test:checkout-bulk -- --project=si
```

Chi chay sequential:

```powershell
npx playwright test tests/ui/checkout/checkout-bulk-orders.spec.ts --grep "@sequential" --project=si
```

Chi chay performance UI:

```powershell
npx playwright test tests/ui/checkout/checkout-bulk-orders.spec.ts --grep "@performance" --project=si
```

### Report

```powershell
npx playwright show-report
```

Can xem:

```text
playwright-report
test-results
```

## Kich ban Playwright API performance

Muc dich: mo UI mot lan de detect checkout API, sau do tao don bang Playwright API theo batch.

Luu y: flow nay khong tao template cho k6.

### Setup

- Env website dat o `test-data/env/.env`.
- Can `BASE_URL_<PROJECT>` theo project dang chay.

Vi du chay `--project=si` thi can bien:

```text
BASE_URL_SI=<url checkout site si>
```

- Config so don/batch dat o `config/test.config.ts`:

```text
API_PERFORMANCE_CHECKOUT_ORDER_COUNT
API_PERFORMANCE_CHECKOUT_BATCH_SIZE
API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND
API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS
API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES
```

- Vi du muon guest tao 20 don, moi batch 5 request song song:

```ts
export const API_PERFORMANCE_CHECKOUT_ORDER_COUNT = 20;
export const API_PERFORMANCE_CHECKOUT_BATCH_SIZE = 5;
export const API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND = 5;
```

- Guest mode khong can setup token/login.
- Neu login mode can token, cau hinh env:

```text
CHECKOUT_API_LOGIN_URL
CHECKOUT_API_LOGIN_METHOD
CHECKOUT_API_LOGIN_BODY
CHECKOUT_API_TOKEN_PATH
CHECKOUT_API_AUTH_HEADER_NAME
CHECKOUT_API_TOKEN_PREFIX
```

### Lenh run guest

```powershell
npm run test:api-checkout-performance:guest -- --project=si
```

Hoac:

```powershell
npx playwright test tests/api/checkout/api-checkout-performance.spec.ts --grep "@api-performance-guest" --project=si
```

### Lenh run login

```powershell
npm run test:api-checkout-performance:login -- --project=si
```

Hoac:

```powershell
npx playwright test tests/api/checkout/api-checkout-performance.spec.ts --grep "@api-performance-login" --project=si
```

### Report

```text
playwright-report
test-results/report/api-performance/<project>-<mode>-checkout-api-performance-report.md
test-results/report/api-performance/<project>-<mode>-checkout-api-performance-report.json
test-results/report/err
```

## Kich ban tao template cho k6 checkout

Muc dich: mo UI mot lan, detect checkout API, smoke tao 1 don bang API, sau do xuat template cho k6 replay.

### Setup

- Env website dat o `test-data/env/.env`.
- Can `BASE_URL_<PROJECT>` theo project dang chay.
- Guest mode khong can token.
- Login mode can env login nhu phan API performance.

### Lenh run guest

```powershell
npm run test:api-checkout-k6-template:guest -- --project=si
```

Hoac:

```powershell
npx playwright test tests/api/checkout/api-checkout-k6-template.spec.ts --grep "@api-template-guest" --project=si
```

### Lenh run login

```powershell
npm run test:api-checkout-k6-template:login -- --project=si
```

Hoac:

```powershell
npx playwright test tests/api/checkout/api-checkout-k6-template.spec.ts --grep "@api-template-login" --project=si
```

### Output

```text
test-data/k6/<project>-guest-checkout-order-api-template.json
test-data/k6/<project>-login-checkout-order-api-template.json
test-results/report/api-performance
playwright-report
```

## Kich ban k6 checkout load

Muc dich: replay checkout API bang k6 tu template da tao.

### Setup

- Can k6 binary tai `tools/k6/k6.exe`.
- Phai tao template truoc bang `api-checkout-k6-template.spec.ts`.
- Default so don/rate lay tu `config/test.config.ts`:

```text
API_PERFORMANCE_CHECKOUT_ORDER_COUNT -> K6_TOTAL_ORDERS
API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND -> K6_RATE_PER_SECOND va K6_MAX_VUS
```

- Khi can chay tai khac, override bang env `K6_*` truoc lenh run.
- Kiem tra nhanh k6:

```powershell
npm run k6:version
```

### Lenh run guest

```powershell
npm run k6:checkout:guest
npm run k6:checkout:guest:json
npm run k6:checkout:guest:smoke
```

Chi ro project:

```powershell
node scripts/run-k6-checkout.js --mode guest --project si --json
```

### Lenh run login

Neu API can auth:

```powershell
$env:K6_AUTH_TOKEN='<token>'
```

Sau do chay:

```powershell
npm run k6:checkout:login
npm run k6:checkout:login:json
```

Hoac:

```powershell
node scripts/run-k6-checkout.js --mode login --project si --json
```

### Chinh tai load

```powershell
$env:K6_TOTAL_ORDERS='100'
$env:K6_RATE_PER_SECOND='100'
$env:K6_MAX_VUS='150'
node scripts/run-k6-checkout.js --mode guest --project si --json
```

### Report

```text
test-results/report/k6/<project>-<mode>-checkout-order-load-report.md
test-results/report/k6/<project>-<mode>-checkout-order-load-report.json
test-results/report/k6/<project>-<mode>-checkout-order-load-metrics.json
test-results/report/k6/<project>-<mode>-checkout-order-load-summary.json
```

## Chay nhieu kich ban lien tiep

Khuyen nghi chay tuan tu de tranh tranh tai nguyen va ghi de report.

### UI invoice + copy function

```powershell
npx playwright test tests/ui/checkout/invoice.spec.ts tests/ui/checkout/copy-qr-content.spec.ts --project=si
```

### UI smoke truoc, k6 100 don sau

Buoc 1: kiem tra UI invoice va copy.

```powershell
npx playwright test tests/ui/checkout/invoice.spec.ts tests/ui/checkout/copy-qr-content.spec.ts --project=si
```

Buoc 2: tao template cho k6.

```powershell
npx playwright test tests/api/checkout/api-checkout-k6-template.spec.ts --grep "@api-template-guest" --project=si
```

Buoc 3: chay k6 100 don.

```powershell
$env:K6_TOTAL_ORDERS='100'
$env:K6_RATE_PER_SECOND='100'
$env:K6_MAX_VUS='150'
node scripts/run-k6-checkout.js --mode guest --project si --json
```

Khong nen chay song song UI va k6 load trong 2 terminal khi dang can ket qua on dinh.

## MLBL gift order API

Muc dich: validate payload product + gift va tao order SI bang API.

### Setup

```text
test-data/json/mlbl-gift-order-si.json
test-data/json/mlbl-gift-order-config.json
```

Project nen chay: `si`.

Thong tin live nguoi dat hang va SDT nguoi dat duoc lay tu env `MLBL_GIFT_ORDER_CUSTOMER_NAME`, `MLBL_GIFT_ORDER_CUSTOMER_PHONE`; neu khong set env thi dung fallback trong `test-data/json/mlbl-gift-order-si.json`.

### Lenh run

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=si
```

Neu can chay tiep k6 cho cung case MLBL gift order sau khi Playwright API da tao/verify payload:

```powershell
npm run k6:mlbl-gift-order:smoke
npm run k6:mlbl-gift-order:json
```

Lenh smoke tao tai nho de kiem tra nhanh k6. Lenh json dung cho lan load theo cau hinh mac dinh hoac env `K6_*`.

Chi chay testcase tao order:

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --grep "should create an SI order" --project=si
```

### Report

```text
playwright-report
test-results/report/api-performance/si-mlbl-gift-order-api-report.md
test-results/report/api-performance/si-mlbl-gift-order-api-report.json
test-results
```

Report JSON/Markdown va template k6 se ghi them `customerName` va `customerPhone` da duoc resolve cho request tao order.

## MLBL gift order UI tabs

Muc dich: chay testcase UI dat hang co qua tang theo tab duoc cau hinh rieng cho tung project.

### Setup

- Base URL lay theo Playwright project trong `test-data/env/.env`:
  - `si` -> `BASE_URL_SI`
  - `hangthietyeu` -> `BASE_URL_HANGTHIETYEU`
  - `tuoixanhnhanhngon` -> `BASE_URL_TUOIXANHNHANHNGON`
- Data dat hang resolve theo `test-data/json/mlbl-gift-order-config.json`:
  - `si` -> `test-data/json/mlbl-gift-order-si.json`
  - `hangthietyeu`, `tuoixanhnhanhngon`, va cac project retailer khac -> `test-data/json/mlbl-gift-order-retailer.json`
- Tab UI resolve theo `uiTabsByProject` trong `test-data/json/mlbl-gift-order-config.json`:
  - `hangthietyeu`, `tuoixanhnhanhngon` -> `tui don ghep`, `tui doi`, `tui da dung`
- Project `si` khong chay flow UI tabs nay; `--project=si --grep "@ui"` se skip. Dung phan MLBL gift order API hoac MLBL gift order k6 cho SI.
- UI flow se tao don that tren site dang chay. Khong chay song song voi k6 load khi can ket qua on dinh.

### Lenh run

Chay rieng project `hangthietyeu`:

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=hangthietyeu --grep "@ui"
```

Chay rieng project `tuoixanhnhanhngon`:

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=tuoixanhnhanhngon --grep "@ui"
```

Chay ca 2 project retailer:

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=hangthietyeu --project=tuoixanhnhanhngon --grep "@ui"
```

Gia lap/chay du 7 Playwright project:

```powershell
npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=tuoixanhnhanhngon --project=tegianoitro --project=danongdichthuc --project=hangthietyeu --project=nhanquocdan --project=si --project=thegioiphaidep --grep "@ui"
```

### Kich ban

Moi project se mo `baseURL` rieng, sau do chay lan luot cac tab da cau hinh va reset ve `baseURL` giua cac tab de tranh popup hoa don cu chan UI:

```text
hangthietyeu/tuoixanhnhanhngon:
tui don ghep -> them san pham dau tien -> chon qua dau tien -> dat hang -> xac nhan thanh toan -> nhap thong tin -> xac nhan -> chup hoa don -> dong popup
tui doi -> lap lai flow
tui da dung -> lap lai flow
```

### Report

```text
test-results/report/pass/<project>-gift-order-tabs-report.json
test-results/report/pass/<project>-gift-orde-don-ghep.png
test-results/report/pass/<project>-gift-orde-doi.png
test-results/report/pass/<project>-gift-orde-da-dung.png
```

## MLBL gift order k6

Muc dich: load test API MLBL gift order.

### Setup

- Can k6 binary tai `tools/k6/k6.exe`.
- Data path duoc resolve theo `--project` trong `test-data/json/mlbl-gift-order-config.json`.
- `si` dung `test-data/json/mlbl-gift-order-si.json`; cac project khac fallback ve `test-data/json/mlbl-gift-order-retailer.json` neu khong khai bao rieng.
- Base URL duoc lay tu `BASE_URL_<PROJECT>` trong `test-data/env/.env`, co the override bang `K6_MLBL_BASE_URL`.
- Co the override bang env:

```text
K6_PROJECT_NAME
K6_MLBL_DATA_PATH
K6_MLBL_BASE_URL
K6_TOTAL_ORDERS
K6_RATE_PER_SECOND
K6_MAX_VUS
MLBL_GIFT_ORDER_CUSTOMER_NAME
MLBL_GIFT_ORDER_CUSTOMER_PHONE
MLBL_GIFT_ORDER_CUSTOMER_ADDRESS
MLBL_GIFT_ORDER_GIFT_RECEIVER_NAME
MLBL_GIFT_ORDER_GIFT_RECEIVER_PHONE
MLBL_GIFT_ORDER_PAYMENT_METHOD
```

K6 MLBL gift order dung chung cac bien `MLBL_GIFT_ORDER_*` voi Playwright API flow; cac bien cu `K6_CUSTOMER_*` va `K6_GIFT_RECEIVER_*` van duoc fallback neu da set tu truoc.

### Lenh run

```powershell
npm run k6:mlbl-gift-order
npm run k6:mlbl-gift-order:json
npm run k6:mlbl-gift-order:smoke
```

Chi ro project:

```powershell
node scripts/run-k6-mlbl-gift-order.js --project si --json
node scripts/run-k6-mlbl-gift-order.js --project hangthietyeu --json
node scripts/run-k6-mlbl-gift-order.js --project tuoixanhnhanhngon --json
```

Chay smoke nho truoc khi load that:

```powershell
node scripts/run-k6-mlbl-gift-order.js --project si --json --smoke
node scripts/run-k6-mlbl-gift-order.js --project hangthietyeu --json --smoke
node scripts/run-k6-mlbl-gift-order.js --project tuoixanhnhanhngon --json --smoke
```

Chay qua npm script van truyen project bang `--`:

```powershell
npm run k6:mlbl-gift-order:smoke -- --project si
npm run k6:mlbl-gift-order:smoke -- --project hangthietyeu
npm run k6:mlbl-gift-order:smoke -- --project tuoixanhnhanhngon
npm run k6:mlbl-gift-order:json -- --project hangthietyeu
```

### Report

```text
test-results/report/k6/<project>-mlbl-gift-order-load-report.md
test-results/report/k6/<project>-mlbl-gift-order-load-report.json
test-results/report/k6/<project>-mlbl-gift-order-load-metrics.json
test-results/report/k6/<project>-mlbl-gift-order-load-summary.json
```

## Bang lenh nhanh

| Muc dich | Lenh |
| --- | --- |
| Xem danh sach test | `npm run test:list` |
| Chay full Playwright suite | `npm test` |
| Invoice UI | `npm run test:checkout-invoice -- --project=si` |
| Copy UI | `npm run test:copy-qr -- --project=si` |
| Bulk checkout UI | `npm run test:checkout-bulk -- --project=si` |
| API template guest | `npm run test:api-checkout-k6-template:guest -- --project=si` |
| API template login | `npm run test:api-checkout-k6-template:login -- --project=si` |
| API performance guest | `npm run test:api-checkout-performance:guest -- --project=si` |
| MLBL gift order API - si | `npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --grep "should create an SI order" --project=si` |
| MLBL gift order UI - hangthietyeu | `npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=hangthietyeu --grep "@ui"` |
| MLBL gift order UI - tuoixanhnhanhngon | `npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=tuoixanhnhanhngon --grep "@ui"` |
| k6 MLBL gift order - si | `npm run k6:mlbl-gift-order:smoke -- --project si` |
| k6 MLBL gift order - hangthietyeu | `npm run k6:mlbl-gift-order:smoke -- --project hangthietyeu` |
| k6 MLBL gift order - tuoixanhnhanhngon | `npm run k6:mlbl-gift-order:smoke -- --project tuoixanhnhanhngon` |
| API performance login | `npm run test:api-checkout-performance:login -- --project=si` |
| k6 checkout guest | `npm run k6:checkout:guest:json` |
| k6 checkout login | `npm run k6:checkout:login:json` |
| k6 MLBL gift order | `npm run k6:mlbl-gift-order:json` |
| Typecheck | `npm run typecheck` |
| Build k6 TypeScript | `npm run k6:build` |
| Cleanup screenshots | `npm run cleanup:screenshots` |

## Quy tac khi them test script moi

Khi phat sinh code tao test script moi:

- Bo sung guide vao dung flow lien quan: UI, API Playwright, API template, k6, hoac multi-scenario.
- Ghi du 4 muc ngan: muc dich, setup, lenh run, report/output.
- Khong can doc lai toan bo guide/repo neu script moi chi bo sung flow hien co.
- Chi doc/sua them run command cu khi script moi anh huong `package.json`, config, runner, report path, hoac command dang ton tai.
- Khong chay full suite de verify guide; uu tien doi chieu command nho nhat va spec lien quan.
