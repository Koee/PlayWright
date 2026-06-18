# MLBL Gift Order Scenario Cache Implementation Plan

> **Legacy note:** This old Superpowers plan is kept only as historical context. Do not treat it as the current workflow, do not invoke required Superpowers sub-skills from this file, and do not create new plans under `docs/superpowers/*` unless the user explicitly asks.

**Goal:** Build the MLBL SI gift-order API test so product/gift data is selected from a small scenario cache instead of being hardcoded directly in the test payload file.

**Architecture:** Keep the Playwright spec thin. Store scenario intent in `test-data/json/mlbl-gift-order-si.json`, store resolved product/gift combo rows in a small generated JSON cache, and let the payload helper resolve selector-based data before building the order payload. k6 uses the same scenario/cache shape so Playwright API and performance runs stay aligned.

**Tech Stack:** Playwright Test, TypeScript, Node fs/path helpers, k6 TypeScript scripts, JSON test data.

---

## Scope Guard

- Start from the MLBL files only: `tests/api/checkout/mlbl-gift-order-api.spec.ts`, `components/helpers/mlbl-gift-order-payload.ts`, `steps/mlbl-gift-order.steps.ts`, `performance/k6/mlbl-gift-order-load.ts`, and `test-data/json/mlbl-gift-order-si.json`.
- Do not read or parse large Excel files in this change.
- Do not change the existing checkout UI flow, generic checkout API template flow, Playwright config, or project list.
- Expand only to k6 runner/report files if verification shows the MLBL k6 script needs it.

## File Structure

- Create: `test-data/json/generated/si-mlbl-gift-combos.json`
  - Small cache of valid SI MLBL product/gift combos. This can later be generated from Excel/API without changing the spec.
- Modify: `test-data/json/mlbl-gift-order-si.json`
  - Scenario config containing `comboSource`, `productSelector`, and `giftSelector`.
- Modify: `components/helpers/mlbl-gift-order-payload.ts`
  - Resolve scenario data from inline products/gifts or from `comboSource`.
- Modify: `performance/k6/mlbl-gift-order-load.ts`
  - Resolve the same scenario/cache structure in k6 runtime.
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
  - Add behavior test proving selector/cache resolution works and keeps `skipDetail=false`.

---

### Task 1: Add Selector Cache Test

**Files:**
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
- Test: `tests/api/checkout/mlbl-gift-order-api.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
test('should resolve product and gift from scenario selector cache @checkout @mlbl-gift-order', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

    const scenario = loadMlblGiftOrderData();
    const resolved = resolveMlblGiftOrderScenario(scenario);

    expect(scenario.products).toBeUndefined();
    expect(scenario.gifts).toBeUndefined();
    expect(resolved.products[0].sku).toBe('40000263');
    expect(resolved.gifts[0].sku).toBe('SPE0000450');
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "selector cache"
```

Expected:

```text
TypeError: resolveMlblGiftOrderScenario is not a function
```

---

### Task 2: Convert SI Data To Scenario Config

**Files:**
- Modify: `test-data/json/mlbl-gift-order-si.json`
- Create: `test-data/json/generated/si-mlbl-gift-combos.json`

- [x] **Step 1: Replace inline product/gift rows with selectors**

`test-data/json/mlbl-gift-order-si.json` should contain:

```json
{
  "projectName": "si",
  "apiPath": "/api",
  "token": "a8F3kL9xQ2pZ7mN4",
  "orderCodePrefix": "ONLINE-MLBL-CSB2B",
  "customer": {
    "name": "",
    "phone": "",
    "address": ""
  },
  "paymentMethod": "ACB",
  "staff": {
    "staffName": "CAO QUANG VINH",
    "staffCode": "IP6PFT",
    "staffEmail": "kiot.hcm.019.6.ntd@one-solution.vn",
    "kiotCode": "Kiot-HCM-019"
  },
  "targetGroup": {
    "maBich": "",
    "tenBich": "",
    "sizeBich": "",
    "nhomDoiTuong": "Si"
  },
  "giftBudget": 4898880,
  "comboSource": {
    "type": "json-cache",
    "path": "test-data/json/generated/si-mlbl-gift-combos.json"
  },
  "productSelector": {
    "sku": "40000263"
  },
  "giftSelector": {
    "sku": "SPE0000450"
  }
}
```

