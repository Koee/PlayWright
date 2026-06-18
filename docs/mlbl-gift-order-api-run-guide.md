# MLBL Gift Order API Run Guide

Tai lieu nay huong dan cach chay spec:

```text
tests/api/checkout/mlbl-gift-order-api.spec.ts
```

Flow hien tai ap dung cho project `si`.

## 1. Chinh config truoc khi chay

File config chinh:

```text
test-data/json/mlbl-gift-order-config.json
```

Vi du:

```json
{
  "productSku": "40000263",
  "productQuantity": 36,
  "giftSku": "SPE0000450",
  "giftQuantity": 1,
  "livePricing": {
    "enabled": true
  }
}
```

Y nghia:

- `productSku`: SKU san pham mua.
- `productQuantity`: so luong san pham gui vao payload.
- `giftSku`: SKU qua tang.
- `giftQuantity`: so luong qua tang gui vao payload.
- `livePricing.enabled=true`: mo trang SI de lay `giaSauKM` live theo SKU truoc khi tao don.

Luu y: `giftSku` phai ton tai trong data combo hien co. Neu config gift khong khop data, test se fail khi resolve gift.

## 2. Kiem tra nhanh, khong tao don that

Dung lenh nay de verify logic build payload, resolve SKU/quantity, va tinh gia live mock:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep-invert "create an SI order"
```

Lenh nay khong goi API tao don that.

## 3. Chay live tao 1 don SI

Dung lenh nay khi muon chay dung flow thuc te:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "create an SI order"
```

Flow se:

1. Mo trang SI.
2. Lay `giaSauKM` live theo `productSku`.
3. Build payload voi SKU/quantity trong `mlbl-gift-order-config.json`.
4. Goi API tao don.
5. Verify response co bang chung tao don.
6. Export report va template k6.

Khi thanh cong, console co log tuong tu:

```text
Resolved live MLBL giaSauKM for SKU 40000263: 2799360
MLBL gift order API JSON report: ...
MLBL gift order API Markdown report: ...
Exported MLBL gift order API template for k6: ...
```

## 4. Output can xem sau khi chay

Report API:

```text
test-results/api-performance/si-mlbl-gift-order-api-report.md
test-results/api-performance/si-mlbl-gift-order-api-report.json
```

Template k6 export tu Playwright:

```text
test-data/k6/si-mlbl-gift-order-api-template.json
```

Khi test fail, doc them:

```text
test-results/**/error-context.md
test-results/**/test-failed-*.png
```

## 5. Loi thuong gap

### Khong resolve duoc gia live

Loi:

```text
Could not resolve live giaSauKM for MLBL product SKU ...
```

Nguyen nhan thuong gap:

- Trang SI load cham hoac response/UI khong co du lieu SKU do.
- `productSku` khong co trong danh sach goi y mua hang hien tai.
- `livePricing.enabled=true` nhung khong co nguon de suy ra gia live.

Xu ly:

- Kiem tra lai `productSku` va `productQuantity`.
- Chay lai live command mot lan de loai tru loi load tam thoi.
- Neu chi muon dung gia fixture local, tam thoi set:

```json
"livePricing": {
  "enabled": false
}
```

### Gift SKU khong resolve duoc

Loi co dang:

```text
Could not resolve MLBL gift order gift SKU from config
```

Xu ly:

- Kiem tra `giftSku` trong `mlbl-gift-order-config.json`.
- Dam bao SKU nay ton tai trong `test-data/json/mlbl-gift-order-si.json` hoac cache combo dang duoc dung.

## 6. Luu y ve k6

Script hien co:

```powershell
npm run k6:mlbl-gift-order:smoke
npm run k6:mlbl-gift-order:json
```

Chi nen chay sau khi da hieu ro data k6 dang doc. Hien flow Playwright live la duong chinh de lay `giaSauKM` live va export template. Neu can ban tai k6 dung gia live moi nhat, hay chay Playwright live truoc de tao template moi, roi kiem tra lai k6 script/template truoc khi ban tai.

## 7. Thu tu khuyen nghi

Khi doi SKU/quantity:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep-invert "create an SI order"
```

Sau khi logic pass, chay live 1 don:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "create an SI order"
```

Sau khi co report/template moi, moi tinh toi k6 smoke neu can.
