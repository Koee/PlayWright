# Huong Dan Test Checkout API Performance

Tai lieu nay dung cho flow dat hang bang API khong mo nhieu UI. Playwright dung de tim API dat hang that va smoke test. k6 dung de ban tai nhieu request.

## 1. Cac Lenh Chay

Kiem tra k6 local trong du an:

```bash
npm run k6:version
```

Chay flow guest/no-login dung khuyen nghi:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
node scripts/run-k6-checkout.js --mode guest --project si --json
```

Neu chay project khac `si`, truyen dung project cho ca buoc Playwright template va k6 runner:

```bash
node scripts/run-k6-checkout.js --mode guest --project inter --json
```

Hoac dung npm script va truyen bien moi truong:

```powershell
$env:K6_PROJECT_NAME='inter'
npm run k6:checkout:guest:json
```

Runner k6 khong con mac dinh chay `si`. Neu khong truyen `--project`, khong set `K6_PROJECT_NAME`, va trong `test-data/k6` dang co nhieu template, runner se dung lai va yeu cau chon project/template ro rang. Cach nay tranh viec vua prepare template cho `hangthietyeu` nhung k6 lai replay nham template `si`.

Mac dinh k6 doc so don/rate tu `config/test.config.ts` qua `scripts/run-k6-checkout.js`:

```text
API_PERFORMANCE_CHECKOUT_ORDER_COUNT -> K6_TOTAL_ORDERS
API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND -> K6_RATE_PER_SECOND va K6_MAX_VUS
```

Kiem tra cau hinh k6 ma khong ban request:

```bash
node scripts/run-k6-checkout.js --mode guest --json --dry-run
```

Neu moi kiem tra setup k6/API, nen chay smoke nhe truoc se chi tao 1 don de kiem tra. Smoke van can template da duoc Playwright sinh truoc do:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
npm run k6:checkout:guest:smoke
```

Lenh Playwright dau tien se mo UI mot lan, dat 1 don de detect API dat hang that, smoke API 1 lan, va export template:

```text
test-data/k6/si-guest-checkout-order-api-template.json
```

Lenh k6 se doc template trong `test-data/k6` va ban tai API hang loat, khong mo UI. Report k6 nam o:

```text
test-results/k6/<project>-<mode>-checkout-order-load-report.md
test-results/k6/<project>-<mode>-checkout-order-load-report.json
test-results/k6/<project>-<mode>-checkout-order-load-summary.json
test-results/k6/<project>-<mode>-checkout-order-load-metrics.json
test-results/k6/<project>-<mode>-checkout-order-load-error-report.json
test-results/k6/<project>-<mode>-checkout-order-load-error-report.md
```

Nen doc theo thu tu:

1. `<project>-<mode>-checkout-order-load-report.md`: report tong hop de tester doc nhanh. File nay gom config, endpoint, pass/fail, so case thanh cong/that bai, breakdown nhom loi, threshold fail, p95, dropped iterations.
2. `<project>-<mode>-checkout-order-load-report.json`: cung noi dung voi file Markdown nhung de tool/CI doc.
3. `<project>-<mode>-checkout-order-load-summary.json`: raw summary cua k6, day du metric va threshold. File nay huu ich khi can debug sau hon.
4. `<project>-<mode>-checkout-order-load-metrics.json`: stream metric tung event/request khi chay voi `--json`. File nay lon hon, dung de doi soat tag nhu `order_code`.
5. `<project>-<mode>-checkout-order-load-error-report.*`: alias cu cua report tong hop, giu lai de khong pha workflow dang co.

Runner van ghi them alias cu `checkout-order-load-report.*`, `checkout-order-load-summary.json`, va `checkout-order-load-error-report.*` cho lan chay gan nhat. Khi so sanh nhieu project, dung file co prefix project de tranh doc nham.

Thu muc `test-results/k6-dist` khong phai report. Day la output build JavaScript tam thoi tu source TypeScript trong `performance/k6` de k6 co the chay. Neu can doc ket qua test, uu tien `test-results/k6`; chi xem `k6-dist` khi debug viec build/chay script.

