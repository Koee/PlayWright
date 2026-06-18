# MLBL Gift Order k6 Scenario

Muc tieu:
- Dong bo payload k6 MLBL gift order voi payload Playwright API vua sua.

Pham vi:
- Doc/sua `performance/k6/mlbl-gift-order-load.ts`.
- Them regression check nho trong `tests/api/checkout/mlbl-gift-order-api.spec.ts` neu can.
- Cap nhat `docs/repo-command-guide.md` chi khi guide thieu cach chay/verify cho flow k6 MLBL.

Khong lam:
- Khong chay k6 load/smoke that neu user chua yeu cau.
- Khong refactor flow k6 checkout khac.
- Khong sua config/env ngoai MLBL gift order.

Huong sua:
- RED: them check bat k6 source khong duoc gui cac tong tien hard-code cu.
- GREEN: sua k6 payload tinh `tongGiaTriDangBan`, `tongMuaLoi`, `tongGtQuaTang`, `tongGtQuaTangConLai` theo data product va `giftBudgetRate`.
- Verify: chay spec MLBL SI va `npm run k6:build`.
