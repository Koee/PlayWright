# Playwright QA Automation

## Structure

- `tests/checkout`: Playwright specs for checkout and copy flows.
- `components/helpers`: reusable browser/UI helpers shared across specs.
- `constants`: shared selectors and test id contracts.
- `config`: environment and runner constants used by `playwright.config.ts`.
- `utils`: reporting and non-page-specific utilities.
- `test-data`: data files and environment files under `test-data/env`.
- `scripts`: maintenance scripts.
- `rules`: QA/code review rules and onboarding guide.

New team members should start with `rules/huong-dan-nguoi-moi.md`.

## Commands

```bash
npm test
npm run test:checkout
npm run test:copy
npm run cleanup:screenshots
npm run test:list
npm run typecheck
```

Current spec paths are:

- `tests/checkout/checkout-flow.spec.ts`
- `tests/checkout/copy-functionality.spec.ts`

If Playwright reports `No tests found`, first run `npm run test:list` from the project root and make sure the command is not using the old paths `tests/checkout-flow.spec.ts` or `tests/copy-functionality.spec.ts`.

Full checkout tests complete real user flows against configured URLs. Run them only against safe test/staging environments.
