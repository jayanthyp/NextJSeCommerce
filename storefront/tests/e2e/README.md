# End-to-end order journey test

A Playwright suite that drives a real browser through the full purchase
flow — browse a product, add to cart, fill in shipping, pick a delivery
method, pay, place the order, and land on the confirmation page — against
the actual running stack. No mocking: every request hits the real Next.js
storefront and the real Medusa backend behind it.

This is the same flow (and literally some of the same selectors) used to
manually find three real production bugs while building this project:
every product page 500ing on load, the same crash on category/collection
pages (`DYNAMIC_SERVER_USAGE` from combining `generateStaticParams` with
`searchParams`), and a broken Admin session cookie. Automating it turns
that into a regression test instead of something that only gets caught by
clicking around by hand.

## Prerequisites

1. **Node.js 20 or newer.** This is a hard requirement of `@playwright/test`
   itself (`engines.node: ">=20"`) — it will refuse to run on anything
   older. This is also already the floor for native Medusa backend
   development (see the main [README.md](../../../README.md#hot-reload)),
   so if you've set that up you already have it. Check with `node --version`.
2. **The stack is up and seeded.** From the repo root:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
   ```
   The storefront must be reachable at `http://localhost:3000` and the
   backend must have run the seed script — this suite buys the actual
   seeded "Medusa T-Shirt" product (see **Test data**, below).

## Setup (one-time)

From `storefront/`:

```bash
npm install
npx playwright install chromium
```

`playwright install` downloads a browser binary Playwright controls
directly — separate from any Chrome/Edge already on your machine, and
pinned to a version this exact `@playwright/test` release was tested
against.

## Running

```bash
npm run test:e2e            # headless, CLI output
npm run test:e2e:headed     # same, with a visible browser window
npm run test:e2e:ui         # Playwright's interactive UI mode — recommended
```

UI mode (`test:e2e:ui`) is the most useful for iterating: it timelines every
step, lets you replay actions, and shows the DOM/network at each point in
the run.

After any run, `npx playwright show-report` opens an HTML report with a
trace viewer for whatever passed or failed — including a screenshot, video,
and full network log automatically captured **on failure**.

## Running from VS Code

Install the official **Playwright Test for VSCode** extension
(`ms-playwright.playwright`). Once `@playwright/test` is in
`package.json` and `playwright.config.ts` exists at the storefront root
(both already true here), the extension auto-discovers
`tests/e2e/order-journey.spec.ts` in the Testing sidebar — run or debug
individual `test.step()`s directly from the gutter, no terminal needed.

## Test data

[fixtures/test-data.ts](fixtures/test-data.ts) hardcodes values that come
from the official Medusa seed script (`medusa/src/scripts/seed.ts`): the
`"t-shirt"` product handle and the `"de"` country code (the seed creates one
"Europe" region covering de/dk/es/fr/gb/it/se — there is no "us"). If you
reseed with different products or regions, update the constants there
rather than in the spec file. The test customer's email is timestamped per
run (`uniqueTestCustomer()`), so repeated runs never collide with a
previous run's order in Admin.

## Structure

```
tests/e2e/
├── fixtures/
│   └── test-data.ts              seeded product/region constants
├── pages/                        Page Object Model — one class per screen
│   ├── product-page.ts
│   ├── cart-page.ts
│   ├── checkout-page.ts
│   └── order-confirmation-page.ts
├── order-journey.spec.ts         the test itself, composed from the above
└── README.md                     this file
```

The whole journey lives in **one** test rather than several independent
ones: each checkout step genuinely depends on cart/session state the
previous step produced (you can't select a delivery method before an
address exists), so splitting it up would just mean re-deriving that state
at the start of every test. `test.step()` still gives per-stage results in
the report, so a failure at "Select payment method" reads as exactly that,
not as one opaque failure of the whole test.

## Troubleshooting

- **`Playwright requires Node.js 20 or higher`** — you're running an older
  Node in this terminal. Check `node --version`; install/switch to 20+
  (nvm, nvm-windows, or a direct download from nodejs.org).
- **Timeouts navigating to `localhost:3000`** — the stack isn't running.
  `docker compose -f docker-compose.yml -f docker-compose.local.yml ps`
  should show all four services `healthy`.
- **Fails at "Add product to cart" with a 404 or empty product page** — the
  backend hasn't been seeded, or was reseeded with different data than
  `fixtures/test-data.ts` expects.
- **`browserType.launch: Executable doesn't exist`** — run
  `npx playwright install chromium`; a `@playwright/test` version bump can
  require a different browser build than whatever's cached.