Neu muon chay guest voi tham so rieng lon hon config tren PowerShell:

```powershell
$env:K6_TOTAL_ORDERS='200'
$env:K6_RATE_PER_SECOND='20'
$env:K6_MAX_VUS='50'
node scripts/run-k6-checkout.js --mode guest --project si --json
```

Neu can chi ro template:

```powershell
$env:K6_CHECKOUT_TEMPLATE_PATH='test-data/k6/si-guest-checkout-order-api-template.json'
npm run k6:checkout:guest:json
```

`K6_CHECKOUT_TEMPLATE_PATH` co the truyen theo path tu root project nhu tren. Runner se resolve thanh absolute path truoc khi chay k6, vi source TypeScript trong `performance/k6` duoc build ra `test-results/k6-dist`.

Luu y: template nam o `test-data/k6` de khong bi Playwright reset khi don thu muc `test-results`. Chi report/metrics moi nam trong `test-results/k6`.

Template trong `test-data/k6` la artifact local va dang bi `.gitignore`. File nay co the chua endpoint/payload theo moi truong test, nen khong commit hoac chia se neu chua sanitize. Khi export template, code se bo cac browser/auth header nhay cam nhu `authorization`, `cookie`, `sec-*`, `user-agent`, `referer`; tuy vay payload van co the chua data test/staging.

Script `npm run k6:*` da clear cac bien proxy `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` truoc khi chay. Neu khong clear, k6 co the di qua proxy local `127.0.0.1:9` va fail truoc khi request toi server.

Chay Playwright API batch guest rieng, khong qua k6:

```bash
npx playwright test tests/api/checkout/checkout-api-performance.spec.ts --grep "@api-performance-guest" --project=si
```

Lenh nay dung de debug API bang Playwright, co report rieng:

```text
test-results/api-performance/si-guest-checkout-api-performance-report.json
test-results/api-performance/si-guest-checkout-api-performance-report.md
```

Report nay duoc ghi truoc buoc assert cuoi, nen neu da detect duoc API va da co danh sach `results` thi van co report ke ca khi test fail do co order loi. File JSON gom:

```text
summary: tong hop total/attempted/success/failure/pass/status/duration
successes: toi da 50 order thanh cong dau tien
failures: toi da 50 order loi dau tien
results: toan bo ket qua tung order
```

File Markdown gom phan `First Successes` va `First Failures` de doc nhanh. Neu API tra HTTP 2xx nhung response body co `success=false`, order do van duoc tinh la fail va nam trong `failures` voi validation error:

```text
HTTP 2xx but response success field is false.
```

Neu khong detect duoc API tao don, test se ghi artifact loi rieng:

```text
test-results/api-performance/<project>-<mode>-checkout-api-detection-failure-*.json
test-results/api-performance/<project>-<mode>-checkout-api-detection-failure-*.md
test-results/err-screenshots/<project>-<mode>-checkout-api-detection-failure-*.png
```

