Muc tieu:
- Dua SKU san pham, so luong san pham, SKU qua tang, so luong qua tang vao mot file config nho de de chinh.

Pham vi:
- tests/api/checkout/api-checkout-gift-order.spec.ts
- components/helpers/mlbl-gift-order-payload.ts
- test-data/json/mlbl-gift-order-config.json

Khong lam:
- Khong refactor flow API checkout khac.
- Khong chay full suite.
- Khong commit/push.

Huong sua:
- Them test cho config override SKU va so luong.
- Tao file config mac dinh cho MLBL gift order.
- Helper doc config va ap dung thanh so luong cuoi cung trong resolved scenario/payload.

Verify:
- npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=si --grep "config"