- [x] **Step 2: Add the cache file**

`test-data/json/generated/si-mlbl-gift-combos.json` should contain one known working SI combo with product `40000263` and gift `SPE0000450`.

---

### Task 3: Resolve Scenario Data In Playwright Helper

**Files:**
- Modify: `components/helpers/mlbl-gift-order-payload.ts`
- Test: `tests/api/checkout/mlbl-gift-order-api.spec.ts`

- [x] **Step 1: Add selector/cache types**

```ts
type MlblGiftOrderSelector = {
    sku?: string;
    sheetName?: string;
    nhanHang?: string;
};

type MlblGiftOrderComboSource = {
    type: 'json-cache';
    path: string;
};
```

- [x] **Step 2: Add resolver API**

```ts
export function resolveMlblGiftOrderScenario(data = loadMlblGiftOrderData()) {
    if (data.products?.length && data.gifts?.length) {
        return {
            products: data.products,
            gifts: data.gifts,
        };
    }

    if (!data.comboSource) {
        throw new Error('MLBL gift order data must define products/gifts or comboSource.');
    }

    const cache = readComboCache(data.comboSource);
    const combo = cache.combos.find(candidate => {
        return candidate.products.some(product => matchesSelector(product, data.productSelector))
            && candidate.gifts.some(gift => matchesSelector(gift, data.giftSelector));
    });

    if (!combo) {
        throw new Error(`Could not resolve MLBL gift order combo for project "${data.projectName}".`);
    }

    return {
        products: combo.products.filter(product => matchesSelector(product, data.productSelector)),
        gifts: combo.gifts.filter(gift => matchesSelector(gift, data.giftSelector)),
    };
}
```

- [x] **Step 3: Build payload from resolved scenario**

`buildMlblGiftOrderPayload()` should call `resolveMlblGiftOrderScenario(data)` and use `scenario.products` and `scenario.gifts`.

- [x] **Step 4: Verify selector test passes**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "selector cache"
```

Expected:

```text
1 passed
```

---

### Task 4: Resolve Scenario Data In k6

**Files:**
- Modify: `performance/k6/mlbl-gift-order-load.ts`
- Test: `tsconfig.k6.json`

- [x] **Step 1: Add k6-local selector/cache resolver**

The k6 script cannot import Node fs helpers, so it should use `open()` to read:

```ts
const data = JSON.parse(open(dataPath).replace(/^\uFEFF/, '')) as MlblGiftOrderData;
const scenario = resolveScenario(data);
```

- [x] **Step 2: Build k6 payload from resolved scenario**

`buildProducts()` should use `scenario.products`, and gift totals/items should use `scenario.gifts`.

- [x] **Step 3: Verify k6 TypeScript build**

Run:

```powershell
npm run k6:build
```

Expected:

```text
tsc --project tsconfig.k6.json
```

with exit code `0`.

---

### Task 5: End-To-End Verification

**Files:**
- Test: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
- Test: `performance/k6/mlbl-gift-order-load.ts`

- [x] **Step 1: Run TypeScript typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

```text
tsc --noEmit
```

with exit code `0`.

- [x] **Step 2: Run scoped Playwright spec**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si
```

Expected:

```text
3 passed
```

- [x] **Step 3: Run k6 smoke**

Run:

```powershell
npm run k6:mlbl-gift-order:smoke
```

Expected:

```text
checkout_orders_verified_created: 1
checkout_orders_failure: 0
```

---

## Self-Review

- Spec coverage: The plan covers scenario config, generated cache, Playwright resolver, k6 resolver, `skipDetail=false`, and scoped verification.
- Placeholder scan: No placeholder implementation steps remain.
- Type consistency: `resolveMlblGiftOrderScenario`, `comboSource`, `productSelector`, and `giftSelector` names match the implemented helper and tests.
- Scope check: No large Excel parsing was added. Existing checkout flows were not refactored.

