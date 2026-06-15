# Playwright QA Automation

## Structure

- `tests/ui`: Playwright UI specs for checkout and copy flows.
- `tests/api`: Playwright API specs for smoke checks, API template detection, and test data preparation.
- `performance/k6`: k6 load-test scripts. Playwright prepares/smokes API templates; k6 sends load and measures performance.
- `components/helpers`: reusable browser/UI helpers shared across specs.
- `constants`: shared selectors and test id contracts.
- `config`: environment and runner constants used by `playwright.config.ts`.
- `utils`: reporting and non-page-specific utilities.
- `test-data`: data files and environment files under `test-data/env`.
- `scripts`: maintenance scripts.
- `rules`: QA/code review rules and onboarding guide.

New team members should start with `rules/huong-dan-nguoi-moi.md`.
For checkout API performance, read `docs/checkout-api-performance-guide.md`.

## Commands

```bash
npm test
npm run test:checkout
npm run test:copy
npm run test:ui-bulk -- --grep "@sequential"
npm run test:ui-bulk -- --grep "@performance"
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-login" --project=si
npx playwright test tests/api/checkout/checkout-api-performance.spec.ts --grep "@api-performance-guest" --project=si
npx playwright test tests/api/checkout/checkout-api-performance.spec.ts --grep "@api-performance-login" --project=si
npm run k6:checkout
npm run k6:checkout:login
npm run k6:checkout:json
npm run cleanup:screenshots
npm run test:list
npm run typecheck
```

Current spec paths are:

- `tests/ui/checkout/checkout-flow.spec.ts`
- `tests/ui/checkout/copy-functionality.spec.ts`
- `tests/api/checkout/checkout-api-template.spec.ts`
- `tests/api/checkout/checkout-api-performance.spec.ts`

If Playwright reports `No tests found`, first run `npm run test:list` from the project root and make sure the command is not using old paths such as `tests/checkout/*.spec.ts`.

Full checkout tests complete real user flows against configured URLs. Run them only against safe test/staging environments.

## Performance Flow

1. Choose checkout mode: `guest` for direct checkout without login, or `login` for checkout that requires token.
2. Playwright API logs in and gets a token only in `login` mode.
3. Playwright detects the real checkout order request through one UI flow, smokes one API order, and exports payload/template for k6.
4. k6 reads the generated template and sends load.
5. k6 evaluates thresholds and writes reports.
6. Playwright UI keeps representative browser checks, such as smoke checkout or 1-3 bulk orders.

Current allocation:

- UI test entrypoints live in `tests/ui`.
- API test entrypoints live in `tests/api`.
- Reusable Playwright flow helpers live in `steps`.
- Page objects and browser helpers remain in `components`.
- Load-test scripts live in `performance/k6`.

The project already had `components` and `steps` before k6 was added, so this keeps the existing Playwright architecture stable while separating UI/API/performance entrypoints clearly.

Prepare a k6 template for direct checkout without login:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-guest" --project=si
```

Prepare a k6 template for checkout with login/token:

```bash
npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-login" --project=si
```

Run Playwright API batch only, without k6:

```bash
npx playwright test tests/api/checkout/checkout-api-performance.spec.ts --grep "@api-performance-guest" --project=si
npx playwright test tests/api/checkout/checkout-api-performance.spec.ts --grep "@api-performance-login" --project=si
```

Run k6 against the generated guest template:

```bash
npm run k6:checkout
```

Run k6 against the generated login template:

```bash
npm run k6:checkout:login
```

Run k6 and also stream raw metric samples to JSON:

```bash
npm run k6:checkout:json
npm run k6:checkout:login:json
```

`npm run k6:checkout` uses the portable k6 binary at `tools/k6/k6.exe`, so it does not require k6 to be installed globally in Windows `PATH`.

Optional k6 environment values:

```bash
K6_PROJECT_NAME=si K6_TOTAL_ORDERS=200 K6_RATE_PER_SECOND=20 K6_MAX_VUS=50 npm run k6:checkout
```

PowerShell:

```powershell
$env:K6_PROJECT_NAME='si'
$env:K6_TOTAL_ORDERS='200'
$env:K6_RATE_PER_SECOND='20'
$env:K6_MAX_VUS='50'
npm run k6:checkout
```

If you need to point k6 to a specific generated template:

```powershell
$env:K6_CHECKOUT_TEMPLATE_PATH='test-data/k6/si-guest-checkout-order-api-template.json'
npm run k6:checkout
```

Playwright API login env for `login` mode:

```bash
CHECKOUT_API_LOGIN_URL=https://example.test/api/login
CHECKOUT_API_LOGIN_METHOD=POST
CHECKOUT_API_LOGIN_BODY={"username":"test","password":"test"}
CHECKOUT_API_TOKEN_PATH=token
CHECKOUT_API_AUTH_HEADER_NAME=Authorization
CHECKOUT_API_TOKEN_PREFIX=Bearer
```

For k6 login mode, pass the runtime token through env instead of storing it in the generated template:

```powershell
$env:K6_AUTH_TOKEN='<token-from-login>'
npm run k6:checkout:login
```

Outputs:

- `test-data/k6/<project>-guest-checkout-order-api-template.json`: local generated payload template for direct checkout without login.
- `test-data/k6/<project>-login-checkout-order-api-template.json`: local generated payload template for checkout with login; auth token is supplied by env.
- `test-results/k6/checkout-order-load-summary.json`: k6 summary and threshold result from `handleSummary`.
- `test-results/k6/checkout-order-load-metrics.json`: raw k6 JSON samples when running `npm run k6:checkout:json`.

`test-data/k6` is ignored because generated templates can contain environment-specific endpoint and payload data. Do not commit or share generated templates without sanitizing them.
