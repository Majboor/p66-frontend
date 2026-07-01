# Tests

Automated test suite for the bringit frontend.

## Layout

- `tests/unit/` — [Vitest](https://vitest.dev) unit tests for the pure helpers
  (price formatting, slugs, search ranking, filters, menu variations) that the
  UI relies on. These import the real functions from `src/App.jsx`.
- `tests/e2e/` — [Playwright](https://playwright.dev) end-to-end tests that build
  the production bundle, serve it with `vite preview`, and drive the core user
  flows in a real Chromium browser: discovery/search, add-to-cart, cart
  persistence across reload, quantity changes, and the checkout → place-order
  flow.

## Running

```bash
npm run test:unit    # fast pure-function unit tests
npm run test:e2e     # full browser e2e (auto-builds + serves the app)
```

`npm test` runs the unit suite.

### Notes

- The e2e config auto-starts the app; no server needs to be running first. It
  listens on port `8492` by default (override with `PW_PORT`).
- To reuse a locally-installed Chromium instead of Playwright's download, set
  `PW_CHROMIUM_PATH` to the browser executable.

Both suites run in CI on every push and pull request — see
`.github/workflows/ci.yml`.
