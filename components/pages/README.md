# Pages

Put page objects here.

A page object should expose user-level actions and page-level locators for one screen or route.

Example:

```text
CheckoutPage.ts
InvoicePage.ts
CopyPage.ts
```

Current flow ownership:

- `CheckoutPage.ts`: product tab, add product, proceed/confirm checkout, customer info.
- `InvoicePage.ts`: invoice popup/page detection, invoice screenshot capture, invoice/API error detection.
- `CopyPage.ts`: copy-card flow, QR/copy readiness, clipboard capture.