## Notes

- This plan was saved after the implementation because the initial chat checklist was not persisted. The saved file records the intended execution sequence and the verification that was actually performed.
- No commit was created because repository rules say not to commit unless the user explicitly asks.

---

### Task 6: Scale Product Quantity From Requested Gift Quantity

**Files:**
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
- Modify: `components/helpers/mlbl-gift-order-payload.ts`
- Modify: `performance/k6/mlbl-gift-order-load.ts`
- Modify: `test-data/json/mlbl-gift-order-si.json`
- Modify: `docs/huong-dan-nguoi-moi.md`

- [x] **Step 1: Write the failing test**

```ts
test('should scale required product quantity when requested gift quantity increases @checkout @mlbl-gift-order', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

    const scenario = resolveMlblGiftOrderScenario({
        ...loadMlblGiftOrderData(),
        productSelector: { sku: '40000263' },
        giftSelector: { sku: 'SPE0000448', soLuong: 2 },
        products: [{ sku: '40000263', soLuong: 46 } as any],
        gifts: [{ sku: 'SPE0000448', soLuong: 1 } as any],
    });

    expect(scenario.products[0].soLuong).toBe(92);
    expect(scenario.gifts[0].soLuong).toBe(2);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "scale required product"
```

Expected first failure:

```text
Expected: 92
Received: 46
```

- [x] **Step 3: Implement quantity scaling**

Resolver treats `giftSelector.soLuong` as the requested gift quantity, not as a cache match key. Product and gift quantities are multiplied by:

```text
requested gift quantity / base gift quantity
```

- [x] **Step 4: Verify**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si
npm run typecheck
npm run k6:build
npm run k6:mlbl-gift-order:smoke
```

Expected:

```text
4 passed
typecheck pass
k6 build pass
k6 smoke verified created 1 order
```

---

### Task 7: Make Combo Quantity Rule Explicit

**Files:**
- Modify: `test-data/json/generated/si-mlbl-gift-combos.json`
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
- Modify: `components/helpers/mlbl-gift-order-payload.ts`
- Modify: `performance/k6/mlbl-gift-order-load.ts`
- Modify: `docs/huong-dan-nguoi-moi.md`

- [x] **Step 1: Write the failing test**

```ts
test('should prefer explicit combo rule quantities over product and gift row quantities @checkout @mlbl-gift-order', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

    const scenario = resolveMlblGiftOrderScenario({
        ...loadMlblGiftOrderData(),
        productSelector: { sku: '40000263' },
        giftSelector: { sku: 'SPE0000448', soLuong: 2 },
        products: [{ sku: '40000263', soLuong: 1 } as any],
        gifts: [{ sku: 'SPE0000448', soLuong: 1 } as any],
        rule: {
            requiredProductQuantity: 77,
            rewardGiftQuantity: 1,
        },
    });

    expect(scenario.products[0].soLuong).toBe(154);
    expect(scenario.gifts[0].soLuong).toBe(2);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "explicit combo rule"
```

Expected first failure:

```text
Expected: 154
Received: 2
```

- [x] **Step 3: Add explicit rule schema**

Cache combo should use:

```json
"rule": {
  "requiredProductQuantity": 77,
  "rewardGiftQuantity": 1
}
```

The resolver should prefer `rule` over row `soLuong` when calculating product/gift quantities.

- [x] **Step 4: Verify**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "explicit combo rule"
npm run typecheck
npm run k6:build
```

Expected:

```text
explicit combo rule test pass
typecheck pass
k6 build pass
```

---

## Follow-Up Plans

- Single editable config work was split into `docs/superpowers/plans/2026-06-16-mlbl-gift-order-single-config.md` to keep this original scenario-cache plan from growing too large.
- Future changes that are not directly about the original scenario-cache implementation should get a new focused plan file, or a short changelog note only.