Chay flow login/with-token:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-login" --project=si
npm run k6:checkout:login:json
```

Truoc khi chay login, can cau hinh env:

```env
CHECKOUT_API_LOGIN_URL=https://example.test/api/login
CHECKOUT_API_LOGIN_METHOD=POST
CHECKOUT_API_LOGIN_BODY={"username":"test","password":"test"}
CHECKOUT_API_TOKEN_PATH=token
CHECKOUT_API_AUTH_HEADER_NAME=Authorization
CHECKOUT_API_TOKEN_PREFIX=Bearer
```

Template login khong ghi token vao file. Truoc khi chay k6 login, truyen token runtime bang env:

```powershell
$env:K6_AUTH_TOKEN='<token-from-login>'
npm run k6:checkout:login:json
```

Lenh Playwright `@api-template-login` dung `CHECKOUT_API_*` de login va smoke API trong luc prepare template, nhung token do khong duoc luu ra file. Khi chay k6 login, can lay token moi tu API/login tool phu hop voi moi truong dang test va gan vao `K6_AUTH_TOKEN`. Neu header/prefix khac mac dinh, co the override:

```powershell
$env:K6_AUTH_HEADER_NAME='Authorization'
$env:K6_AUTH_TOKEN_PREFIX='Bearer'
$env:K6_AUTH_TOKEN='<token-from-login>'
npm run k6:checkout:login:json
```

## 2. Huong Dan Doc Flow Code De Test API

Doc tu entrypoint truoc, helper sau.

File prepare template cho k6:

```text
tests/api/checkout/checkout-api-template.spec.ts
```

Flow guest trong file nay:

```text
detectCheckoutOrderApiRequest()
createCheckoutOrdersByDetectedApiBatch(..., 1, 1)
exportCheckoutApiPerformanceReport()
assertAllApiOrdersCreated(..., 1)
exportCheckoutOrderApiTemplate()
```

Y nghia:

- `detectCheckoutOrderApiRequest`: mo UI mot lan, dat hang that, bat request API dat hang.
- `createCheckoutOrdersByDetectedApiBatch(..., 1, 1)`: goi lai API 1 lan de smoke test.
- `exportCheckoutApiPerformanceReport`: ghi report smoke API vao `test-results/api-performance`, ke ca khi API fail. Report co ca `successes`, `failures`, va `results` day du.
- `assertAllApiOrdersCreated`: chi pass khi response co bang chung don da tao, khong chi dua vao HTTP 2xx.
- `exportCheckoutOrderApiTemplate`: ghi endpoint, payload, va cac header can replay cho k6 doc lai; khong ghi token login vao template.

File Playwright API batch:

```text
tests/api/checkout/checkout-api-performance.spec.ts
```

File nay dung khi muon debug dat nhieu don bang Playwright API. Khong phai flow chinh de ban tai.

Helper chinh:

```text
steps/checkout-api-performance.steps.ts
```

Nhung ham can doc:

- `detectCheckoutOrderApiRequest`: tim API dat hang that tu UI.
- `isLikelyCheckoutOrderRequest`: filter request, bo qua QR/payment-only API nhu `createQRCode`.
- API `updateOrderCustomer` bi chan vi chi cap nhat thong tin cho `orderCode` da co, khong tao them don moi.
- `replaceCustomerValues`: thay thong tin khach hang cho moi order moi.
- `createCheckoutOrdersByDetectedApiBatch`: goi API theo batch.
- `validateCheckoutOrderCreated`: xac nhan don da tao that bang response body. HTTP 2xx nhung `success=false`, `status=failed/fail/error/invalid`, hoac khong co bang chung tao don deu duoc tinh la fail.
- `exportCheckoutApiPerformanceReport`: ghi report debug vao `test-results/api-performance`.

File k6:

```text
performance/k6/checkout-order-load.ts
```

Helper k6:

```text
performance/k6/helpers/checkout-payload.ts
performance/k6/helpers/checkout-validation.ts
performance/k6/helpers/checkout-summary.ts
```

Flow k6:

```text
doc template tu test-data/k6
checkout-payload.ts build customer moi theo __VU/__ITER
checkout-payload.ts buildBody() thay thong tin khach hang/orderCode
http.request() goi API dat hang
checkout-validation.ts check status va response body co bang chung tao don
checkout-summary.ts build error report cho handleSummary()
```

Luu y quan trong:

- k6 khong mo UI.
- k6 khong tu detect API. No doc template do Playwright da export.
- k6 khong chi dua vao HTTP 2xx. No can response body co order id/success/status hop le de tinh la tao don thanh cong.
- k6 login mode khong tu login. Token duoc truyen qua `K6_AUTH_TOKEN` tai luc chay.
- Template cu co `createQRCode` se bi chan, vi do khong phai API tao don.
- Template co `updateOrderCustomer` cung se bi chan, vi replay template nay chi update cung mot don cu va khong lam tang so luong don.
- Data san pham trong payload phai la data test/staging dang ton tai tren du an de backend chap nhan request. Khong dua customer data, token, hoac production data that vao fixture/template da commit.
- Khi replay `insertOrder`, script se tao `orderCode` moi dung format UI: `ONLINE-...-ddMMyy-HHmmss-XXXXXX`.
- Neu payload co `orderData.products`, script se ep `skipDetail=false` de backend ghi dong tuong ung vao sheet `Order_details`.
- File metrics JSON cua k6 co tag `order_code` de doi soat ma don da ban tai.
- k6 report da tach case thanh cong/that bai:
  - `resultBreakdown.success`: request tao don da duoc verify thanh cong.
  - `resultBreakdown.failure`: request that bai.
  - `resultBreakdown.categories.verifiedCreated`: thanh cong vi response co bang chung tao don.
  - `resultBreakdown.categories.http4xx`: loi client/auth/payload/data validation.
  - `resultBreakdown.categories.http5xx`: loi server.
  - `resultBreakdown.categories.networkError`: loi network/chua nhan duoc HTTP status hop le.
  - `resultBreakdown.categories.validationFailed`: HTTP co the 2xx nhung body khong chung minh don da tao, `success=false`, `status=failed`, hoac thieu order id/evidence.

## 3. Huong Dan Chinh Sua, Them Moi O Cac Cho

Them site/project moi:

1. Them base URL vao:

```text
test-data/env/.env
```

Vi du:

```env
BASE_URL_INTER=https://inter.example.test
```

2. Them project vao:

```text
playwright.config.ts
```

3. Chay lai template theo project moi:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=inter
```

