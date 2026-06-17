# MLBL Gift Order Single Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse editable MLBL gift-order data into one scenario file so testers do not need to update SKU, gift quantity, and combo rule across multiple files.

**Architecture:** `test-data/json/mlbl-gift-order-si.json` becomes the single editable source for product, gift, quantity, and combo rule. The Playwright payload helper and k6 script prefer this `combo` shape, while legacy inline/cache resolution remains as fallback compatibility. The spec keeps small unit-level checks for single-config resolution and quantity scaling before running the live API order test.

**Tech Stack:** Playwright Test, TypeScript, Node fs/path helpers, k6 TypeScript scripts, JSON test data.

---

## Scope Guard

- Modify only MLBL gift-order files and docs.
- Do not parse large Excel/sheet files.
- Do not change generic checkout UI flow, generic checkout API template flow, Playwright project config, or env loading.
- Do not commit unless the user explicitly asks.

## File Structure

- Modify: `test-data/json/mlbl-gift-order-si.json`
  - Holds all editable MLBL SI combo data in one file.
- Modify: `components/helpers/mlbl-gift-order-payload.ts`
  - Resolves `data.combo` before legacy `products/gifts` or `comboSource`.
- Modify: `performance/k6/mlbl-gift-order-load.ts`
  - Mirrors the same `data.combo` resolution in k6.
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
  - Adds/updates tests for single-config resolution.
- Modify: `docs/huong-dan-nguoi-moi.md`
  - Documents that testers should edit one file for this flow.

---

### Task 1: Add Single-Config Test

**Files:**
- Modify: `tests/api/checkout/mlbl-gift-order-api.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
test('should resolve product and gift from a single scenario config @checkout @mlbl-gift-order', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

    const scenario = loadMlblGiftOrderData();
    const resolved = resolveMlblGiftOrderScenario(scenario);

    expect(scenario.comboSource).toBeUndefined();
    expect(scenario.combo.product.sku).toBe('40000263');
    expect(scenario.combo.gift.sku).toBe('SPE0000450');
    expect(resolved.products[0].sku).toBe('40000263');
    expect(resolved.gifts[0].sku).toBe('SPE0000450');
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "single scenario config"
```

Expected first failure:

```text
comboSource was still present in mlbl-gift-order-si.json
```

---

### Task 2: Convert SI Scenario JSON

**Files:**
- Modify: `test-data/json/mlbl-gift-order-si.json`

- [x] **Step 1: Put editable product, gift, and rule in one file**

Use this shape:

```json
{
  "giftQuantity": 1,
  "combo": {
    "rule": {
      "requiredProductQuantity": 7,
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

- [x] **Step 2: Remove active dependency on combo cache**

`test-data/json/mlbl-gift-order-si.json` should not require:

```json
"comboSource": {
  "type": "json-cache",
  "path": "test-data/json/generated/si-mlbl-gift-combos.json"
}
```

The generated cache file can remain in the repo for future automation, but it is not the editable source for this flow.

---

### Task 3: Update Playwright Resolver

**Files:**
- Modify: `components/helpers/mlbl-gift-order-payload.ts`

- [x] **Step 1: Add `combo` and `giftQuantity` support**

`MlblGiftOrderData` should allow:

```ts
giftQuantity?: number;
combo?: {
    name?: string;
    rule: MlblGiftOrderComboRule;
    product: MlblGiftOrderProduct;
    gift: MlblGiftOrderGift;
};
```

- [x] **Step 2: Prefer single config during resolution**

`resolveMlblGiftOrderScenario()` should first check `data.combo`, then fall back to legacy inline/cache resolution:

```ts
if (data.combo) {
    return scaleScenarioQuantities(
        [data.combo.product],
        [data.combo.gift],
        {
            ...data.giftSelector,
            soLuong: getScenarioGiftQuantity(data),
        },
        data.combo.rule,
    );
}
```

---

### Task 4: Update k6 Resolver

**Files:**
- Modify: `performance/k6/mlbl-gift-order-load.ts`

- [x] **Step 1: Mirror single-config support in k6**

k6 should parse the same `giftQuantity` and `combo` shape from `test-data/json/mlbl-gift-order-si.json`.

- [x] **Step 2: Keep fallback compatibility**

Legacy inline `products/gifts` and `comboSource` paths should remain supported so older local data does not crash unexpectedly.

---

### Task 5: Update Newcomer Guide

**Files:**
- Modify: `docs/huong-dan-nguoi-moi.md`

- [x] **Step 1: Document one-file editing**

The guide should say testers edit only:

```text
test-data/json/mlbl-gift-order-si.json
```

For:

```text
combo.product.sku
combo.gift.sku
combo.rule.requiredProductQuantity
combo.rule.rewardGiftQuantity
giftQuantity
```

---

### Task 6: Verification

**Files:**
- Test: `tests/api/checkout/mlbl-gift-order-api.spec.ts`
- Test: `performance/k6/mlbl-gift-order-load.ts`

- [x] **Step 1: Verify single-config test**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si --grep "single scenario config"
```

Expected:

```text
1 passed
```

- [x] **Step 2: Verify TypeScript and k6 build**

Run:

```powershell
npm run typecheck
npm run k6:build
```

Expected:

```text
typecheck pass
k6 build pass
```

- [x] **Step 3: Verify live MLBL API and k6 smoke**

Run:

```powershell
npx playwright test tests/api/checkout/mlbl-gift-order-api.spec.ts --project=si
npm run k6:mlbl-gift-order:smoke
```

Expected:

```text
5 passed
k6 smoke verified created 1 order
```

---

## Self-Review

- Spec coverage: Covers one-file editing, resolver priority, k6 parity, docs, and verification.
- Placeholder scan: No placeholder implementation steps remain.
- Type consistency: `giftQuantity`, `combo`, `rule.requiredProductQuantity`, and `rule.rewardGiftQuantity` match code and JSON.
- Scope check: No large Excel parsing or generic checkout flow changes were added.

## Notes

- This plan was split out from `2026-06-16-mlbl-gift-order-scenario-cache.md` to keep future plan reads smaller and reduce quota usage.
- The older scenario-cache plan should now receive only short changelog notes or links to follow-up plans.
