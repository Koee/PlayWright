Muc tieu:
- Khi chay MLBL gift order live, tu tim giaSauKM theo productSku va ap vao payload dat hang.

Pham vi:
- components/helpers/mlbl-gift-order-payload.ts
- steps/mlbl-gift-order.steps.ts
- tests/api/checkout/api-checkout-gift-order.spec.ts
- test-data/json/mlbl-gift-order-config.json

Khong lam:
- Khong doi flow checkout API performance khac.
- Khong chay full suite.
- Khong commit/push.

Huong sua:
- Them override giaSauKM live cho resolved product theo SKU.
- Khi mo trang MLBL, bat response va detect gia live theo SKU.
- Khi tao don API, bat buoc co gia live neu config bat livePricing.

Verify:
- npx playwright test tests/api/checkout/api-checkout-gift-order.spec.ts --project=si --grep-invert "create an SI order"
- npm run typecheck