4. Chay k6 voi template moi:

```powershell
$env:K6_PROJECT_NAME='inter'
npm run k6:checkout:guest:json
```

Co the dung `K6_CHECKOUT_TEMPLATE_PATH` neu muon chi ro template rieng.

Chinh so luong va batch Playwright API:

```text
config/test.config.ts
```

Gia tri lien quan:

```ts
API_PERFORMANCE_CHECKOUT_ORDER_COUNT
API_PERFORMANCE_CHECKOUT_BATCH_SIZE
API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND
API_PERFORMANCE_CHECKOUT_BATCH_DELAY_MS
API_PERFORMANCE_CHECKOUT_MAX_CONSECUTIVE_FAILURES
```

Y nghia:

```text
API_PERFORMANCE_CHECKOUT_ORDER_COUNT: tong so don can tao.
API_PERFORMANCE_CHECKOUT_BATCH_SIZE: so request tao don chay song song trong moi batch Playwright.
API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND: so request/giay cua k6.
```

Chinh tai k6:

Mac dinh cac lenh `npm run k6:*` se lay `K6_TOTAL_ORDERS`, `K6_RATE_PER_SECOND`, va `K6_MAX_VUS` tu `config/test.config.ts`. Chi set env khi can override rieng cho k6:

```powershell
$env:K6_TOTAL_ORDERS='200'
$env:K6_RATE_PER_SECOND='20'
$env:K6_MAX_VUS='50'
npm run k6:checkout:guest:json
```

Chinh threshold k6:

```powershell
$env:K6_P95_THRESHOLD_MS='12000'
$env:K6_ERROR_RATE_THRESHOLD='0.01'
$env:K6_DROPPED_ITERATIONS_LIMIT='0'
npm run k6:checkout:guest:json
```

Y nghia loi threshold thuong gap:

- `http_req_duration` fail: API co tra 2xx nhung response time cham hon nguong. Vi du `p(95)<3000` fail khi 95% request cham nhat dang vuot 3 giay.
- `dropped_iterations` fail: k6 khong kip tao du request theo `K6_RATE_PER_SECOND` voi `K6_MAX_VUS` hien tai. Khi gap loi nay, nen giam `K6_RATE_PER_SECOND`, tang `K6_MAX_VUS`, hoac chap nhan rang he thong dang khong dap ung muc tai do.
- `http_req_failed` fail: co request HTTP loi/non-2xx.
- `checks` fail: API khong thoa dieu kien check trong script.
  - k6 co 2 check chinh: HTTP 2xx va response body chung minh don da tao.

Khi k6 fail do loi he thong/API, doc nhanh file:

```text
test-results/k6/<project>-<mode>-checkout-order-load-report.md
```

File nay tom tat:

- So case thanh cong/that bai.
- Breakdown theo nhom `verified_created`, `http_4xx`, `http_5xx`, `network_error`, `validation_failed`.
- So request HTTP 2xx/4xx/5xx.
- Network errors.
- Dropped iterations.
- Threshold nao fail.
- p95 response time hien tai.

File cu `test-results/k6/checkout-order-load-error-report.md` van duoc ghi voi cung noi dung cua lan chay gan nhat. Neu chi can mot file de gui cho team, dung file co prefix project, vi du `si-guest-checkout-order-load-report.md`.

Neu k6 fail ngay tu dau vi khong tim thay template, hay chay lai lenh Playwright template truoc:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
```

Loi thieu template xay ra o buoc init script nen k6 chua vao duoc `handleSummary` de ghi report.

Chinh dieu kien xac nhan don da tao that:

```text
test-data/env/.env
```

Neu response API co order id:

```env
CHECKOUT_API_ORDER_ID_PATH=data.order_id
```

Neu response dung field khac:

```env
CHECKOUT_API_SUCCESS_PATH=success
CHECKOUT_API_STATUS_PATH=status
```

Vi du response:

```json
{
  "success": true,
  "data": {
    "order_id": 12345
  }
}
```

Thi cau hinh:

```env
CHECKOUT_API_ORDER_ID_PATH=data.order_id
```

k6 se tu map cac bien tren sang `K6_ORDER_ID_PATH`, `K6_SUCCESS_PATH`, va `K6_STATUS_PATH` qua `scripts/run-k6-checkout.js`. Dieu kien verify body nam trong:

```text
performance/k6/helpers/checkout-validation.ts
```

Neu muon override rieng cho k6:

```powershell
$env:K6_ORDER_ID_PATH='data.order_id'
$env:K6_SUCCESS_PATH='success'
$env:K6_STATUS_PATH='status'
npm run k6:checkout:guest:json
```

Chinh logic replace data khach hang:

```text
steps/checkout-api-performance.steps.ts
performance/k6/helpers/checkout-payload.ts
```

Nguyen tac:

- Chi replace field khach hang nhu phone, customerName, recipientName, address.
- Khong replace product name, product id, SKU, item, goods, cart.
- Data khach hang mac dinh khong con hardcode theo ten that. Co the cau hinh trong `test-data/env/.env`:

```env
CHECKOUT_API_CUSTOMER_NAME_PREFIX=Performance Test Customer
CHECKOUT_API_CUSTOMER_PHONE_PREFIX=099
CHECKOUT_API_CUSTOMER_ADDRESS=Performance Test Address
```

- `scripts/run-k6-checkout.js` tu map cac bien tren sang `K6_CUSTOMER_NAME_PREFIX`, `K6_CUSTOMER_PHONE_PREFIX`, va `K6_CUSTOMER_ADDRESS`. Neu muon override rieng cho k6 thi set truc tiep cac bien `K6_CUSTOMER_*`.
- Neu thay ten san pham bi doi thanh ten khach hang, kiem tra cac ham:
  - `isProductLikeKey`
  - `isCustomerNameKey`
  - `replaceCustomerValues`

Chinh report/error summary cua k6:

```text
performance/k6/helpers/checkout-summary.ts
```

File nay gom logic doc metrics, threshold fail, HTTP 4xx/5xx, network errors, dropped iterations, va Markdown report.

Chinh detector neu bat sai API:

```text
steps/checkout-api-performance.steps.ts
```

Kiem tra:

- `isLikelyCheckoutOrderRequest`
- `isQrOrPaymentOnlyRequest`

Neu template sinh ra co:

```json
{
  "action": "createQRCode"
}
```

thi detector dang bat sai API. Can sua filter de bat API tao don that, khong bat API QR/thanh toan.

Sau moi lan sua detector hoac replace payload, chay lai:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
```

Sau do moi chay k6:

```bash
npm run k6:checkout:guest:json
```
